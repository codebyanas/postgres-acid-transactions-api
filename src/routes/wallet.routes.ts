import { Router } from "express";
import { idempotencyMiddleware } from "../middlewares/idempotency.middleware";
import { 
  transferFunds,
  reverseTransaction,
  depositFunds,
  getAllWallets,
  getWalletByUserId,
  getWalletTransactions
} from "../controllers/wallet.controller";

const router = Router();

router.get("/", getAllWallets);
router.get("/:userId", getWalletByUserId);

// Cursor-Based Paginated Ledger Route
router.get("/:walletId/transactions", getWalletTransactions);

// Attach Idempotency Middleware to financial POST endpoints
router.post("/transfer", idempotencyMiddleware, transferFunds);
router.post("/reverse", idempotencyMiddleware, reverseTransaction);
router.post("/deposit", idempotencyMiddleware, depositFunds);

export default router;