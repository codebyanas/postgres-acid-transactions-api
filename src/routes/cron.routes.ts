import { Router, Request, Response } from "express";
import { runReconciliationAudit } from "../jobs/reconciliation.cron";

const router = Router();

/**
 * Vercel Cron Trigger Endpoint
 * Allows Vercel Cron service to trigger background financial audits safely via HTTP GET
 */
router.get("/reconciliation", async (req: Request, res: Response) => {
  try {
    const auditResult = await runReconciliationAudit();
    res.status(200).json({
      success: true,
      message: "Background Reconciliation Audit executed successfully",
      data: auditResult,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Reconciliation Audit execution failed",
      error: error.message,
    });
  }
});

export default router;