import { prisma } from "../config/db";
import { TransactionType } from "@prisma/client";

/**
 * ============================================================================
 * SAFEGUARD 1: INPUT GUARD & SANITIZATION
 * ============================================================================
 * Sanitizes and strictly validates raw currency input before hitting the DB layer.
 * Rejects NaN, string symbols (+, -, *), alphabets (e.g., 'gh34'), zero/negative values,
 * and floating-point precision exploits (allows max 2 decimal places).
 */
export const parseAndValidateAmount = (rawAmount: any): number => {
  // Reject null, undefined, booleans, objects, or arrays
  if (
    rawAmount === null ||
    rawAmount === undefined ||
    typeof rawAmount === "boolean" ||
    typeof rawAmount === "object"
  ) {
    throw new Error("Invalid payload: Amount must be a valid numeric value.");
  }

  const strAmount = String(rawAmount).trim();

  // Strict Currency Regex: Only permits positive numbers with up to 2 decimal places (e.g., 10 or 10.50)
  // Blocks leading signs (+10, -10), operators (*10, (10), and alphabets (gh34)
  const strictCurrencyRegex = /^\d+(\.\d{1,2})?$/;

  if (!strictCurrencyRegex.test(strAmount)) {
    throw new Error(
      `Invalid amount format: '${rawAmount}'. Amount must be a positive number with maximum 2 decimal places.`
    );
  }

  const parsedNumber = Number(strAmount);

  if (parsedNumber <= 0 || !Number.isFinite(parsedNumber)) {
    throw new Error("Transaction amount must be strictly greater than $0.00.");
  }

  return parsedNumber;
};

/**
 * ============================================================================
 * ENTERPRISE-GRADE P2P ATOMIC WALLET TRANSFER SERVICE
 * ============================================================================
 * Executes a secure financial transfer between two user wallets.
 * 
 * Prevention Safeguards Enforced:
 * 1. Input Guard: Sanitizes currency and blocks self-transfers.
 * 2. Deadlock Prevention & Row Locking: Acquires deterministic PostgreSQL FOR UPDATE locks.
 * 3. 5-Second Short-Window Check: Blocks instantaneous duplicate transfers at DB level.
 * 4. Double-Entry Accounting: Creates immutable ledger entries for auditability.
 * 5. ACID Transactionality: Guarantees full rollback if any operational step fails.
 */
export const executeAtomicTransfer = async (
  senderUserId: string,
  receiverUserId: string,
  rawAmount: any
) => {
  // --------------------------------------------------------------------------
  // 1. DOMAIN VALIDATION CHECKS
  // --------------------------------------------------------------------------
  if (!senderUserId || typeof senderUserId !== "string" || senderUserId.trim() === "") {
    throw new Error("Invalid Sender User ID.");
  }

  if (!receiverUserId || typeof receiverUserId !== "string" || receiverUserId.trim() === "") {
    throw new Error("Invalid Receiver User ID.");
  }

  // Self-Transfer Prevention Guard
  if (senderUserId === receiverUserId) {
    throw new Error("Self-transfer strictly prohibited. Sender and Receiver cannot be identical.");
  }

  // Sanitize numeric payload against garbage/malicious inputs
  const transferAmount = parseAndValidateAmount(rawAmount);

  // --------------------------------------------------------------------------
  // 2. ATOMIC DATABASE TRANSACTION (ACID GUARANTEE)
  // --------------------------------------------------------------------------
  return await prisma.$transaction(async (tx) => {

    /**
     * SAFEGUARD 2: PESSIMISTIC ROW LOCKING & DEADLOCK PREVENTION
     * User IDs are sorted alphabetically before acquiring exclusive database row locks (`FOR UPDATE`).
     * Deterministic sorting ensures concurrent bidirectional transfers (User A -> B & User B -> A)
     * lock resources in identical order, eliminating database deadlocks.
     */
    const lockOrder = [senderUserId, receiverUserId].sort();

    for (const userId of lockOrder) {
      await tx.$queryRaw`
        SELECT id FROM "Wallet" 
        WHERE "userId" = ${userId} 
        FOR UPDATE
      `;
    }

    // Fetch Sender Wallet record after row lock acquisition
    const senderWallet = await tx.wallet.findUnique({
      where: { userId: senderUserId },
    });

    if (!senderWallet) {
      throw new Error("Sender wallet record not found.");
    }

    /**
     * SAFEGUARD 3: 5-SECOND SHORT-WINDOW DUPLICATE DETECTION
     * Acts as an in-database defense mechanism when idempotency headers are missing.
     * Checks if an identical transfer (same sender, same receiver, same amount) 
     * was successfully created within the last 5 seconds.
     */
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
      throw new Error("Duplicate transaction detected. Please wait 5 seconds before repeating the exact transfer.");
    }

    // Verify Sender Balance Sufficiency
    const currentBalance = Number(senderWallet.balance);
    if (currentBalance < transferAmount) {
      throw new Error(
        `Insufficient funds. Available balance: $${currentBalance.toFixed(2)}, Required: $${transferAmount.toFixed(2)}`
      );
    }

    // Fetch Receiver Wallet record
    const receiverWallet = await tx.wallet.findUnique({
      where: { userId: receiverUserId },
    });

    if (!receiverWallet) {
      throw new Error("Receiver wallet record not found.");
    }

    // --------------------------------------------------------------------------
    // 3. BALANCE MUTATION (ATOMIC DECREMENT / INCREMENT)
    // --------------------------------------------------------------------------
    const updatedSender = await tx.wallet.update({
      where: { userId: senderUserId },
      data: { balance: { decrement: transferAmount } },
    });

    const updatedReceiver = await tx.wallet.update({
      where: { userId: receiverUserId },
      data: { balance: { increment: transferAmount } },
    });

    // --------------------------------------------------------------------------
    // 4. DOUBLE-ENTRY LEDGER AUDIT TRAIL
    // --------------------------------------------------------------------------
    // Debit Record for Sender
    await tx.walletTransaction.create({
      data: {
        walletId: senderWallet.id,
        amount: transferAmount,
        type: TransactionType.DEBIT,
        description: `Transferred $${transferAmount.toFixed(2)} to User ID: ${receiverUserId}`,
      },
    });

    // Credit Record for Receiver
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