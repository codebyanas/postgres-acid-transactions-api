import { Request, Response } from "express";
import { prisma } from "../config/db";
import { encodeCursor, decodeCursor } from "../utils/cursor.util";

/**
 * Fetch products using Cursor-Based (Seek) or Offset-Based (Skip) Pagination.
 * Includes executionTimeMs timer for Postman benchmarking.
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

    const products: any[] = await prisma.$queryRaw`
      SELECT id, title, price, stock, metadata
      FROM "Product"
      WHERE metadata @> ${jsonString}::jsonb
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