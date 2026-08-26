import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const benchmarkTransactionLedger = async (req: Request, res: Response) => {
  try {
    const { walletId, useIndex } = req.query;
    const isIndexEnabled = useIndex !== "false";

    if (!walletId) {
      return res.status(400).json({ error: "walletId query parameter is required" });
    }

    const startTime = performance.now();

    // Toggle Postgres Index Scan for current session transaction
    if (!isIndexEnabled) {
      await prisma.$executeRawUnsafe(`SET LOCAL enable_indexscan = off; SET LOCAL enable_bitmapscan = off;`);
    } else {
      await prisma.$executeRawUnsafe(`SET LOCAL enable_indexscan = on; SET LOCAL enable_bitmapscan = on;`);
    }

    // Fetch actual data
    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: String(walletId) },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Get PostgreSQL EXPLAIN ANALYZE Plan
    const explainPlan: any = await prisma.$queryRaw`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, amount, type, "createdAt" 
      FROM "WalletTransaction"
      WHERE "walletId" = ${String(walletId)}
      ORDER BY "createdAt" DESC
      LIMIT 20;
    `;

    const endTime = performance.now();
    const nodeType = explainPlan[0]["QUERY PLAN"][0]["Plan"]["Node Type"];
    const dbExecutionTime = explainPlan[0]["QUERY PLAN"][0]["Execution Time"];

    return res.status(200).json({
      success: true,
      optimizationStatus: isIndexEnabled ? "WITH B-TREE INDEX" : "WITHOUT INDEX (FORCE SEQ SCAN)",
      scanStrategy: nodeType,
      dbExecutionTimeMs: `${dbExecutionTime} ms`,
      totalApiResponseTimeMs: `${(endTime - startTime).toFixed(2)} ms`,
      totalRecordsReturned: transactions.length,
      data: transactions,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};