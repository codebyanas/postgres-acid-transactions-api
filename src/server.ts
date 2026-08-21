import app from "./app";
import { connectDB, disconnectDB } from "./config/db";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Database connect karein
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Graceful Shutdown Signals (Ctrl + C ya deployment termination)
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