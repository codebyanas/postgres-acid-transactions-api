import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

/**
 * Strict Environment Variable Schema
 * Validates all required infrastructure variables on application startup.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  
  // Set default string BEFORE transforming it into a number
  PORT: z.string().default("5000").transform((val) => parseInt(val, 10)),
  
  DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid connection URI." }),
  JWT_SECRET: z.string().min(16, { message: "JWT_SECRET must be at least 16 characters long for cryptographic security." }),
});

/**
 * Validates process.env variables and halts server boot if schema validation fails.
 */
export const validateEnv = () => {
  const parseResult = envSchema.safeParse(process.env);

  if (!parseResult.success) {
    console.error("❌ [FATAL] Environment Configuration Error:");
    console.error(parseResult.error.format());
    process.exit(1);
  }

  console.log("✅ [SYSTEM HARDENING] Environment variables successfully validated.");
  return parseResult.data;
};