import { prisma } from "../config/db";
import { TransactionType } from "@prisma/client";

/**
 * Strict Financial Amount Sanitizer & Validator
 * Rejects NaN, string symbols (+, -, *), alphabets, zero/negative amounts, and floating-point exploits.
 */
export const parseAndValidateAmount = (rawAmount: any): number => {
  // Reject null, undefined, booleans, objects, or arrays
  if (rawAmount === null || rawAmount === undefined || typeof rawAmount === "boolean" || typeof rawAmount === "object") {
    throw new Error("Invalid payload: Amount must be a valid numeric value.");
  }

  const strAmount = String(rawAmount).trim();

  // Strict Currency Regex: Only permits positive numbers with up to 2 decimal places (e.g., 10 or 10.50)
  // Blocks leading signs (+10, -10), special characters (*10, (10), and alphabets (gh34)
  const strictCurrencyRegex = /^\d+(\.\d{1,2})?$/;

  if (!strictCurrencyRegex.test(strAmount)) {
    throw new Error(`Invalid amount format: '${rawAmount}'. Amount must be a positive number with maximum 2 decimal places.`);
  }

  const parsedNumber = Number(strAmount);

  if (parsedNumber <= 0 || !Number.isFinite(parsedNumber)) {
    throw new Error("Transaction amount must be strictly greater than $0.00.");
  }

  return parsedNumber;
};

/**
 * Enterprise-Grade P2P Atomic Wallet Transfer Logic
 * Implements Pessimistic Row Locks (FOR UPDATE), Deadlock Prevention, and ACID Transactions.
 */
export const executeAtomicTransfer = async (
  senderUserId: string,
  receiverUserId: string,
  rawAmount: any
) => {
  // 1. INPUT SANITIZATION & GUARD CHECKS
  if (!senderUserId || typeof senderUserId !== "string" || senderUserId.trim() === "") {
    throw new Error("Invalid Sender User ID.");
  }

  if (!receiverUserId || typeof receiverUserId !== "string" || receiverUserId.trim() === "") {
    throw new Error("Invalid Receiver User ID.");
  }

  if (senderUserId === receiverUserId) {
    throw new Error("Self-transfer strictly prohibited. Sender and Receiver cannot be identical.");
  }

  // Sanitize numeric payload against garbage/malicious inputs
  const transferAmount = parseAndValidateAmount(rawAmount);

  // 2. ATOMIC DATABASE TRANSACTION
  return await prisma.$transaction(async (tx) => {

    /**
     * DEADLOCK PREVENTION: Sort User IDs deterministically.
     * Prevents database deadlocks when two users initiate concurrent bidirectional transfers.
     */
    const lockOrder = [senderUserId, receiverUserId].sort();

    // Acquire Row Locks (FOR UPDATE) in sorted order
    for (const userId of lockOrder) {
      await tx.$queryRaw`
        SELECT id FROM "Wallet" 
        WHERE "userId" = ${userId} 
        FOR UPDATE
      `;
    }

    // Fetch Sender Wallet
    const senderWallet = await tx.wallet.findUnique({
      where: { userId: senderUserId },
    });

    if (!senderWallet) {
      throw new Error("Sender wallet record not found.");
    }

    // Verify Sufficient Balance
    const currentBalance = Number(senderWallet.balance);
    if (currentBalance < transferAmount) {
      throw new Error(`Insufficient funds. Available: $${currentBalance.toFixed(2)}, Required: $${transferAmount.toFixed(2)}`);
    }

    // Fetch Receiver Wallet
    const receiverWallet = await tx.wallet.findUnique({
      where: { userId: receiverUserId },
    });

    if (!receiverWallet) {
      throw new Error("Receiver wallet record not found.");
    }

    // Perform Atomic Balance Updates
    const updatedSender = await tx.wallet.update({
      where: { userId: senderUserId },
      data: { balance: { decrement: transferAmount } },
    });

    const updatedReceiver = await tx.wallet.update({
      where: { userId: receiverUserId },
      data: { balance: { increment: transferAmount } },
    });

    // Create Double-Entry Ledger Records
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