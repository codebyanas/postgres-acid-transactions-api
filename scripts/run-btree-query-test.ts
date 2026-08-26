import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in environment variables.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function runBTreeBenchmark() {
  console.log("⚡ Starting Phase 6: B-Tree Index Performance Benchmark...\n");

  // Fetch a random active wallet for lookup
  const sampleWallet = await prisma.wallet.findFirst({ select: { id: true } });
  if (!sampleWallet) {
    throw new Error("No wallets found. Run npx prisma db seed first.");
  }

  // 1. Benchmark: Product Price Range Filtering (B-Tree Index Test)
  console.log("📊 [Test 1] Product Range Filter Query: WHERE price BETWEEN 100 AND 300");
  const priceExplainRaw = await prisma.$queryRaw<any[]>`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, title, price FROM "Product"
    WHERE price BETWEEN 100.00 AND 300.00
    LIMIT 50;
  `;

  const pricePlan = priceExplainRaw[0]["QUERY PLAN"][0];
  console.log(`   ├─ Scan Node Type:  ${pricePlan["Plan"]["Node Type"]}`);
  console.log(`   ├─ Planning Time:   ${pricePlan["Planning Time"]} ms`);
  console.log(`   ├─ Execution Time:  ${pricePlan["Execution Time"]} ms`);
  console.log(`   └─ Total Cost:      ${pricePlan["Plan"]["Total Cost"]}\n`);

  // 2. Benchmark: Compound Ledger Lookup & Sorting (Composite B-Tree Test)
  console.log(`📊 [Test 2] Wallet Transaction History: WHERE walletId = '${sampleWallet.id}' ORDER BY createdAt DESC`);
  const txExplainRaw = await prisma.$queryRaw<any[]>`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, amount, type, "createdAt" FROM "WalletTransaction"
    WHERE "walletId" = ${sampleWallet.id}
    ORDER BY "createdAt" DESC
    LIMIT 20;
  `;

  const txPlan = txExplainRaw[0]["QUERY PLAN"][0];
  console.log(`   ├─ Scan Node Type:  ${txPlan["Plan"]["Node Type"]}`);
  console.log(`   ├─ Planning Time:   ${txPlan["Planning Time"]} ms`);
  console.log(`   ├─ Execution Time:  ${txPlan["Execution Time"]} ms`);
  console.log(`   └─ Total Cost:      ${txPlan["Plan"]["Total Cost"]}\n`);

  console.log("🏁 Phase 6 B-Tree Benchmark Completed Successfully!");
}

runBTreeBenchmark()
  .catch((e) => {
    console.error("❌ Benchmark Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });