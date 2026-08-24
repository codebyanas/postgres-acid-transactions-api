import { prisma } from "../config/db";
import { TransactionType } from "@prisma/client";

/**
 * ============================================================================
 * FINANCIAL RECONCILIATION CRON / WORKER SERVICE
 * ============================================================================
 * Scans transaction history for un-reversed duplicate transactions across 
 * short time windows to maintain double-entry audit accuracy.
 */
export const runReconciliationAudit = async () => {
  console.log("[CRON WORKER] Running background financial audit scanning for duplicates...");

  try {
    // 1. Fetch DEBIT transactions created in the last 24 hours
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentDebits = await prisma.walletTransaction.findMany({
      where: {
        type: TransactionType.DEBIT,
        createdAt: { gte: last24Hours },
      },
      orderBy: { createdAt: "desc" },
    });

    const flaggedDuplicates: string[] = [];

    // 2. Scan for duplicate patterns (Same wallet, same amount within 10 seconds)
    for (let i = 0; i < recentDebits.length; i++) {
      for (let j = i + 1; j < recentDebits.length; j++) {
        const txA = recentDebits[i];
        const txB = recentDebits[j];

        const isSameWallet = txA.walletId === txB.walletId;
        const isSameAmount = Number(txA.amount) === Number(txB.amount);
        const timeDiffMs = Math.abs(txA.createdAt.getTime() - txB.createdAt.getTime());

        // Flag if same amount sent from same wallet within a 10-second window
        if (isSameWallet && isSameAmount && timeDiffMs <= 10000) {
          flaggedDuplicates.push(
            `[FLAGGED ANOMALY] Tx ID 1: ${txA.id} | Tx ID 2: ${txB.id} | Amount: $${txA.amount} | Window: ${timeDiffMs / 1000}s`
          );
        }
      }
    }

    if (flaggedDuplicates.length === 0) {
      console.log("[CRON WORKER] Audit Complete: Zero un-flagged duplicate anomalies detected.");
    } else {
      console.warn(`[CRON WORKER] Audit Warning: Found ${flaggedDuplicates.length} suspicious transaction pairs:`);
      flaggedDuplicates.forEach((msg) => console.warn(`   ${msg}`));
    }
  } catch (error: any) {
    console.error("[CRON WORKER ERROR] Audit failed:", error.message);
  }
};