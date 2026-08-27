import { Request, Response } from "express";
import { prisma } from "../config/db";
import { executeAtomicTransfer } from "../lab/atomic-wallet-transaction";
import { executeTransactionReversal, depositAndClearDebt } from "../lab/financial-recovery";
import { encodeCursor, decodeCursor } from "../utils/cursor.util";
import { createAuditLog } from "../utils/auditLogger.util";
import { AuditAction, WalletStatus } from "@prisma/client";
import { runReconciliationAudit } from "../jobs/reconciliation.cron";

/**
 * Controller endpoint wrapper for P2P Wallet Transfers.
 * Enforces mandatory idempotency key header validation.
 */
export const transferFunds = async (req: Request, res: Response): Promise<void> => {
  const { senderUserId, receiverUserId, amount } = req.body;
  const idempotencyKey = (req.headers["x-idempotency-key"] || req.headers["idempotency-key"]) as string | undefined;

  if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
    res.status(400).json({
      success: false,
      error: "Missing required header: 'x-idempotency-key' is mandatory for P2P wallet transfers.",
    });
    return;
  }

  try {
    const result = await executeAtomicTransfer(
      senderUserId,
      receiverUserId,
      amount,
      idempotencyKey.trim()
    );

    res.status(200).json({
      success: true,
      message: "Transfer executed successfully.",
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || "Transaction failed and was rolled back.",
    });
  }
};

/**
 * Controller endpoint wrapper for Transaction Reversal & Overdraft Recovery.
 * Enforces mandatory idempotency key header validation.
 */
export const reverseTransaction = async (req: Request, res: Response): Promise<void> => {
  const { transactionId } = req.body;
  const idempotencyKey = (req.headers["x-idempotency-key"] || req.headers["idempotency-key"]) as string | undefined;

  if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
    res.status(400).json({
      success: false,
      error: "Missing required header: 'x-idempotency-key' is mandatory for transaction reversal.",
    });
    return;
  }

  try {
    const result = await executeTransactionReversal(transactionId, idempotencyKey.trim());

    res.status(200).json({
      success: true,
      message: "Transaction reversal executed successfully.",
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || "Reversal operation failed.",
    });
  }
};

/**
 * Controller endpoint wrapper for User Wallet Deposit and Debt Auto-Clearance.
 * Enforces mandatory idempotency key header validation.
 */
export const depositFunds = async (req: Request, res: Response): Promise<void> => {
  const { userId, amount } = req.body;
  const idempotencyKey = (req.headers["x-idempotency-key"] || req.headers["idempotency-key"]) as string | undefined;

  if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
    res.status(400).json({
      success: false,
      error: "Missing required header: 'x-idempotency-key' is mandatory for deposits.",
    });
    return;
  }

  try {
    const result = await depositAndClearDebt(userId, amount, idempotencyKey.trim());

    res.status(200).json({
      success: true,
      message: "Deposit processed successfully.",
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || "Deposit processing failed.",
    });
  }
};

/**
 * Fetch ALL wallets with user details.
 */
export const getAllWallets = async (req: Request, res: Response): Promise<void> => {
  try {
    const wallets = await prisma.wallet.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      count: wallets.length,
      data: wallets,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Fetch single wallet by User ID.
 */
export const getWalletByUserId = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId as string;

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!wallet) {
      res.status(404).json({ success: false, message: "Wallet not found for this user." });
      return;
    }

    res.status(200).json({
      success: true,
      data: wallet,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Fetch historical wallet transactions with dual support for Offset and Seek (Cursor) pagination.
 * Includes precise DB execution timer (executionTimeMs) for Postman benchmarking.
 */
export const getWalletTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { walletId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const cursorParam = req.query.cursor as string | undefined;
    const skipParam = req.query.skip as string | undefined;

    let cursorObj: { id: string } | null = null;
    if (cursorParam) {
      cursorObj = decodeCursor<{ id: string }>(cursorParam);
      if (!cursorObj || !cursorObj.id) {
        res.status(400).json({
          success: false,
          error: "Invalid pagination cursor string provided.",
        });
        return;
      }
    }

    const startTime = performance.now();

    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: String(walletId) },
      take: limit + 1,
      ...(skipParam && !cursorObj
        ? { skip: parseInt(skipParam) }
        : cursorObj
        ? { cursor: { id: cursorObj.id }, skip: 1 }
        : {}),
      orderBy: { createdAt: "desc" },
    });

    const endTime = performance.now();
    const executionTimeMs = parseFloat((endTime - startTime).toFixed(3));

    const hasMore = transactions.length > limit;
    const data = hasMore ? transactions.slice(0, limit) : transactions;

    let nextCursor: string | null = null;
    if (hasMore && data.length > 0) {
      const lastItem = data[data.length - 1];
      nextCursor = encodeCursor({ id: lastItem.id });
    }

    res.status(200).json({
      success: true,
      executionTimeMs,
      meta: {
        walletId,
        limit,
        strategy: skipParam ? "OFFSET (SKIP)" : cursorParam ? "CURSOR (SEEK)" : "FIRST PAGE",
        hasMore,
        nextCursor,
        count: data.length,
      },
      data,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Admin endpoint to freeze or unfreeze a user wallet.
 * Generates an immutable ACCOUNT_FREEZE audit log entry.
 */
export const toggleWalletFreeze = async (req: Request, res: Response): Promise<void> => {
  try {
    // Explicitly cast walletId to string to resolve TS2322 type error
    const walletId = req.params.walletId as string;
    const { status } = req.body;
    const user = (req as any).user;

    if (!status || !Object.values(WalletStatus).includes(status)) {
      res.status(400).json({
        success: false,
        error: `Invalid status provided. Allowed options: ${Object.values(WalletStatus).join(", ")}`,
      });
      return;
    }

    const existingWallet = await prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!existingWallet) {
      res.status(404).json({ success: false, error: "Wallet record not found." });
      return;
    }

    const updatedWallet = await prisma.wallet.update({
      where: { id: walletId },
      data: { status },
    });

    // Write audit log entry
    if (user) {
      await createAuditLog({
        actorId: user.id,
        role: user.role,
        action: AuditAction.ACCOUNT_FREEZE,
        resource: "Wallet",
        resourceId: walletId,
        ipAddress: req.ip || "127.0.0.1",
        metadata: {
          previousStatus: existingWallet.status,
          newStatus: status,
          userId: existingWallet.userId,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: `Wallet status updated to ${status} successfully.`,
      data: updatedWallet,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Admin endpoint to execute a manual financial transaction reversal.
 * Enforces mandatory idempotency key header and generates a MANUAL_REVERSAL audit log entry.
 */
export const adminManualReversal = async (req: Request, res: Response): Promise<void> => {
  const { transactionId, reason } = req.body;
  const idempotencyKey = (req.headers["x-idempotency-key"] || req.headers["idempotency-key"]) as string | undefined;

  if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
    res.status(400).json({
      success: false,
      error: "Missing required header: 'x-idempotency-key' is mandatory for manual reversals.",
    });
    return;
  }

  try {
    const result = await executeTransactionReversal(transactionId, idempotencyKey.trim());

    // Write immutable audit log entry for Manual Reversal action
    if (req.user) {
      await createAuditLog({
        actorId: req.user.id,
        role: req.user.role,
        action: AuditAction.MANUAL_REVERSAL,
        resource: "WalletTransaction",
        resourceId: transactionId,
        ipAddress: req.ip,
        metadata: {
          reason: reason || "Admin manual dispute resolution",
          reversalResult: result,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "Manual transaction reversal executed successfully.",
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || "Manual reversal operation failed.",
    });
  }
};

/**
 * Admin endpoint to manually adjust a user balance or override negative debt.
 * Generates a DEBT_OVERRIDE audit log entry.
 */
export const adminDebtOverride = async (req: Request, res: Response): Promise<void> => {
  try {
    const { walletId, newBalance, reason } = req.body;

    if (newBalance === undefined || isNaN(Number(newBalance))) {
      res.status(400).json({
        success: false,
        error: "Valid numeric 'newBalance' value is required for debt override.",
      });
      return;
    }

    const existingWallet = await prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!existingWallet) {
      res.status(404).json({ success: false, error: "Wallet record not found." });
      return;
    }

    const updatedWallet = await prisma.wallet.update({
      where: { id: walletId },
      data: { balance: newBalance },
    });

    // Write immutable audit log entry for Debt Override action
    if (req.user) {
      await createAuditLog({
        actorId: req.user.id,
        role: req.user.role,
        action: AuditAction.DEBT_OVERRIDE,
        resource: "Wallet",
        resourceId: walletId,
        ipAddress: req.ip,
        metadata: {
          previousBalance: existingWallet.balance,
          overrideBalance: newBalance,
          reason: reason || "Admin debt clearance / balance adjustment",
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "Wallet balance adjusted successfully via admin override.",
      data: updatedWallet,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Admin endpoint to trigger on-demand system reconciliation.
 * Audits all wallets, checks balance integrity, and logs RECONCILIATION_RUN audit log.
 */
export const triggerManualReconciliation = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;

    // Run full balance and anomaly audit worker
    const auditResults = await runReconciliationAudit();

    // Create AuditLog entry for manual trigger
    if (user) {
      await createAuditLog({
        actorId: user.id,
        role: user.role,
        action: AuditAction.RECONCILIATION_RUN,
        resource: "SystemReconciliation",
        resourceId: `RECON_${Date.now()}`,
        ipAddress: req.ip || "127.0.0.1",
        metadata: {
          triggeredBy: user.email,
          auditSummary: auditResults,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "Manual system balance reconciliation executed successfully.",
      data: auditResults,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};