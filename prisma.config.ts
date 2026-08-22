import { defineConfig } from "@prisma/config";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("FATAL: DATABASE_URL environment variable is missing!");
}

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    seed: "tsx ./prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});