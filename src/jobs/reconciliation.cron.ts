import { prisma } from "../config/db";
import { TransactionType, AuditAction, UserRole } from "@prisma/client";
import { createAuditLog } from "../utils/auditLogger.util";

/**
 * ============================================================================
 * LEDGER BALANCE AGGREGATION & DISPARITY ENGINE
 * ============================================================================
 * Calculates total historical CREDIT and DEBIT transaction sums for each wallet.
 * Compares Calculated Balance against Stored Wallet Balance.
 */
export const runBalanceReconciliation = async () => {
  console.log("🔍 [RECONCILIATION ENGINE] Starting ledger balance audit...");

  try {
    // Fetch all active and non-deleted wallets for reconciliation check
    const wallets = await prisma.wallet.findMany({
      where: { deletedAt: null },
      select: { id: true, userId: true, balance: true, status: true },
    });

    let disparitiesFound = 0;
    const report: any[] = [];

    for (const wallet of wallets) {
      // 1. Aggregate all CREDIT transactions for this wallet
      const creditAggregate = await prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: { walletId: wallet.id, type: TransactionType.CREDIT },
      });

      // 2. Aggregate all DEBIT transactions for this wallet
      const debitAggregate = await prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: { walletId: wallet.id, type: TransactionType.DEBIT },
      });

      const totalCredits = Number(creditAggregate._sum.amount || 0);
      const totalDebits = Number(debitAggregate._sum.amount || 0);

      // Formula: Calculated Balance = Total Credits - Total Debits
      const calculatedBalance = parseFloat((totalCredits - totalDebits).toFixed(2));
      const storedBalance = Number(wallet.balance);

      // 3. Disparity Check: Flag mismatch between ledger sum and stored balance
      if (calculatedBalance !== storedBalance) {
        disparitiesFound++;
        const discrepancyAmount = parseFloat((storedBalance - calculatedBalance).toFixed(2));

        console.error(
          `🚨 [DISPARITY FLAG] Wallet ID: ${wallet.id} | Stored: $${storedBalance} | Calculated: $${calculatedBalance} | Mismatch: $${discrepancyAmount}`
        );

        // 4. Record System-Level Audit Log Entry for Disparity
        await createAuditLog({
          actorId: "SYSTEM_RECONCILIATION_WORKER",
          role: UserRole.SYSTEM,
          action: AuditAction.DISPARITY_DETECTED,
          resource: "Wallet",
          resourceId: wallet.id,
          ipAddress: "127.0.0.1",
          metadata: {
            walletId: wallet.id,
            userId: wallet.userId,
            storedBalance,
            calculatedBalance,
            totalCredits,
            totalDebits,
            discrepancyAmount,
            detectedAt: new Date().toISOString(),
          },
        });

        report.push({
          walletId: wallet.id,
          userId: wallet.userId,
          storedBalance,
          calculatedBalance,
          discrepancyAmount,
        });
      }
    }

    if (disparitiesFound === 0) {
      console.log("✅ [RECONCILIATION ENGINE] Complete: 100% ledger balance accuracy across all wallets.");
    }

    return {
      totalAuditedWallets: wallets.length,
      disparitiesFound,
      disparities: report,
    };
  } catch (error: any) {
    console.error("❌ [RECONCILIATION ERROR] Balance audit failed:", error.message);
    throw error;
  }
};

/**
 * ============================================================================
 * ENHANCED FINANCIAL RECONCILIATION AUDIT WORKER
 * ============================================================================
 * Combines Idempotency Duplicate Detection + Rapid Window Heuristics + Ledger Balance Checks
 */
export const runReconciliationAudit = async () => {
  console.log("🔍 [CRON WORKER] Running background financial audit scanning...");

  try {
    // Execute Ledger Balance Reconciliation Engine first
    const balanceAuditResult = await runBalanceReconciliation();

    // Scan recent debits for idempotency duplicates or rapid time window glitches
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

        // LEVEL 1: Exact Idempotency Key Match
        if (
          txA.idempotencyKey &&
          txB.idempotencyKey &&
          txA.idempotencyKey === txB.idempotencyKey
        ) {
          confirmedDuplicates.push(
            `[100% CONFIRMED GLITCH] Key: '${txA.idempotencyKey}' | Tx 1: ${txA.id} | Tx 2: ${txB.id}`
          );
        } 
        // LEVEL 2: Rapid Time Window Heuristic (< 10s difference)
        else if (isSameWallet && isSameAmount && timeDiffMs <= 10000) {
          suspiciousAnomalies.push(
            `[SUSPICIOUS TIME WINDOW] Tx 1: ${txA.id} | Tx 2: ${txB.id} | Amount: $${txA.amount}`
          );
        }
      }
    }

    return {
      balanceAudit: balanceAuditResult,
      confirmedDuplicates,
      suspiciousAnomalies,
    };
  } catch (error: any) {
    console.error("❌ [CRON WORKER ERROR] Audit failed:", error.message);
  }
};