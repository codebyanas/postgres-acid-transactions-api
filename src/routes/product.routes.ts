import { Router } from "express";
import { getProducts, searchProductsByJsonb } from "../controllers/product.controller";

const router = Router();

// Specific routes pehle aate hain taake `/search` path match ho sake
router.get("/search", searchProductsByJsonb);
router.get("/", getProducts);

export default router;