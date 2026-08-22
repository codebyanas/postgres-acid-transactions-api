import { Router } from "express";
import { getAllWallets, getWalletByUserId } from "../controllers/wallet.controller";

const router = Router();

router.get("/", getAllWallets);
router.get("/:userId", getWalletByUserId);

export default router;