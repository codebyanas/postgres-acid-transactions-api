import { Router } from "express";
import { benchmarkTransactionLedger } from "../controllers/benchmark.controller";

const router = Router();

router.get("/transactions", benchmarkTransactionLedger);

export default router;