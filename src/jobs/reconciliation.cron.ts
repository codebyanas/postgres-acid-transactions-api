import { prisma } from "../config/db";
import { TransactionType } from "@prisma/client";

/**
 * ============================================================================
 * ENHANCED FINANCIAL RECONCILIATION AUDIT WORKER
 * ============================================================================
 * Audits ledger history using two levels of validation:
 * 1. Exact Idempotency Match: 100% technical duplicate payload detection.
 * 2. Time-Window Heuristic: Suspicious rapid transfers flagged for human review.
 */
export const runReconciliationAudit = async () => {
  console.log("🔍 [CRON WORKER] Running background financial audit scanning...");

  try {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentDebits = await prisma.walletTransaction.findMany({
      where: {
        type: TransactionType.DEBIT,
        createdAt: { gte: last24Hours },
      },
      orderBy: { createdAt: "desc" },
    });

    const confirmedDuplicates: string[] = [];
    const suspiciousAnomalies: string[] = [];

    for (let i = 0; i < recentDebits.length; i++) {
      for (let j = i + 1; j < recentDebits.length; j++) {
        const txA = recentDebits[i];
        const txB = recentDebits[j];

        const isSameWallet = txA.walletId === txB.walletId;
        const isSameAmount = Number(txA.amount) === Number(txB.amount);
        const timeDiffMs = Math.abs(txA.createdAt.getTime() - txB.createdAt.getTime());

        // LEVEL 1: Exact Idempotency Key Match (100% Confirmed Glitch)
        if (
          txA.idempotencyKey &&
          txB.idempotencyKey &&
          txA.idempotencyKey === txB.idempotencyKey
        ) {
          confirmedDuplicates.push(
            `[100% CONFIRMED GLITCH] Key: '${txA.idempotencyKey}' | Tx ID 1: ${txA.id} | Tx ID 2: ${txB.id}`
          );
        } 
        // LEVEL 2: Rapid Time Window Heuristic (< 10s difference)
        else if (isSameWallet && isSameAmount && timeDiffMs <= 10000) {
          suspiciousAnomalies.push(
            `[SUSPICIOUS TIME WINDOW] Tx ID 1: ${txA.id} | Tx ID 2: ${txB.id} | Amount: $${txA.amount} | Window: ${timeDiffMs / 1000}s`
          );
        }
      }
    }

    if (confirmedDuplicates.length === 0 && suspiciousAnomalies.length === 0) {
      console.log("✅ [CRON WORKER] Audit Complete: Zero anomalies detected.");
    } else {
      if (confirmedDuplicates.length > 0) {
        console.error(`🚨 [CRON WORKER] CRITICAL: Found ${confirmedDuplicates.length} 100% Confirmed Technical Duplicates:`);
        confirmedDuplicates.forEach((msg) => console.error(`   ${msg}`));
      }

      if (suspiciousAnomalies.length > 0) {
        console.warn(`⚠️ [CRON WORKER] WARNING: Found ${suspiciousAnomalies.length} Suspicious Rapid Transfers (Flagged for Review):`);
        suspiciousAnomalies.forEach((msg) => console.warn(`   ${msg}`));
      }
    }
  } catch (error: any) {
    console.error("❌ [CRON WORKER ERROR] Audit failed:", error.message);
  }
};