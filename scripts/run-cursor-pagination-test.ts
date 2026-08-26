import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function runCursorPaginationBenchmark() {
  console.log("⚡ Starting Phase 7: Cursor vs Offset Pagination Benchmark...\n");

  // 1. Get total record count from WalletTransaction ledger
  const totalCount = await prisma.walletTransaction.count();
  console.log(`📊 Total Transactions in Database: ${totalCount}`);

  if (totalCount < 1000) {
    console.log("⚠️ Warning: Low record count. Need seeded data for realistic O(1) vs O(N) benchmarking.");
  }

  // Calculate deep offset (80% deep into the table)
  const offsetTarget = Math.floor(totalCount * 0.8);

  // TEST A: Traditional Offset / Skip Pagination (O(N) Memory Load)
  console.log(`\n🔴 [Test A] Running Offset Pagination (SKIP ${offsetTarget} TAKE 20)...`);
  const offsetStart = performance.now();
  
  const offsetData = await prisma.walletTransaction.findMany({
    skip: offsetTarget,
    take: 20,
    orderBy: { createdAt: "desc" },
  });
  
  const offsetEnd = performance.now();
  const offsetTime = parseFloat((offsetEnd - offsetStart).toFixed(3));

  // Fetch a sample cursor record around the same deep offset target
  const targetCursorRecord = await prisma.walletTransaction.findFirst({
    skip: offsetTarget,
    take: 1,
    orderBy: { createdAt: "desc" },
  });

  if (!targetCursorRecord) {
    throw new Error("Could not fetch a valid target record for cursor benchmark.");
  }

  // TEST B: Cursor / Seek Pagination (O(1) B-Tree Leaf Pointer Lookup)
  console.log(`🟢 [Test B] Running Cursor Pagination (SEEK via Cursor ID TAKE 20)...`);
  const cursorStart = performance.now();
  
  const cursorData = await prisma.walletTransaction.findMany({
    take: 20,
    cursor: { id: targetCursorRecord.id },
    skip: 1,
    orderBy: { createdAt: "desc" },
  });
  
  const cursorEnd = performance.now();
  const cursorTime = parseFloat((cursorEnd - cursorStart).toFixed(3));

  // Display Results
  console.log("\n=================== 📊 PAGINATION BENCHMARK COMPARISON ===================");
  console.table([
    {
      "Pagination Type": "Offset-Based (SKIP)",
      "Target Depth": `Row #${offsetTarget}`,
      "Execution Time": `${offsetTime} ms`,
      "Complexity": "O(N) - Linear Memory Growth",
    },
    {
      "Pagination Type": "Cursor-Based (SEEK)",
      "Target Depth": `Row #${offsetTarget}`,
      "Execution Time": `${cursorTime} ms`,
      "Complexity": "O(1) - Constant B-Tree Speed",
    },
  ]);

  const speedup = (offsetTime / (cursorTime || 0.001)).toFixed(1);
  console.log(`\n🚀 Speed Verdict: Cursor-based pagination is ~${speedup}x faster at deep table offsets!`);
}

runCursorPaginationBenchmark()
  .catch((e) => console.error("❌ Pagination Benchmark Failed:", e))
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });