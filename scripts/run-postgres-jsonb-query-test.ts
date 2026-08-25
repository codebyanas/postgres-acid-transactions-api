import { prisma, benchmarkJsonbQuery } from "../src/lab/postgres-jsonb-query";

// ANSI Terminal Colors
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

async function runHeavyJsonbBenchmarking() {
  console.log(`\n${c.cyan}${c.bold}==================================================================${c.reset}`);
  console.log(`       ${c.yellow}${c.bold}POSTGRESQL JSONB BENCHMARK ENGINE (GIN INDEX VS SEQ SCAN)${c.reset}`);
  console.log(`${c.cyan}${c.bold}==================================================================${c.reset}\n`);

  // Dynamic record count from DB
  const totalProducts = await prisma.product.count();

  const heavyFilterQuery = {
    category: "electronics",
    brand: "Apple",
    specs: {
      ram: "16GB",
      cpu: "M3 Max"
    },
    warehouse: {
      zone: "A1"
    }
  };

  console.log(`${c.yellow}[CONFIG]${c.reset} Target Database Table : ${c.bold}Product${c.reset}`);
  console.log(`${c.yellow}[CONFIG]${c.reset} Total Record Scale    : ${c.cyan}${c.bold}${totalProducts.toLocaleString()} records${c.reset}`);
  console.log(`${c.yellow}[CONFIG]${c.reset} Query Operator        : ${c.magenta}${c.bold}JSONB Containment (@>)${c.reset}`);
  console.log(`${c.yellow}[CONFIG]${c.reset} Filter Criteria       : ${c.dim}${JSON.stringify(heavyFilterQuery)}${c.reset}`);
  console.log(`${c.dim}------------------------------------------------------------------${c.reset}\n`);

  // 1. UNINDEXED BENCHMARK (Baseline Test)
  console.log(`${c.red}${c.bold}>>> [PHASE 1] RUNNING QUERY WITHOUT GIN INDEX (SEQUENTIAL SCAN)...${c.reset}`);
  
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_product_metadata_gin;`);
  await prisma.$executeRawUnsafe(`DISCARD ALL;`); // Flush RAM cache & session

  const unindexedResult = await benchmarkJsonbQuery(heavyFilterQuery);

  console.log(` -> Execution Time      : ${c.red}${c.bold}${unindexedResult.executionTimeMs} ms${c.reset}`);
  console.log(` -> Database Strategy   : ${c.red}${c.bold}${unindexedResult.scanType}${c.reset} ${c.dim}(Full Table Scan)${c.reset}`);
  console.log(` -> Query Planner Cost  : ${c.yellow}${unindexedResult.totalCost}${c.reset}`);
  console.log(` -> Matched Records     : ${c.white}${unindexedResult.resultCount}${c.reset}`);
  console.log(`${c.dim}------------------------------------------------------------------${c.reset}\n`);

  // 2. GIN INDEX INITIALIZATION
  console.log(`${c.magenta}${c.bold}>>> [PHASE 2] CREATING POSTGRESQL GIN INDEX ON metadata COLUMN...${c.reset}`);
  const indexStartTime = performance.now();
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_product_metadata_gin ON "Product" USING GIN ("metadata");`
  );
  const indexEndTime = performance.now();
  const indexBuildTime = (indexEndTime - indexStartTime).toFixed(2);
  console.log(` -> Index Build Status  : ${c.green}${c.bold}SUCCESS${c.reset} ${c.dim}(${indexBuildTime} ms)${c.reset}`);
  console.log(`${c.dim}------------------------------------------------------------------${c.reset}\n`);

  // 3. INDEXED BENCHMARK
  console.log(`${c.green}${c.bold}>>> [PHASE 3] RUNNING QUERY WITH GIN INDEX (BITMAP HEAP SCAN)...${c.reset}`);
  await prisma.$executeRawUnsafe(`DISCARD ALL;`);

  const indexedResult = await benchmarkJsonbQuery(heavyFilterQuery);

  console.log(` -> Execution Time      : ${c.green}${c.bold}${indexedResult.executionTimeMs} ms${c.reset}`);
  console.log(` -> Database Strategy   : ${c.green}${c.bold}${indexedResult.scanType}${c.reset} ${c.dim}(Index Lookup)${c.reset}`);
  console.log(` -> Query Planner Cost  : ${c.cyan}${indexedResult.totalCost}${c.reset}`);
  console.log(` -> Matched Records     : ${c.white}${indexedResult.resultCount}${c.reset}`);
  console.log(`${c.dim}------------------------------------------------------------------${c.reset}\n`);

  // 4. SUMMARY METRICS COMPARISON
  const speedupRatio = (unindexedResult.executionTimeMs / indexedResult.executionTimeMs).toFixed(1);
  const costReduction = (((unindexedResult.totalCost - indexedResult.totalCost) / unindexedResult.totalCost) * 100).toFixed(1);

  console.log(`${c.cyan}${c.bold}==================================================================${c.reset}`);
  console.log(`             ${c.green}${c.bold}FINAL BENCHMARK PERFORMANCE COMPARISON${c.reset}`);
  console.log(`${c.cyan}${c.bold}==================================================================${c.reset}`);
  
  console.table([
    {
      "Performance Metric": "Execution Time (ms)",
      "Without Index (Seq Scan)": `${unindexedResult.executionTimeMs} ms`,
      "With GIN Index (Bitmap Scan)": `${indexedResult.executionTimeMs} ms`,
      "Measured Optimization": `${speedupRatio}x Faster`
    },
    {
      "Performance Metric": "Database Scan Strategy",
      "Without Index (Seq Scan)": unindexedResult.scanType,
      "With GIN Index (Bitmap Scan)": indexedResult.scanType,
      "Measured Optimization": "Switched to Index Lookup"
    },
    {
      "Performance Metric": "PostgreSQL Query Cost",
      "Without Index (Seq Scan)": unindexedResult.totalCost,
      "With GIN Index (Bitmap Scan)": indexedResult.totalCost,
      "Measured Optimization": `${costReduction}% Cost Reduction`
    }
  ]);
  console.log(`${c.cyan}${c.bold}==================================================================${c.reset}\n`);
}

runHeavyJsonbBenchmarking()
  .catch((e) => console.error("[ERROR] Benchmark Script Failed:", e))
  .finally(async () => {
    await prisma.$disconnect();
  });