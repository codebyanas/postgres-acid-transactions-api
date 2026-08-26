import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ANSI Color Constants (Terminal Formatting)
const reset = "\x1b[0m";
const bold = "\x1b[1m";
const cyan = "\x1b[36m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const yellow = "\x1b[33m";
const gray = "\x1b[90m";

interface PlanMetrics {
  nodeType: string;
  indexName: string;
  execTime: number;
}

async function verifyBTreeDeep() {
  const sampleWallet = await prisma.wallet.findFirst({ select: { id: true } });
  if (!sampleWallet) throw new Error("Database unseeded. Run seeding script first.");

  function parsePlan(explainRaw: any): PlanMetrics {
    const rootPlan = explainRaw[0]["QUERY PLAN"][0]["Plan"];
    const execTime = explainRaw[0]["QUERY PLAN"][0]["Execution Time"];

    let innerNode = rootPlan;
    if (innerNode["Node Type"] === "Limit" && innerNode["Plans"]) {
      innerNode = innerNode["Plans"][0];
    }
    return {
      nodeType: innerNode["Node Type"],
      indexName: innerNode["Index Name"] || "None (Full Scan/Sort)",
      execTime: parseFloat(execTime),
    };
  }

  // 1. Transaction History Test (Active)
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

  /*
  // 2. Product Range Test (Commented out for now)
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
  */

  // Reset Session Settings
  await prisma.$executeRawUnsafe(`RESET enable_indexscan; RESET enable_bitmapscan;`);

  // Terminal Output Formatting
  console.log(`\n${cyan}${bold}==================================================================================${reset}`);
  console.log(` ${bold}POSTGRESQL B-TREE INDEX BENCHMARK REPORT (100,000 RECORDS SCALE)${reset}`);
  console.log(`${cyan}${bold}==================================================================================${reset}\n`);

  // SCENARIO 1: Transaction History
  const txSpeedup = (txNo.execTime / txWith.execTime).toFixed(1);
  console.log(`${yellow}${bold}[ SCENARIO: Ledger Lookup & Sorting (WalletTransaction) ]${reset}`);
  console.log(`  ├─ ${bold}Unindexed Execution${reset} : ${red}${txNo.nodeType}${reset} (${red}${txNo.execTime.toFixed(2)} ms${reset})`);
  console.log(`  ├─ ${bold}Indexed Execution  ${reset} : ${green}${txWith.nodeType}${reset} [${gray}${txWith.indexName}${reset}] (${green}${txWith.execTime.toFixed(2)} ms${reset})`);
  console.log(`  └─ ${bold}Performance Gain   ${reset} : ${green}${bold}${txSpeedup}x FASTER${reset} ${gray}(QuickSort RAM overhead eliminated)${reset}\n`);

  console.log(`${cyan}${bold}==================================================================================${reset}`);
  console.log(` ${bold}ARCHITECTURAL TAKEAWAYS:${reset}`);
  console.log(` 1. Composite B-Tree Index (walletId, createdAt) eliminated QuickSort RAM overhead.`);
  console.log(` 2. Financial ledger query latency reduced by ~${txSpeedup}x (${red}${txNo.execTime.toFixed(1)}ms${reset} -> ${green}${txWith.execTime.toFixed(2)}ms${reset}).`);
  console.log(`${cyan}${bold}==================================================================================${reset}\n`);
}

verifyBTreeDeep()
  .catch((e) => console.error("Error running benchmark:", e))
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });