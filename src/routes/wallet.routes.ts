import { Router } from "express";
import { idempotencyMiddleware } from "../middlewares/idempotency.middleware";
import { getAllWallets, getWalletByUserId, transferFunds } from "../controllers/wallet.controller";

const router = Router();

router.get("/", getAllWallets);
router.get("/:userId", getWalletByUserId);

// Attach Idempotency Middleware to the transfer POST endpoint
router.post("/transfer", idempotencyMiddleware, transferFunds);

export default router;