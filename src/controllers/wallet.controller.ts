import { Request, Response } from "express";
import { prisma } from "../config/db";
import { executeAtomicTransfer } from "../lab/atomic-wallet-transaction";

/**
 * Controller endpoint wrapper for P2P Wallet Transfers.
 * Passes raw body parameters to the domain layer for centralized sanitization and execution.
 */
export const transferFunds = async (req: Request, res: Response): Promise<void> => {
  const { senderUserId, receiverUserId, amount } = req.body;

  try {
    // Pass raw amount directly so domain regex can sanitize garbage inputs
    const result = await executeAtomicTransfer(senderUserId, receiverUserId, amount);

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

// 1. Fetch ALL wallets with user details
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

// 2. Fetch single wallet by User ID
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