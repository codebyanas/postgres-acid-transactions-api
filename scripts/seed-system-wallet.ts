import { prisma } from "../src/config/db";
import { WalletStatus } from "@prisma/client";

/**
 * ============================================================================
 * SEED SCRIPT: SYSTEM RESERVE / BANK FLOAT WALLET
 * ============================================================================
 * Initializes an official internal System Reserve Wallet with a $100,000.00 float.
 * This float acts as an intermediary liquidity pool during duplicate payment
 * reversals when the defaulter's wallet balance is insufficient to cover refunds.
 */
async function seedSystemWallet() {
  console.log("[SEED] Initializing System Reserve / Bank Float Wallet...\n");

  try {
    // 1. Create or retrieve the dedicated System Reserve User
    const systemUser = await prisma.user.upsert({
      where: { email: "system.reserve@bank.internal" },
      update: {},
      create: {
        email: "system.reserve@bank.internal",
        name: "SYSTEM_RESERVE_FLOAT",
      },
    });

    // 2. Create or ensure System Wallet has $100,000.00 Float Balance
    const systemWallet = await prisma.wallet.upsert({
      where: { userId: systemUser.id },
      update: {
        status: WalletStatus.ACTIVE,
      },
      create: {
        userId: systemUser.id,
        balance: 100000.00,
        status: WalletStatus.ACTIVE,
      },
    });

    console.log("System Reserve Wallet Successfully Initialized!");
    console.log(`- System User ID: ${systemUser.id}`);
    console.log(`- System Wallet ID: ${systemWallet.id}`);
    console.log(`- Available Float Balance: $${Number(systemWallet.balance).toFixed(2)}`);
    console.log(`- Wallet Status: ${systemWallet.status}\n`);

  } catch (error: any) {
    console.error("Failed to seed System Reserve Wallet:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

seedSystemWallet();