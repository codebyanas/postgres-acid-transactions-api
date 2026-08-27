import { Router } from "express";
import {
  getProducts,
  getProductById,
  searchProductsByJsonb,
  softDeleteProduct,
  restoreProduct,
} from "../controllers/product.controller";
import { authenticateJWT, requireRole } from "../middlewares/auth.middleware";

const router = Router();

// Public routes accessible without authentication
router.get("/search", searchProductsByJsonb);
router.get("/", getProducts);
router.get("/:id", getProductById);

// Protected Admin-Only Endpoints requiring valid JWT & ADMIN role
router.delete(
  "/:id",
  authenticateJWT,
  requireRole(["ADMIN"]),
  softDeleteProduct
);

router.patch(
  "/:id/restore",
  authenticateJWT,
  requireRole(["ADMIN"]),
  restoreProduct
);

export default router;