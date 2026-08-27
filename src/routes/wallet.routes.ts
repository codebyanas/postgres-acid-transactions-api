import { Router } from "express";
import { idempotencyMiddleware } from "../middlewares/idempotency.middleware";
import { authenticateJWT, requireRole } from "../middlewares/auth.middleware";
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

const router = Router();

// Public / General User Endpoints
router.get("/", getAllWallets);
router.get("/:userId", getWalletByUserId);
router.get("/:walletId/transactions", getWalletTransactions);

// Standard Financial Operations (Enforced with Idempotency)
router.post("/transfer", idempotencyMiddleware, transferFunds);
router.post("/reverse", idempotencyMiddleware, reverseTransaction);
router.post("/deposit", idempotencyMiddleware, depositFunds);

// Administrative Operations (Locked with Auth JWT, ADMIN RBAC Guard & Audit Logging)
router.patch(
  "/admin/freeze/:walletId",
  authenticateJWT,
  requireRole(["ADMIN"]),
  toggleWalletFreeze
);

router.post(
  "/admin/reversal",
  authenticateJWT,
  requireRole(["ADMIN"]),
  idempotencyMiddleware,
  adminManualReversal
);

router.patch(
  "/admin/debt-override",
  authenticateJWT,
  requireRole(["ADMIN"]),
  adminDebtOverride
);

export default router;