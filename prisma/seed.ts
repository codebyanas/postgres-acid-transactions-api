import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { faker } from "@faker-js/faker";
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
  console.log("🚀 Starting MASSIVE 100,000 Product Faker Seeding for Benchmark...");

  // Foreign key dependency cleanup
  await prisma.orderItem.deleteMany().catch(() => {});
  await prisma.order.deleteMany().catch(() => {});
  await prisma.walletTransaction.deleteMany().catch(() => {});
  await prisma.wallet.deleteMany().catch(() => {});
  await prisma.user.deleteMany().catch(() => {});
  await prisma.product.deleteMany().catch(() => {});

  // 1. System Reserve User
  const systemReserveUser = await prisma.user.create({
    data: {
      name: "System Reserve Float",
      email: "system.reserve@bank.internal",
      wallet: { create: { balance: 1000000.0, status: "ACTIVE" } },
    },
  });

  // 2. Primary & Secondary Test Users
  const user1 = await prisma.user.create({
    data: {
      name: "Anas",
      email: "anas@example.com",
      wallet: { create: { balance: 1000.0, status: "ACTIVE" } },
    },
  });

  const user2 = await prisma.user.create({
    data: {
      name: "Bilal Ahmed",
      email: "bilal@example.com",
      wallet: { create: { balance: 100.0, status: "ACTIVE" } },
    },
  });

  // Configuration Arrays
  const categories = ["electronics", "apparel", "footwear", "accessories"];
  const electronicsBrands = ["Apple", "Dell", "Asus", "Lenovo", "Sony", "HP", "Acer"];
  const apparelBrands = ["Nike", "Adidas", "Zara", "UrbanWear", "Levi's", "H&M"];
  const footwearBrands = ["Nike", "Adidas", "Puma", "Reebok", "New Balance"];
  const accessoryBrands = ["Logitech", "Keychron", "Anker", "Razer", "Corsair"];

  const ramOptions = ["8GB", "16GB", "32GB", "64GB"];
  const storageOptions = ["256GB SSD", "512GB SSD", "1TB SSD", "2TB SSD"];
  const cpuOptions = ["Intel i7", "Intel i9", "M3 Pro", "AMD Ryzen 7", "M3 Max"];
  const sizes = ["S", "M", "L", "XL", "XXL"];
  const colors = ["Black", "White", "Blue", "Red", "Grey", "Silver"];

  const TOTAL_PRODUCTS = 100000;
  const BATCH_SIZE = 5000; // Fast execution with memory safety

  console.log(`📦 Seeding ${TOTAL_PRODUCTS} items in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < TOTAL_PRODUCTS; i += BATCH_SIZE) {
    const productsBatch = [];

    for (let j = 0; j < BATCH_SIZE; j++) {
      const category = faker.helpers.arrayElement(categories);
      let brand = "";
      let metadata: Record<string, any> = { category };

      if (category === "electronics") {
        brand = faker.helpers.arrayElement(electronicsBrands);
        metadata = {
          category,
          brand,
          tags: ["tech", faker.commerce.productAdjective(), "gadget"],
          specs: {
            ram: faker.helpers.arrayElement(ramOptions),
            storage: faker.helpers.arrayElement(storageOptions),
            cpu: faker.helpers.arrayElement(cpuOptions),
          },
          warehouse: { zone: faker.helpers.arrayElement(["A1", "A2", "B1"]) },
        };
      } else if (category === "apparel") {
        brand = faker.helpers.arrayElement(apparelBrands);
        metadata = {
          category,
          brand,
          tags: ["clothing", faker.commerce.productAdjective()],
          specs: {
            size: faker.helpers.arrayElement(sizes),
            color: faker.helpers.arrayElement(colors),
          },
        };
      } else if (category === "footwear") {
        brand = faker.helpers.arrayElement(footwearBrands);
        metadata = {
          category,
          brand,
          tags: ["shoes", faker.commerce.productAdjective()],
          specs: {
            eu_size: faker.number.int({ min: 38, max: 46 }),
            color: faker.helpers.arrayElement(colors),
          },
        };
      } else {
        brand = faker.helpers.arrayElement(accessoryBrands);
        metadata = {
          category,
          brand,
          tags: ["accessory"],
          specs: {
            connectivity: faker.helpers.arrayElement(["Wired", "Wireless", "Bluetooth"]),
            color: faker.helpers.arrayElement(colors),
          },
        };
      }

      productsBatch.push({
        title: `${brand} ${faker.commerce.productName()}`,
        price: parseFloat(faker.commerce.price({ min: 15, max: 2500, dec: 2 })),
        stock: faker.number.int({ min: 0, max: 100 }),
        metadata,
      });
    }

    await prisma.product.createMany({ data: productsBatch });
    console.log(`✅ Progress: ${i + BATCH_SIZE} / ${TOTAL_PRODUCTS} products inserted`);
  }

  console.log("🎉 MASSIVE 100,000 JSONB Products Seeding Completed!");
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