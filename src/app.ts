import express, { Application, Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import userRoutes from "./routes/user.routes";
import productRoutes from "./routes/product.routes";
import walletRoutes from "./routes/wallet.routes";

const app: Application = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/wallet", walletRoutes);

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "OK", message: "Server is running smoothly!" });
});

export default app;