import { prisma } from "../config/db";
import { TransactionType, WalletStatus } from "@prisma/client";

/**
 * Strict Financial Amount Sanitizer & Validator
 */
export const parseAndValidateAmount = (rawAmount: any): number => {
  if (
    rawAmount === null ||
    rawAmount === undefined ||
    typeof rawAmount === "boolean" ||
    typeof rawAmount === "object"
  ) {
    throw new Error("Invalid payload: Amount must be a valid numeric value.");
  }

  const strAmount = String(rawAmount).trim();
  const strictCurrencyRegex = /^\d+(\.\d{1,2})?$/;

  if (!strictCurrencyRegex.test(strAmount)) {
    throw new Error(
      `Invalid amount format: '${rawAmount}'. Amount must be a positive number with maximum 2 decimal places.`,
    );
  }

  const parsedNumber = Number(strAmount);

  if (parsedNumber <= 0 || !Number.isFinite(parsedNumber)) {
    throw new Error("Transaction amount must be strictly greater than $0.00.");
  }

  return parsedNumber;
};

/**
 * Enterprise P2P Atomic Wallet Transfer with Status Guarding
 */
export const executeAtomicTransfer = async (
  senderUserId: string,
  receiverUserId: string,
  rawAmount: any,
) => {
  if (
    !senderUserId ||
    typeof senderUserId !== "string" ||
    senderUserId.trim() === ""
  ) {
    throw new Error("Invalid Sender User ID.");
  }

  if (
    !receiverUserId ||
    typeof receiverUserId !== "string" ||
    receiverUserId.trim() === ""
  ) {
    throw new Error("Invalid Receiver User ID.");
  }

  if (senderUserId === receiverUserId) {
    throw new Error(
      "Self-transfer strictly prohibited. Sender and Receiver cannot be identical.",
    );
  }

  const transferAmount = parseAndValidateAmount(rawAmount);

  return await prisma.$transaction(async (tx) => {
    // 1. Acquire PostgreSQL Row Locks (FOR UPDATE)
    const lockOrder = [senderUserId, receiverUserId].sort();

    for (const userId of lockOrder) {
      await tx.$queryRaw`
        SELECT id FROM "Wallet" 
        WHERE "userId" = ${userId} 
        FOR UPDATE
      `;
    }

    // 2. Fetch Sender Wallet
    const senderWallet = await tx.wallet.findUnique({
      where: { userId: senderUserId },
    });

    if (!senderWallet) {
      throw new Error("Sender wallet record not found.");
    }

    // SAFEGUARD: STATUS CHECK (BLOCK RESTRICTED/FROZEN WALLETS FROM TRANSFERRING OUT)
    if (senderWallet.status === WalletStatus.RESTRICTED) {
      throw new Error(
        "Account RESTRICTED due to outstanding debt. Please deposit funds to clear debt before transferring.",
      );
    }

    if (senderWallet.status === WalletStatus.FROZEN) {
      throw new Error(
        "Account is FROZEN by administrative lock. Transactions prohibited.",
      );
    }

    // 3. 5-Second Short-Window Duplicate Check
    const fiveSecondsAgo = new Date(Date.now() - 5000);
    const recentDuplicate = await tx.walletTransaction.findFirst({
      where: {
        walletId: senderWallet.id,
        amount: transferAmount,
        type: TransactionType.DEBIT,
        createdAt: { gte: fiveSecondsAgo },
        description: { contains: receiverUserId },
      },
    });

    if (recentDuplicate) {
      throw new Error(
        "Duplicate transaction detected. Please wait 5 seconds before repeating exact transfer.",
      );
    }

    // 4. Verify Sender Balance
    const currentBalance = Number(senderWallet.balance);
    if (currentBalance < transferAmount) {
      throw new Error(
        `Insufficient funds. Available balance: $${currentBalance.toFixed(2)}, Required: $${transferAmount.toFixed(2)}`,
      );
    }

    // 5. Fetch Receiver Wallet
    const receiverWallet = await tx.wallet.findUnique({
      where: { userId: receiverUserId },
    });

    if (!receiverWallet) {
      throw new Error("Receiver wallet record not found.");
    }

    if (receiverWallet.status === WalletStatus.FROZEN) {
      throw new Error("Cannot send funds to a FROZEN receiver account.");
    }

    // 6. Perform Atomic Mutations
    const updatedSender = await tx.wallet.update({
      where: { userId: senderUserId },
      data: { balance: { decrement: transferAmount } },
    });

    const updatedReceiver = await tx.wallet.update({
      where: { userId: receiverUserId },
      data: { balance: { increment: transferAmount } },
    });

    // 7. Write Double-Entry Audit Log
    await tx.walletTransaction.create({
      data: {
        walletId: senderWallet.id,
        amount: transferAmount,
        type: TransactionType.DEBIT,
        description: `Transferred $${transferAmount.toFixed(2)} to User ID: ${receiverUserId}`,
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: receiverWallet.id,
        amount: transferAmount,
        type: TransactionType.CREDIT,
        description: `Received $${transferAmount.toFixed(2)} from User ID: ${senderUserId}`,
      },
    });

    return {
      senderBalance: Number(updatedSender.balance),
      receiverBalance: Number(updatedReceiver.balance),
      transferredAmount: transferAmount,
    };
  });
};
