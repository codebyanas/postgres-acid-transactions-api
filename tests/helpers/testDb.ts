import { PrismaClient, TransactionType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/postgres_acid_db";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const cleanDatabase = async () => {
  await prisma.$transaction([
    prisma.walletTransaction.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.product.deleteMany(),
    prisma.wallet.deleteMany(),
    prisma.user.deleteMany(),
    prisma.auditLog.deleteMany(),
  ]);

  // System User creation with initial capital
  const systemUser = await prisma.user.create({
    data: {
      name: "System Reserve Float",
      email: "system.reserve@bank.internal",
      role: "SYSTEM",
      wallet: {
        create: {
          balance: 1000000.0,
          status: "ACTIVE",
        },
      },
    },
    include: { wallet: true },
  });

  // Initial Credit Ledger entry to balance Audit Reconciliation
  if (systemUser.wallet) {
    await prisma.walletTransaction.create({
      data: {
        id: randomUUID(),
        walletId: systemUser.wallet.id,
        amount: 1000000.0,
        type: TransactionType.CREDIT,
        description: "Initial System Capital Deposit",
        senderName: "SYSTEM_RESERVE",
        receiverName: systemUser.name,
        idempotencyKey: `sys_seed_${randomUUID()}`,
      },
    });
  }
};

export const disconnectTestDb = async () => {
  await prisma.$disconnect();
  await pool.end();
};

export { prisma };