import { prisma } from "../config/db";
import { TransactionType, WalletStatus } from "@prisma/client";
import { parseAndValidateAmount } from "./atomic-wallet-transaction";

/**
 * SYSTEM RESERVE CONSTANTS
 */
const SYSTEM_RESERVE_EMAIL = "system.reserve@bank.internal";

/**
 * ============================================================================
 * DOUBLE-ENTRY TRANSACTION REVERSAL ENGINE
 * ============================================================================
 * Executes an automated reversal of an erroneous or duplicate transaction.
 */
export const executeTransactionReversal = async (
  originalTransactionId: string,
  idempotencyKey?: string
) => {
  if (!originalTransactionId || typeof originalTransactionId !== "string" || originalTransactionId.trim() === "") {
    throw new Error("Invalid original transaction ID provided for reversal.");
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch Original Transaction with Sender User Details
    const originalTx = await tx.walletTransaction.findUnique({
      where: { id: originalTransactionId },
      include: {
        wallet: {
          include: { user: true },
        },
      },
    });

    if (!originalTx) {
      throw new Error(`Original transaction '${originalTransactionId}' not found.`);
    }

    if (originalTx.type !== TransactionType.DEBIT) {
      throw new Error("Reversal can only be initiated from the primary DEBIT transaction entry.");
    }

    // GUARD: Prevent Double Reversal
    const existingReversal = await tx.walletTransaction.findFirst({
      where: {
        description: { contains: originalTransactionId },
        type: { in: [TransactionType.REVERSAL_CREDIT, TransactionType.REVERSAL_DEBIT] },
      },
    });

    if (existingReversal) {
      throw new Error(`Transaction '${originalTransactionId}' has already been reversed. Double-reversal strictly prohibited.`);
    }

    const reversalAmount = Number(originalTx.amount);

    // 2. Locate System Reserve Wallet
    const systemUser = await tx.user.findUnique({
      where: { email: SYSTEM_RESERVE_EMAIL },
      include: { wallet: true },
    });

    if (!systemUser || !systemUser.wallet) {
      throw new Error("System Reserve Float Wallet not initialized. Run seed script first.");
    }

    // 3. Extract Receiver User ID from Original Description
    const descriptionParts = originalTx.description.split("User ID: ");
    if (descriptionParts.length < 2) {
      throw new Error("Failed to parse receiver user ID from original transaction record.");
    }
    const receiverUserId = descriptionParts[1].replace(")", "").trim();

    // 4. Lock All Affected Wallets
    const senderWallet = originalTx.wallet;
    const lockOrder = [senderWallet.userId, receiverUserId, systemUser.id].sort();

    for (const uId of lockOrder) {
      await tx.$queryRaw`
        SELECT id FROM "Wallet" 
        WHERE "userId" = ${uId} 
        FOR UPDATE
      `;
    }

    const receiverWallet = await tx.wallet.findUnique({
      where: { userId: receiverUserId },
      include: { user: true },
    });

    if (!receiverWallet) {
      throw new Error("Target receiver wallet record not found for reversal.");
    }

    const freshSystemWallet = await tx.wallet.findUnique({
      where: { id: systemUser.wallet.id },
    });

    if (!freshSystemWallet) {
      throw new Error("System Reserve wallet record unavailable.");
    }

    // 5. Overdraft & Float Coverage Calculations
    const currentReceiverBalance = Number(receiverWallet.balance);
    let systemFloatContribution = 0;
    let newReceiverBalance = currentReceiverBalance - reversalAmount;

    if (newReceiverBalance < 0) {
      systemFloatContribution = Math.abs(newReceiverBalance);
    }

    // 6. Execute Balance Mutations
    const updatedSender = await tx.wallet.update({
      where: { id: senderWallet.id },
      data: { balance: { increment: reversalAmount } },
    });

    const updatedReceiver = await tx.wallet.update({
      where: { id: receiverWallet.id },
      data: {
        balance: newReceiverBalance,
        status: newReceiverBalance < 0 ? WalletStatus.RESTRICTED : receiverWallet.status,
      },
    });

    if (systemFloatContribution > 0) {
      await tx.wallet.update({
        where: { id: freshSystemWallet.id },
        data: { balance: { decrement: systemFloatContribution } },
      });
    }

    // 7. Write Double-Entry Reversal Ledger Records (With Names)
    await tx.walletTransaction.create({
      data: {
        walletId: senderWallet.id,
        amount: reversalAmount,
        type: TransactionType.REVERSAL_CREDIT,
        description: `REVERSAL REFUND: Recovered $${reversalAmount.toFixed(2)} from duplicate tx: ${originalTransactionId}`,
        senderName: receiverWallet.user.name,
        receiverName: senderWallet.user.name,
        idempotencyKey: idempotencyKey || null,
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: receiverWallet.id,
        amount: reversalAmount,
        type: TransactionType.REVERSAL_DEBIT,
        description: `REVERSAL CLAWBACK: Reclaimed $${reversalAmount.toFixed(2)} for duplicate tx: ${originalTransactionId}`,
        senderName: receiverWallet.user.name,
        receiverName: senderWallet.user.name,
        idempotencyKey: idempotencyKey || null,
      },
    });

    return {
      refundedUserBalance: Number(updatedSender.balance),
      defaulterUserBalance: Number(updatedReceiver.balance),
      defaulterStatus: updatedReceiver.status,
      systemFloatUsed: systemFloatContribution,
      reversedAmount: reversalAmount,
    };
  });
};

/**
 * ============================================================================
 * AUTOMATIC DEBT OFFSET & RECOVERY SERVICE
 * ============================================================================
 * Processes incoming wallet deposits with name logging.
 */
export const depositAndClearDebt = async (
  userId: string,
  rawAmount: any,
  idempotencyKey?: string
) => {
  const depositAmount = parseAndValidateAmount(rawAmount);

  return await prisma.$transaction(async (tx) => {
    const systemUser = await tx.user.findUnique({
      where: { email: SYSTEM_RESERVE_EMAIL },
      include: { wallet: true },
    });

    if (!systemUser || !systemUser.wallet) {
      throw new Error("System Reserve Float Wallet unavailable.");
    }

    const lockOrder = [userId, systemUser.id].sort();
    for (const uId of lockOrder) {
      await tx.$queryRaw`
        SELECT id FROM "Wallet" 
        WHERE "userId" = ${uId} 
        FOR UPDATE
      `;
    }

    const userWallet = await tx.wallet.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!userWallet) {
      throw new Error("User wallet record not found.");
    }

    const currentBalance = Number(userWallet.balance);
    let debtRepaidToSystem = 0;
    let finalUserBalance = currentBalance + depositAmount;
    let updatedStatus = userWallet.status;

    if (currentBalance < 0) {
      const activeDebt = Math.abs(currentBalance);

      if (depositAmount >= activeDebt) {
        debtRepaidToSystem = activeDebt;
        finalUserBalance = depositAmount - activeDebt;
        updatedStatus = WalletStatus.ACTIVE;
      } else {
        debtRepaidToSystem = depositAmount;
        finalUserBalance = currentBalance + depositAmount;
      }

      await tx.wallet.update({
        where: { id: systemUser.wallet.id },
        data: { balance: { increment: debtRepaidToSystem } },
      });
    }

    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: {
        balance: finalUserBalance,
        status: updatedStatus,
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: userWallet.id,
        amount: depositAmount,
        type: TransactionType.CREDIT,
        description: debtRepaidToSystem > 0
          ? `DEPOSIT & DEBT CLEARANCE: $${debtRepaidToSystem.toFixed(2)} auto-diverted to clear system debt.`
          : `STANDARD DEPOSIT: Added $${depositAmount.toFixed(2)} to wallet balance.`,
        senderName: userWallet.user.name,
        receiverName: userWallet.user.name,
        idempotencyKey: idempotencyKey || null,
      },
    });

    return {
      newBalance: Number(updatedWallet.balance),
      walletStatus: updatedWallet.status,
      debtCleared: debtRepaidToSystem,
      depositedAmount: depositAmount,
    };
  });
};