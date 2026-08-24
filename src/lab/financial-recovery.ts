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
 * 
 * Financial Safeguards Enforced:
 * 1. Zero-Sum Ledger Integrity: Original sender receives 100% refund immediately.
 * 2. Overdraft & Debt Management: Allows defaulter balance to drop negative (e.g., -$70.00).
 * 3. System Reserve Float Intermediary: System float covers temporary deficits.
 * 4. Automatic Account Restriction: Defaulter wallet status updated to RESTRICTED upon debt.
 */
export const executeTransactionReversal = async (originalTransactionId: string) => {
  if (!originalTransactionId || typeof originalTransactionId !== "string") {
    throw new Error("Invalid original transaction ID provided for reversal.");
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch Original Transaction
    const originalTx = await tx.walletTransaction.findUnique({
      where: { id: originalTransactionId },
      include: { wallet: true },
    });

    if (!originalTx) {
      throw new Error(`Original transaction '${originalTransactionId}' not found.`);
    }

    if (originalTx.type !== TransactionType.DEBIT) {
      throw new Error("Reversal can only be initiated from the primary DEBIT transaction entry.");
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
    // Description pattern: "Transferred $X to User ID: <RECEIVER_USER_ID>"
    const descriptionParts = originalTx.description.split("User ID: ");
    if (descriptionParts.length < 2) {
      throw new Error("Failed to parse receiver user ID from original transaction record.");
    }
    const receiverUserId = descriptionParts[1].trim();

    // 4. Lock All Affected Wallets (Original Sender, Erroneous Receiver, System Reserve)
    const senderWallet = originalTx.wallet;
    const lockOrder = [senderWallet.userId, receiverUserId, systemUser.id].sort();

    for (const uId of lockOrder) {
      await tx.$queryRaw`
        SELECT id FROM "Wallet" 
        WHERE "userId" = ${uId} 
        FOR UPDATE
      `;
    }

    // Fetch Receiver Wallet after lock
    const receiverWallet = await tx.wallet.findUnique({
      where: { userId: receiverUserId },
    });

    if (!receiverWallet) {
      throw new Error("Target receiver wallet record not found for reversal.");
    }

    // Fetch Fresh System Wallet State
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

    // Check if receiver needs System Float coverage for deficit
    if (newReceiverBalance < 0) {
      systemFloatContribution = Math.abs(newReceiverBalance);
    }

    // 6. Execute Balance Mutations
    // Refund Original Sender in Full (+reversalAmount)
    const updatedSender = await tx.wallet.update({
      where: { id: senderWallet.id },
      data: { balance: { increment: reversalAmount } },
    });

    // Deduct Reversal Amount from Erroneous Receiver (Can result in Negative Balance)
    const updatedReceiver = await tx.wallet.update({
      where: { id: receiverWallet.id },
      data: {
        balance: newReceiverBalance,
        status: newReceiverBalance < 0 ? WalletStatus.RESTRICTED : receiverWallet.status,
      },
    });

    // Deduct Deficit Float from System Reserve Wallet if applicable
    if (systemFloatContribution > 0) {
      await tx.wallet.update({
        where: { id: freshSystemWallet.id },
        data: { balance: { decrement: systemFloatContribution } },
      });
    }

    // 7. Write Double-Entry Reversal Ledger Records
    await tx.walletTransaction.create({
      data: {
        walletId: senderWallet.id,
        amount: reversalAmount,
        type: TransactionType.REVERSAL_CREDIT,
        description: `REVERSAL REFUND: Recovered $${reversalAmount.toFixed(2)} from duplicate tx: ${originalTransactionId}`,
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: receiverWallet.id,
        amount: reversalAmount,
        type: TransactionType.REVERSAL_DEBIT,
        description: `REVERSAL CLAWBACK: Reclaimed $${reversalAmount.toFixed(2)} for duplicate tx: ${originalTransactionId}`,
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
 * Processes incoming wallet deposits. If the wallet carries a negative balance (debt),
 * funds are automatically diverted to repay the System Reserve Float first.
 */
export const depositAndClearDebt = async (userId: string, rawAmount: any) => {
  const depositAmount = parseAndValidateAmount(rawAmount);

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch System Reserve User
    const systemUser = await tx.user.findUnique({
      where: { email: SYSTEM_RESERVE_EMAIL },
      include: { wallet: true },
    });

    if (!systemUser || !systemUser.wallet) {
      throw new Error("System Reserve Float Wallet unavailable.");
    }

    // 2. Lock User and System Reserve Wallets
    const lockOrder = [userId, systemUser.id].sort();
    for (const uId of lockOrder) {
      await tx.$queryRaw`
        SELECT id FROM "Wallet" 
        WHERE "userId" = ${uId} 
        FOR UPDATE
      `;
    }

    const userWallet = await tx.wallet.findUnique({ where: { userId } });
    if (!userWallet) {
      throw new Error("User wallet record not found.");
    }

    const currentBalance = Number(userWallet.balance);
    let debtRepaidToSystem = 0;
    let finalUserBalance = currentBalance + depositAmount;
    let updatedStatus = userWallet.status;

    // 3. Debt Recovery Logic (If balance is negative)
    if (currentBalance < 0) {
      const activeDebt = Math.abs(currentBalance);

      if (depositAmount >= activeDebt) {
        // Full debt covered
        debtRepaidToSystem = activeDebt;
        finalUserBalance = depositAmount - activeDebt;
        updatedStatus = WalletStatus.ACTIVE; // Account un-restricted
      } else {
        // Partial debt covered
        debtRepaidToSystem = depositAmount;
        finalUserBalance = currentBalance + depositAmount; // Remains negative
      }

      // Reimbursing System Reserve Float
      await tx.wallet.update({
        where: { id: systemUser.wallet.id },
        data: { balance: { increment: debtRepaidToSystem } },
      });
    }

    // 4. Update User Wallet
    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: {
        balance: finalUserBalance,
        status: updatedStatus,
      },
    });

    // 5. Create Ledger Entry
    await tx.walletTransaction.create({
      data: {
        walletId: userWallet.id,
        amount: depositAmount,
        type: TransactionType.CREDIT,
        description: debtRepaidToSystem > 0
          ? `DEPOSIT & DEBT CLEARANCE: $${debtRepaidToSystem.toFixed(2)} auto-diverted to clear system debt.`
          : `STANDARD DEPOSIT: Added $${depositAmount.toFixed(2)} to wallet balance.`,
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