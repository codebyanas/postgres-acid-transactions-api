import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function verifyBTreeDeep() {
  console.log("🔍 Deep B-Tree Benchmark: Comparing WITH INDEX vs WITHOUT INDEX...\n");

  const sampleWallet = await prisma.wallet.findFirst({ select: { id: true } });
  if (!sampleWallet) throw new Error("No wallet found. Run npx prisma db seed first.");

  function parsePlan(explainRaw: any) {
    const rootPlan = explainRaw[0]["QUERY PLAN"][0]["Plan"];
    const execTime = explainRaw[0]["QUERY PLAN"][0]["Execution Time"];
    const totalCost = rootPlan["Total Cost"];

    let innerNode = rootPlan;
    if (innerNode["Node Type"] === "Limit" && innerNode["Plans"]) {
      innerNode = innerNode["Plans"][0];
    }
    return {
      nodeType: innerNode["Node Type"],
      indexName: innerNode["Index Name"] || "None (Full Scan/Sort)",
      totalCost,
      execTime,
    };
  }

  // TEST 1: Product Price Range Query
  console.log("📌 Testing Product Price Range (WHERE price BETWEEN 100 AND 300)...");
  
  await prisma.$executeRawUnsafe(`SET enable_indexscan = on; SET enable_bitmapscan = on;`);
  const prodWithRaw: any = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, title, price FROM "Product"
    WHERE price BETWEEN 100.00 AND 300.00
    LIMIT 50;
  `;
  const prodWith = parsePlan(prodWithRaw);

  await prisma.$executeRawUnsafe(`SET enable_indexscan = off; SET enable_bitmapscan = off;`);
  const prodNoRaw: any = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, title, price FROM "Product"
    WHERE price BETWEEN 100.00 AND 300.00
    LIMIT 50;
  `;
  const prodNo = parsePlan(prodNoRaw);

  // TEST 2: Wallet Transaction History Lookup & Sorting
  console.log("📌 Testing Transaction History (WHERE walletId = X ORDER BY createdAt DESC)...");
  
  await prisma.$executeRawUnsafe(`SET enable_indexscan = on; SET enable_bitmapscan = on;`);
  const txWithRaw: any = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, amount, type, "createdAt" FROM "WalletTransaction"
    WHERE "walletId" = ${sampleWallet.id}
    ORDER BY "createdAt" DESC
    LIMIT 20;
  `;
  const txWith = parsePlan(txWithRaw);

  await prisma.$executeRawUnsafe(`SET enable_indexscan = off; SET enable_bitmapscan = off;`);
  const txNoRaw: any = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, amount, type, "createdAt" FROM "WalletTransaction"
    WHERE "walletId" = ${sampleWallet.id}
    ORDER BY "createdAt" DESC
    LIMIT 20;
  `;
  const txNo = parsePlan(txNoRaw);

  // Reset Session
  await prisma.$executeRawUnsafe(`RESET enable_indexscan; RESET enable_bitmapscan;`);

  console.log("\n=================== 📊 B-TREE BENCHMARK COMPARISON RESULT ===================");
  console.table([
    {
      "Test Scenario": "Product Range Filter",
      "Without Index Scan": prodNo.nodeType,
      "Without Index Time": `${prodNo.execTime} ms`,
      "With Index Scan": `${prodWith.nodeType} (${prodWith.indexName})`,
      "With Index Time": `${prodWith.execTime} ms`,
    },
    {
      "Test Scenario": "Transaction History & Sort",
      "Without Index Scan": txNo.nodeType,
      "Without Index Time": `${txNo.execTime} ms`,
      "With Index Scan": `${txWith.nodeType} (${txWith.indexName})`,
      "With Index Time": `${txWith.execTime} ms`,
    },
  ]);
}

verifyBTreeDeep()
  .catch((e) => console.error("❌ Verification Failed:", e))
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });