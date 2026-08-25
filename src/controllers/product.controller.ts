import { Request, Response } from "express";
import { prisma } from "../config/db";

export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const products = await prisma.product.findMany();
    res.status(200).json({ success: true, count: products.length, data: products });
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