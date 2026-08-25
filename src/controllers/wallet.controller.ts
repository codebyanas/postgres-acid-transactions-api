import { Request, Response } from "express";
import { prisma } from "../config/db";
import { executeAtomicTransfer } from "../lab/atomic-wallet-transaction";
import { executeTransactionReversal, depositAndClearDebt } from "../lab/financial-recovery";

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