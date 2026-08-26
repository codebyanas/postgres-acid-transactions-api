import { Router } from "express";
import { getProducts, searchProductsByJsonb } from "../controllers/product.controller";

const router = Router();

// Specific routes first to ensure proper matching
router.get("/search", searchProductsByJsonb);
router.get("/", getProducts);

export default router;