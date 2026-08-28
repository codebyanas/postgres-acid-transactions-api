import express, { Application, Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet"; 
import userRoutes from "./routes/user.routes";
import productRoutes from "./routes/product.routes";
import walletRoutes from "./routes/wallet.routes";
import benchmarkRoutes from "./routes/benchmark.routes";
import cronRoutes from "./routes/cron.routes";
import { globalRateLimiter } from "./middlewares/rateLimiter.middleware";
import { globalErrorHandler } from "./middlewares/errorHandler.middleware";

const app: Application = express();

// Security Hardening: Set HTTP response headers via Helmet
app.use(helmet());

// Security Hardening: Apply global IP rate limiting across all API endpoints
app.use(globalRateLimiter);

app.use(cors());

// Health Check Route
app.get("/", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Welcome!",
    status: "Server is healthy and running",
  });
});

// Silence HTTP morgan logs during unit/integration test runs
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.use(express.json());

// API Domain Route Handlers
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/benchmark", benchmarkRoutes);

// Register Cron endpoint for Vercel scheduled execution
app.use("/api/cron", cronRoutes);

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "OK", message: "Server is running smoothly!" });
});

app.get("/test-crash", (req, res) => {
  throw new Error("Database connection lost!");
});

// Centralized Production Global Error Handler Middleware
app.use(globalErrorHandler);

export default app;