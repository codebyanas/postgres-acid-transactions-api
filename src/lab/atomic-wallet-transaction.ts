import { prisma } from "../config/db";
import { TransactionType, WalletStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

const SYSTEM_RESERVE_EMAIL = "system.reserve@bank.internal";

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
 * Enterprise P2P Atomic Wallet Transfer with Status Guarding & Bank Reserve Isolation
 */
export const executeAtomicTransfer = async (
  senderUserId: string,
  receiverUserId: string,
  rawAmount: any,
  idempotencyKey?: string,
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

  // return await prisma.$transaction(async (tx) => {
  return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // SYSTEM RESERVE ISOLATION GUARD
    const systemUser = await tx.user.findUnique({
      where: { email: SYSTEM_RESERVE_EMAIL },
      select: { id: true },
    });

    if (systemUser) {
      if (senderUserId === systemUser.id) {
        throw new Error(
          "System Reserve Float Wallet is prohibited from initiating standard P2P transfers.",
        );
      }
      if (receiverUserId === systemUser.id) {
        throw new Error(
          "Direct P2P transfers to System Reserve Float Wallet are strictly prohibited.",
        );
      }
    }

    // 1. Acquire PostgreSQL Row Locks (FOR UPDATE)
    const lockOrder = [senderUserId, receiverUserId].sort();

    for (const userId of lockOrder) {
      await tx.$queryRaw`
        SELECT id FROM "Wallet" 
        WHERE "userId" = ${userId} 
        FOR UPDATE
      `;
    }

    // 2. Fetch Sender Wallet with Soft-Delete & Lifecycle Guards
    const senderWallet = await tx.wallet.findFirst({
      where: {
        userId: senderUserId,
        deletedAt: null,
        user: {
          deletedAt: null,
        },
      },
      include: { user: true },
    });

    if (!senderWallet) {
      throw new Error(
        "Transaction failed: Sender wallet or user account is non-existent or soft-deleted.",
      );
    }

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

    if (senderWallet.status !== WalletStatus.ACTIVE) {
      throw new Error("Account is not ACTIVE. Transactions prohibited.");
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

    // 5. Fetch Receiver Wallet with Soft-Delete & Freeze Guards
    const receiverWallet = await tx.wallet.findFirst({
      where: {
        userId: receiverUserId,
        deletedAt: null,
        user: {
          deletedAt: null,
        },
      },
      include: { user: true },
    });

    if (!receiverWallet) {
      throw new Error(
        "Transaction failed: Receiver wallet or user account is non-existent or soft-deleted.",
      );
    }

    if (receiverWallet.status === WalletStatus.FROZEN) {
      throw new Error("Cannot send funds to a FROZEN receiver account.");
    }

    // 6. Perform Atomic Mutations
    const updatedSender = await tx.wallet.update({
      where: { id: senderWallet.id },
      data: { balance: { decrement: transferAmount } },
    });

    const updatedReceiver = await tx.wallet.update({
      where: { id: receiverWallet.id },
      data: { balance: { increment: transferAmount } },
    });

    // 7. Write Double-Entry Audit Log (With Names & Idempotency Key)
    await tx.walletTransaction.create({
      data: {
        walletId: senderWallet.id,
        amount: transferAmount,
        type: TransactionType.DEBIT,
        description: `Transferred $${transferAmount.toFixed(2)} to ${receiverWallet.user.name} (User ID: ${receiverUserId})`,
        senderName: senderWallet.user.name,
        receiverName: receiverWallet.user.name,
        idempotencyKey: idempotencyKey || null,
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: receiverWallet.id,
        amount: transferAmount,
        type: TransactionType.CREDIT,
        description: `Received $${transferAmount.toFixed(2)} from ${senderWallet.user.name} (User ID: ${senderUserId})`,
        senderName: senderWallet.user.name,
        receiverName: receiverWallet.user.name,
        idempotencyKey: idempotencyKey || null,
      },
    });

    return {
      senderBalance: Number(updatedSender.balance),
      receiverBalance: Number(updatedReceiver.balance),
      transferredAmount: transferAmount,
    };
  });
};
