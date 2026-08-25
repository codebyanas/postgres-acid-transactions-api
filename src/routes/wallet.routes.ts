import { Router } from "express";
import { idempotencyMiddleware } from "../middlewares/idempotency.middleware";
import { 
  transferFunds,
  reverseTransaction,
  depositFunds,
  getAllWallets,
  getWalletByUserId
} from "../controllers/wallet.controller";

const router = Router();

router.get("/", getAllWallets);
router.get("/:userId", getWalletByUserId);

// Attach Idempotency Middleware to the transfer POST endpoint
router.post("/transfer", idempotencyMiddleware, transferFunds);
router.post("/reverse", idempotencyMiddleware, reverseTransaction);
router.post("/deposit", idempotencyMiddleware, depositFunds);

export default router;