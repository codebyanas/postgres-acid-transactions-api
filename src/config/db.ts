import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("FATAL ERROR: DATABASE_URL is not defined in .env file.");
  process.exit(1);
}

// Configure PostgreSQL connection pool settings
const pool = new Pool({
  connectionString,
  max: 10,                      // Maximum number of active connections in pool
  idleTimeoutMillis: 30000,     // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Timeout connection attempt after 5 seconds
});

// Listener for unexpected errors on idle pool connections
pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err.message);
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });

// Verify active database connection on application startup
export const connectDB = async (): Promise<void> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("PostgreSQL connected successfully via Prisma v7.");
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};

// Safely close connection pool on application termination
export const disconnectDB = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    await pool.end();
    console.log("PostgreSQL connection pool closed gracefully.");
  } catch (error) {
    console.error("Error during database disconnection:", error);
  }
};