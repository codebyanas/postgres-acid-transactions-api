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
export const prisma = new PrismaClient({ adapter });

export interface JsonbBenchmarkResult {
  filterPattern: Record<string, any>;
  executionTimeMs: number;
  resultCount: number;
  scanType: string;
  totalCost: number;
  products: any[];
}

/**
 * Executes a PostgreSQL JSONB Containment Query (@>) 
 * and benchmarks performance metrics + DB Query Plan scan type.
 */
export async function benchmarkJsonbQuery(
  filterPattern: Record<string, any>
): Promise<JsonbBenchmarkResult> {
  const jsonString = JSON.stringify(filterPattern);

  const startTime = performance.now();

  // 1. Execute SQL with JSONB Containment Operator (@>)
  const products: any[] = await prisma.$queryRaw`
    SELECT id, title, price, stock, metadata
    FROM "Product"
    WHERE metadata @> ${jsonString}::jsonb
  `;

  const endTime = performance.now();
  const executionTimeMs = parseFloat((endTime - startTime).toFixed(3));

  // 2. Fetch Query Execution Plan using EXPLAIN ANALYZE
  const explainResult: any[] = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, FORMAT JSON)
    SELECT id, title, price, stock, metadata
    FROM "Product"
    WHERE metadata @> ${jsonString}::jsonb
  `;

  const planNode = explainResult[0]["QUERY PLAN"][0]["Plan"];
  const scanType = planNode["Node Type"]; // "Seq Scan" (No Index) vs "Bitmap Heap Scan" / "Index Scan" (With GIN)
  const totalCost = planNode["Total Cost"];

  return {
    filterPattern,
    executionTimeMs,
    resultCount: products.length,
    scanType,
    totalCost,
    products,
  };
}