import { Request, Response } from "express";
import { prisma } from "../config/db";
import { createAuditLog } from "../utils/auditLogger.util";
import { AuditAction } from "@prisma/client";
import { encodeCursor, decodeCursor } from "../utils/cursor.util";

/**
 * Fetch products using Cursor-Based (Seek) or Offset-Based (Skip) Pagination.
 * Automatically excludes soft-deleted records via Prisma Extension.
 */
export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const cursorParam = req.query.cursor as string | undefined;
    const skipParam = req.query.skip as string | undefined;

    let cursorObj: { id: string } | null = null;
    if (cursorParam) {
      cursorObj = decodeCursor<{ id: string }>(cursorParam);
      if (!cursorObj || !cursorObj.id) {
        res.status(400).json({
          success: false,
          error: "Invalid pagination cursor string provided.",
        });
        return;
      }
    }

    const startTime = performance.now();

    // Fetch limit + 1 records to evaluate if a next page exists
    const products = await prisma.product.findMany({
      take: limit + 1,
      ...(skipParam && !cursorObj
        ? { skip: parseInt(skipParam) }
        : cursorObj
        ? { cursor: { id: cursorObj.id }, skip: 1 }
        : {}),
      orderBy: { id: "asc" },
    });

    const endTime = performance.now();
    const executionTimeMs = parseFloat((endTime - startTime).toFixed(3));

    const hasMore = products.length > limit;
    const data = hasMore ? products.slice(0, limit) : products;

    let nextCursor: string | null = null;
    if (hasMore && data.length > 0) {
      const lastItem = data[data.length - 1];
      nextCursor = encodeCursor({ id: lastItem.id });
    }

    res.status(200).json({
      success: true,
      executionTimeMs,
      meta: {
        limit,
        strategy: skipParam ? "OFFSET (SKIP)" : cursorParam ? "CURSOR (SEEK)" : "FIRST PAGE",
        hasMore,
        nextCursor,
        count: data.length,
      },
      data,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Fetch a single product by ID.
 * Returns 404 if product does not exist or has been soft-deleted.
 */
export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const product = await prisma.product.findFirst({
      where: { id },
    });

    if (!product) {
      res.status(404).json({
        success: false,
        error: "Product not found or has been soft-deleted.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Filter products using PostgreSQL JSONB deep matching.
 */
export const searchProductsByJsonb = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, brand, ram, storage, cpu, zone, connectivity, color } = req.query;

    const metadataFilter: Record<string, any> = {};

    if (category) metadataFilter.category = category;
    if (brand) metadataFilter.brand = brand;

    const specsFilter: Record<string, any> = {};
    if (ram) specsFilter.ram = ram;
    if (storage) specsFilter.storage = storage;
    if (cpu) specsFilter.cpu = cpu;
    if (color) specsFilter.color = color;
    if (connectivity) specsFilter.connectivity = connectivity;

    if (Object.keys(specsFilter).length > 0) {
      metadataFilter.specs = specsFilter;
    }

    if (zone) {
      metadataFilter.warehouse = { zone };
    }

    if (Object.keys(metadataFilter).length === 0) {
      res.status(400).json({
        success: false,
        message: "Please provide query parameters.",
      });
      return;
    }

    const jsonString = JSON.stringify(metadataFilter);

    const startTime = performance.now();

    // Query raw enforces deletedAt NULL check for JSONB search
    const products: any[] = await prisma.$queryRaw`
      SELECT id, title, price, stock, metadata
      FROM "Product"
      WHERE metadata @> ${jsonString}::jsonb
        AND "deletedAt" IS NULL
    `;

    const endTime = performance.now();
    const executionTimeMs = parseFloat((endTime - startTime).toFixed(3));

    res.status(200).json({
      success: true,
      executionTimeMs,
      count: products.length,
      filterApplied: metadataFilter,
      data: products,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Soft delete a product record and automatically append an immutable audit log entry.
 */
export const softDeleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const existingProduct = await prisma.product.findFirst({
      where: { id },
    });

    if (!existingProduct) {
      res.status(404).json({
        success: false,
        error: "Product not found or already soft-deleted.",
      });
      return;
    }

    // Mutate deletedAt timestamp via extension
    await prisma.product.delete({
      where: { id },
    });

    // Write immutable audit log entry for soft delete operation
    if (req.user) {
      await createAuditLog({
        actorId: req.user.id,
        role: req.user.role,
        action: AuditAction.SOFT_DELETE,
        resource: "Product",
        resourceId: id,
        ipAddress: req.ip,
        metadata: { productTitle: (existingProduct as any).title },
      });
    }

    res.status(200).json({
      success: true,
      message: `Product with ID ${id} soft-deleted successfully.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Admin endpoint to restore a soft-deleted product and write audit trail.
 */
export const restoreProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const restoredProduct = await (prisma.product as any).update({
      where: { id },
      data: { deletedAt: null },
    });

    // Write immutable audit log entry for restore operation
    if (req.user) {
      await createAuditLog({
        actorId: req.user.id,
        role: req.user.role,
        action: AuditAction.RESTORE,
        resource: "Product",
        resourceId: id,
        ipAddress: req.ip,
      });
    }

    res.status(200).json({
      success: true,
      message: `Product with ID ${id} restored successfully.`,
      data: restoredProduct,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};