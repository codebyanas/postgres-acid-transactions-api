import { prisma } from "../src/config/db";
import { executeAtomicTransfer } from "../src/lab/atomic-wallet-transaction";
import { executeTransactionReversal, depositAndClearDebt } from "../src/lab/financial-recovery";
import { runReconciliationAudit } from "../src/jobs/reconciliation.cron";
import { TransactionType } from "@prisma/client";

/**
 * CLI Test Suite for Phase 4: Financial Recovery & Reversal Engine
 * Command: npx tsx scripts/run-financial-recovery-test.ts
 */
async function runFinancialRecoveryTestSuite() {
  console.log("🚀 [CLI SUITE] Running Phase 4 Financial Recovery & Overdraft Tests...\n");

  try {
    const users = await prisma.user.findMany({ take: 3 });
    if (users.length < 3) {
      console.log("❌ Error: Need minimum 3 users (including System Reserve). Run seed scripts first.");
      return;
    }

    // Filter out system user to get standard users
    const standardUsers = users.filter((u) => u.email !== "system.reserve@bank.internal");
    const userA = standardUsers[0]; // Original Sender
    const userB = standardUsers[1]; // Defaulter / Receiver

    console.log(`👤 User A (Sender): ${userA.name} (${userA.id})`);
    console.log(`👤 User B (Receiver): ${userB.name} (${userB.id})\n`);

    // Reset initial balances for precise math testing
    await prisma.wallet.update({ where: { userId: userA.id }, data: { balance: 1000.00, status: "ACTIVE" } });
    await prisma.wallet.update({ where: { userId: userB.id }, data: { balance: 100.00, status: "ACTIVE" } });

    console.log("--- TEST 1: Initial Transfer ($100.00 from A -> B) ---");
    const initialTransfer = await executeAtomicTransfer(userA.id, userB.id, 100.00);
    console.log(`✅ Transfer Successful! User B Balance: $${initialTransfer.receiverBalance}\n`);

    // Get primary DEBIT transaction ID from User A's wallet
    const userAWallet = await prisma.wallet.findUnique({ where: { userId: userA.id } });
    const originalDebitTx = await prisma.walletTransaction.findFirst({
      where: { walletId: userAWallet!.id, type: TransactionType.DEBIT },
      orderBy: { createdAt: "desc" },
    });

    console.log("--- TEST 2: User B Spends $170.00 (Leaving $30.00 Balance) ---");
    // Simulate spending by reducing User B balance to $30.00
    await prisma.wallet.update({ where: { userId: userB.id }, data: { balance: 30.00 } });
    console.log("✅ User B Balance reduced to $30.00\n");

    console.log("--- TEST 3: Reversal Engine Execution ($100.00 Reversal) ---");
    const reversalResult = await executeTransactionReversal(originalDebitTx!.id);
    console.log(`✅ Reversal Executed!`);
    console.log(`- User A Refunded Balance: $${reversalResult.refundedUserBalance}`);
    console.log(`- User B Defaulter Balance: $${reversalResult.defaulterUserBalance} (Negative Debt!)`);
    console.log(`- User B Status: ${reversalResult.defaulterStatus}`);
    console.log(`- System Float Reserve Used: $${reversalResult.systemFloatUsed}\n`);

    console.log("--- TEST 4: Attempt Transfer Out From RESTRICTED Account ---");
    try {
      await executeAtomicTransfer(userB.id, userA.id, 10.00);
    } catch (err: any) {
      console.log(`✅ Blocked Expectedly: ${err.message}\n`);
    }

    console.log("--- TEST 5: User B Deposits $100.00 (Debt Auto-Clear) ---");
    const depositResult = await depositAndClearDebt(userB.id, 100.00);
    console.log(`✅ Deposit Processed!`);
    console.log(`- Deposited: $${depositResult.depositedAmount}`);
    console.log(`- Debt Repaid to System Float: $${depositResult.debtCleared}`);
    console.log(`- User B New Balance: $${depositResult.newBalance}`);
    console.log(`- User B Account Status Restored: ${depositResult.walletStatus}\n`);

    console.log("--- TEST 6: Background Reconciliation Audit Job ---");
    await runReconciliationAudit();

  } catch (error: any) {
    console.error("❌ Test Suite Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runFinancialRecoveryTestSuite();