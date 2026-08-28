import { Router } from "express";
import { idempotencyMiddleware } from "../middlewares/idempotency.middleware";
import { authenticateJWT, requireRole } from "../middlewares/auth.middleware";
import { financialRateLimiter } from "../middlewares/rateLimiter.middleware";
import { 
  transferFunds,
  reverseTransaction,
  depositFunds,
  getAllWallets,
  getWalletByUserId,
  getWalletTransactions,
  toggleWalletFreeze,
  adminManualReversal,
  adminDebtOverride
} from "../controllers/wallet.controller";
import { triggerManualReconciliation } from "../controllers/wallet.controller";

const router = Router();

// Public / General User Endpoints
router.get("/", getAllWallets);
router.get("/:userId", getWalletByUserId);
router.get("/:walletId/transactions", getWalletTransactions);

// Standard Financial Operations (Guarded with Financial Rate Limiter & Idempotency)
router.post("/transfer", financialRateLimiter, idempotencyMiddleware, transferFunds);
router.post("/reverse", financialRateLimiter, idempotencyMiddleware, reverseTransaction);
router.post("/deposit", financialRateLimiter, idempotencyMiddleware, depositFunds);

// On-Demand System Reconciliation Trigger Endpoint (Guarded with ADMIN Role & Financial Rate Limiter)
router.post(
  "/admin/reconcile",
  financialRateLimiter,
  authenticateJWT,
  requireRole(["ADMIN"]),
  triggerManualReconciliation
);

// Administrative Operations (Guarded with Auth JWT, ADMIN RBAC, Financial Rate Limiter & Audit Logging)
router.patch(
  "/admin/freeze/:walletId",
  authenticateJWT,
  requireRole(["ADMIN"]),
  toggleWalletFreeze
);

router.post(
  "/admin/reversal",
  financialRateLimiter,
  authenticateJWT,
  requireRole(["ADMIN"]),
  idempotencyMiddleware,
  adminManualReversal
);

router.patch(
  "/admin/debt-override",
  financialRateLimiter,
  authenticateJWT,
  requireRole(["ADMIN"]),
  adminDebtOverride
);

export default router;