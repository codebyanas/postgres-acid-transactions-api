import app from "./app";
import { connectDB, disconnectDB } from "./config/db";
import { runReconciliationAudit } from "./jobs/reconciliation.cron";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Connect Database
  await connectDB();

  // Run initial background audit check on server start
  runReconciliationAudit();

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Graceful Shutdown Signals
  const handleShutdown = async (signal: string) => {
    console.log(`\n ${signal} received. Closing HTTP server & Database...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
};

startServer();