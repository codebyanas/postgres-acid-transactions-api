import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";
import { softDeleteExtension } from "../extensions/softDelete.extension";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("FATAL ERROR: DATABASE_URL is not defined in .env file.");
  process.exit(1);
}

/* ====================================================================
   OLD LOCAL CONNECTION SETUP (Commented out for future local testing)
   ====================================================================
const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err.message);
});

const adapter = new PrismaPg(pool);
const basePrisma = new PrismaClient({ adapter });

export const prisma = basePrisma.$extends(softDeleteExtension);
==================================================================== */

// ====================================================================
// NEW VERCEL SERVERLESS SINGLETON PATTERN (Prevents Connection Leaks)
// ====================================================================

const globalForPrisma = globalThis as unknown as {
  prismaPool?: Pool;
  prismaAdapter?: PrismaPg;
  prismaClient?: any;
};

// Reuse existing pool or create a new one for serverless functions
const pool =
  globalForPrisma.prismaPool ??
  new Pool({
    connectionString,
    max: process.env.NODE_ENV === "production" ? 3 : 10, // Serverless lambdas call ke liye light max pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err.message);
});

const adapter = globalForPrisma.prismaAdapter ?? new PrismaPg(pool);
const basePrisma = globalForPrisma.prismaClient ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaPool = pool;
  globalForPrisma.prismaAdapter = adapter;
  globalForPrisma.prismaClient = basePrisma;
}

// Apply Soft Delete extension to Prisma client instance
export const prisma = basePrisma.$extends(softDeleteExtension);

// Verify active database connection on application startup
export const connectDB = async (): Promise<void> => {
  try {
    await basePrisma.$queryRaw`SELECT 1`;
    console.log("PostgreSQL connected successfully via Prisma v7 with Soft Delete extension.");
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};

// Safely close connection pool on application termination
export const disconnectDB = async (): Promise<void> => {
  try {
    await basePrisma.$disconnect();
    await pool.end();
    console.log("PostgreSQL connection pool closed gracefully.");
  } catch (error) {
    console.error("Error during database disconnection:", error);
  }
};