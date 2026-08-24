import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in environment variables.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting database seeding...");

  // Delete child records first to respect Foreign Key constraints
  await prisma.order.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();
  await prisma.product.deleteMany();

  // Create primary test user (User A)
  const user1 = await prisma.user.create({
    data: {
      name: "Anas",
      email: "anas@example.com",
      wallet: {
        create: {
          balance: 1000.0,
        },
      },
    },
    include: {
      wallet: true,
    },
  });

  // Create secondary test user (User B for P2P transfers)
  const user2 = await prisma.user.create({
    data: {
      name: "Bilal Ahmed",
      email: "bilal@example.com",
      wallet: {
        create: {
          balance: 100.0,
        },
      },
    },
    include: {
      wallet: true,
    },
  });

  // Create test products
  const product1 = await prisma.product.create({
    data: {
      title: "Gaming Laptop",
      price: 1200.0,
      stock: 5,
      metadata: { category: "electronics", brand: "Asus" },
    },
  });

  const product2 = await prisma.product.create({
    data: {
      title: "Wireless Mouse",
      price: 50.0,
      stock: 20,
      metadata: { category: "accessories", brand: "Logitech" },
    },
  });

  console.log("✅ Seeding completed successfully!");
  console.log("Created User 1 (Sender):", user1.id);
  console.log("Created User 2 (Receiver):", user2.id);
  console.log("Created Products:", { p1: product1.id, p2: product2.id });
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });