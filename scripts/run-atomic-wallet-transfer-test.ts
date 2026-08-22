import { prisma } from "../src/config/db";
import { executeAtomicTransfer } from "../src/lab/atomic-wallet-transaction";

/**
 * CLI Test Suite for Atomic Wallet Transfer & Input Exploits.
 * Command: npx tsx scripts/run-atomic-wallet-transfer-test.ts
 */
async function runAtomicWalletTransferTest() {
  console.log("🚀 [CLI SUITE] Running Banking Transfer Safeguard Tests...\n");

  try {
    const users = await prisma.user.findMany({ take: 2 });

    if (users.length < 2) {
      console.log("❌ Error: Minimum 2 users required. Run 'npx prisma db seed' first.");
      return;
    }

    const sender = users[0];
    const receiver = users[1];

    console.log("--- TEST 1: Valid Transfer ($50.00) ---");
    const validResult = await executeAtomicTransfer(sender.id, receiver.id, 50.00);
    console.log(`✅ Success! Transferred: $${validResult.transferredAmount}`);
    console.log(`- ${sender.name} New Balance: $${validResult.senderBalance}`);
    console.log(`- ${receiver.name} New Balance: $${validResult.receiverBalance}\n`);

    console.log("--- TEST 2: Garbage String Exploit ('gh34') ---");
    try {
      await executeAtomicTransfer(sender.id, receiver.id, "gh34");
    } catch (err: any) {
      console.log("✅ Blocked Expectedly:", err.message, "\n");
    }

    console.log("--- TEST 3: Operator Exploit ('*10') ---");
    try {
      await executeAtomicTransfer(sender.id, receiver.id, "*10");
    } catch (err: any) {
      console.log("✅ Blocked Expectedly:", err.message, "\n");
    }

    console.log("--- TEST 4: Negative Value Exploit (-100) ---");
    try {
      await executeAtomicTransfer(sender.id, receiver.id, -100);
    } catch (err: any) {
      console.log("✅ Blocked Expectedly:", err.message, "\n");
    }

    console.log("--- TEST 5: Zero Amount Transfer (0) ---");
    try {
      await executeAtomicTransfer(sender.id, receiver.id, 0);
    } catch (err: any) {
      console.log("✅ Blocked Expectedly:", err.message, "\n");
    }

    console.log("--- TEST 6: Invalid Decimal Precision (10.1234) ---");
    try {
      await executeAtomicTransfer(sender.id, receiver.id, 10.1234);
    } catch (err: any) {
      console.log("✅ Blocked Expectedly:", err.message, "\n");
    }

    console.log("--- TEST 7: Self-Transfer Prevention ---");
    try {
      await executeAtomicTransfer(sender.id, sender.id, 10.00);
    } catch (err: any) {
      console.log("✅ Blocked Expectedly:", err.message, "\n");
    }

  } catch (error: any) {
    console.error("❌ Unexpected Test Failure:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runAtomicWalletTransferTest();