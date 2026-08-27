import app from "./app";
import { connectDB, disconnectDB } from "./config/db";
import { runReconciliationAudit } from "./jobs/reconciliation.cron";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Connect Database
  await connectDB();

  // Run initial background audit check on server boot
  runReconciliationAudit();

  // Set periodic background worker run (Executes automatically every 15 minutes)
  const FIFTEEN_MINUTES = 15 * 60 * 1000;
  const cronInterval = setInterval(() => {
    runReconciliationAudit();
  }, FIFTEEN_MINUTES);

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Graceful Shutdown Signals
  const handleShutdown = async (signal: string) => {
    console.log(`\n ${signal} received. Closing HTTP server & Database...`);
    clearInterval(cronInterval); // Clear periodic worker timer
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
};

startServer();