import app from "./app";
import { connectDB, disconnectDB } from "./config/db";
import { runReconciliationAudit } from "./jobs/reconciliation.cron";
import { validateEnv } from "./config/env.config";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Security Hardening: Validate environment configuration prior to database initialization
  validateEnv();

  // Initialize active database connection
  await connectDB();

  // Execute initial background audit check on local server startup
  runReconciliationAudit();

  // Schedule background worker for local development environment (Runs every 15 minutes)
  const FIFTEEN_MINUTES = 15 * 60 * 1000;
  const cronInterval = setInterval(() => {
    console.log("⏰ [LOCAL WORKER] Running scheduled financial audit...");
    runReconciliationAudit();
  }, FIFTEEN_MINUTES);

  const server = app.listen(PORT, () => {
    console.log(`🚀 Local Server running on http://localhost:${PORT}`);
  });

  // Graceful Shutdown Handler
  const handleShutdown = async (signal: string) => {
    console.log(`\n ⚠️ ${signal} received. Closing HTTP server & Database connections...`);
    clearInterval(cronInterval);
    server.close(async () => {
      await disconnectDB();
      console.log("✅ Cleanup complete. Process exiting gracefully.");
      process.exit(0);
    });
  };

  // Register OS Termination Signal Listeners
  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  // Global Unhandled Promise Rejection Handler
  process.on("unhandledRejection", (reason: any) => {
    console.error("🚨 [UNHANDLED REJECTION] Asynchronous exception caught outside Express scope:", reason);
  });

  // Global Uncaught Synchronous Exception Handler
  process.on("uncaughtException", (error: Error) => {
    console.error("🚨 [UNCAUGHT EXCEPTION] Synchronous fatal error caught:", error.message);
    console.error(error.stack);
  });
};

startServer();