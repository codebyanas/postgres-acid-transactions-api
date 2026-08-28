import { PrismaClient, TransactionType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { faker } from "@faker-js/faker";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in environment variables.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🚀 Starting Complete Database Seeding (Users, Wallets, Transactions & Products)...");

  // Foreign key dependency cleanup
  console.log("🧹 Cleaning up old database records...");
  await prisma.auditLog.deleteMany().catch(() => {});
  await prisma.orderItem.deleteMany().catch(() => {});
  await prisma.order.deleteMany().catch(() => {});
  await prisma.walletTransaction.deleteMany().catch(() => {});
  await prisma.wallet.deleteMany().catch(() => {});
  await prisma.user.deleteMany().catch(() => {});
  await prisma.product.deleteMany().catch(() => {});

  // In-memory map to track exact ledger balances across all wallets to ensure zero reconciliation disparity
  const walletBalanceMap = new Map<string, number>();
  const initialTxBatch: any[] = [];

  // 1. Core / Reserved Users Setup
  console.log("👤 Creating Primary & System Users...");
  const systemReserveUser = await prisma.user.create({
    data: {
      name: "System Reserve Float",
      email: "system.reserve@bank.internal",
      wallet: { create: { balance: 1000000.0, status: "ACTIVE" } },
    },
    include: { wallet: true },
  });

  const user1 = await prisma.user.create({
    data: {
      name: "Anas",
      email: "anas@example.com",
      wallet: { create: { balance: 100000.0, status: "ACTIVE" } },
    },
    include: { wallet: true },
  });

  const user2 = await prisma.user.create({
    data: {
      name: "Bilal Ahmed",
      email: "bilal@example.com",
      wallet: { create: { balance: 100000.0, status: "ACTIVE" } },
    },
    include: { wallet: true },
  });

  // Register baseline balances and generate initial CREDIT ledger entries for core users
  const coreWallets = [
    { wallet: systemReserveUser.wallet!, user: systemReserveUser, balance: 1000000.0 },
    { wallet: user1.wallet!, user: user1, balance: 100000.0 },
    { wallet: user2.wallet!, user: user2, balance: 100000.0 },
  ];

  for (const item of coreWallets) {
    walletBalanceMap.set(item.wallet.id, item.balance);
    initialTxBatch.push({
      id: randomUUID(),
      walletId: item.wallet.id,
      amount: item.balance,
      type: TransactionType.CREDIT,
      description: "Initial System Capital Deposit",
      senderName: "SYSTEM_RESERVE",
      receiverName: item.user.name,
      idempotencyKey: `seed_initial_${randomUUID()}`,
      createdAt: faker.date.past({ years: 2 }),
    });
  }

  // Pool of wallet references for transactions
  const walletPool: { walletId: string; userName: string }[] = [
    { walletId: systemReserveUser.wallet!.id, userName: systemReserveUser.name },
    { walletId: user1.wallet!.id, userName: user1.name },
    { walletId: user2.wallet!.id, userName: user2.name },
  ];

  // 2. Bulk Seed Dummy Users & Funded Wallets
  // const TOTAL_USERS = 500; // Original count for local testing
  const TOTAL_USERS = 25; // Reduced for Supabase Free Tier

  console.log(`👥 Bulk generating ${TOTAL_USERS} dummy users with funded wallets ($50k - $100k capital)...`);

  const usersData = [];
  const walletsData = [];

  for (let i = 0; i < TOTAL_USERS; i++) {
    const userId = randomUUID();
    const walletId = randomUUID();
    const userName = faker.person.fullName();
    const initialCapital = parseFloat(faker.finance.amount({ min: 50000, max: 100000, dec: 2 }));

    usersData.push({
      id: userId,
      name: userName,
      email: `user_${i}_${faker.internet.email().toLowerCase()}`,
    });

    walletsData.push({
      id: walletId,
      userId: userId,
      balance: initialCapital,
      status: "ACTIVE" as const,
    });

    walletPool.push({ walletId, userName });
    walletBalanceMap.set(walletId, initialCapital);

    // Create matching initial CREDIT transaction entry to balance audit ledgers
    initialTxBatch.push({
      id: randomUUID(),
      walletId: walletId,
      amount: initialCapital,
      type: TransactionType.CREDIT,
      description: "Initial Capital Seed Grant",
      senderName: "SYSTEM_RESERVE",
      receiverName: userName,
      idempotencyKey: `seed_initial_${randomUUID()}`,
      createdAt: faker.date.past({ years: 2 }),
    });
  }

  await prisma.user.createMany({ data: usersData });
  await prisma.wallet.createMany({ data: walletsData });

  // Bulk insert all initial baseline CREDIT transactions
  await prisma.walletTransaction.createMany({ data: initialTxBatch });
  console.log(`✅ ${TOTAL_USERS} Users, Wallets, and Initial Credit Transactions created successfully!`);

  // 3. Bulk Seed Historical Wallet Transactions for B-Tree Index Benchmarking
  // const TOTAL_TRANSACTIONS = 100000; // Original count for local testing
  // const TX_BATCH_SIZE = 10000; // Original batch size for local testing
  const TOTAL_TRANSACTIONS = 200; // Reduced for Supabase Free Tier
  const TX_BATCH_SIZE = 50; // Reduced batch size for Supabase Free Tier

  console.log(`💳 Seeding ${TOTAL_TRANSACTIONS} historical transactions in batches of ${TX_BATCH_SIZE}...`);

  for (let i = 0; i < TOTAL_TRANSACTIONS; i += TX_BATCH_SIZE) {
    const txBatch = [];

    for (let j = 0; j < TX_BATCH_SIZE; j++) {
      const sender = faker.helpers.arrayElement(walletPool);
      let receiver = faker.helpers.arrayElement(walletPool);
      while (receiver.walletId === sender.walletId) {
        receiver = faker.helpers.arrayElement(walletPool);
      }

      const amount = parseFloat(faker.finance.amount({ min: 20, max: 1500, dec: 2 }));
      const isDebit = faker.datatype.boolean();
      const targetWalletId = isDebit ? sender.walletId : receiver.walletId;

      // Update in-memory wallet balance map to reflect every historical DEBIT/CREDIT transaction
      const currentBalance = walletBalanceMap.get(targetWalletId) || 0;
      if (isDebit) {
        walletBalanceMap.set(targetWalletId, parseFloat((currentBalance - amount).toFixed(2)));
      } else {
        walletBalanceMap.set(targetWalletId, parseFloat((currentBalance + amount).toFixed(2)));
      }

      txBatch.push({
        id: randomUUID(),
        walletId: targetWalletId,
        amount: amount,
        type: isDebit ? TransactionType.DEBIT : TransactionType.CREDIT,
        description: isDebit
          ? `Transfer to ${receiver.userName}`
          : `Payment received from ${sender.userName}`,
        senderName: sender.userName,
        receiverName: receiver.userName,
        idempotencyKey: `seed_tx_${randomUUID()}`,
        createdAt: faker.date.past({ years: 1 }),
      });
    }

    await prisma.walletTransaction.createMany({ data: txBatch });
    console.log(`✅ Transactions Progress: ${i + TX_BATCH_SIZE} / ${TOTAL_TRANSACTIONS} inserted`);
  }

  // Synchronize all final calculated balances directly into the Wallet database records
  console.log("🔄 Synchronizing final computed balances to Wallet table...");
  const updatePromises = Array.from(walletBalanceMap.entries()).map(([walletId, finalBalance]) =>
    prisma.wallet.update({
      where: { id: walletId },
      data: { balance: finalBalance },
    })
  );
  await Promise.all(updatePromises);
  console.log("✅ All wallet balances synchronized with transaction ledger history!");

  // 4. Bulk Seed JSONB Products
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

  // const TOTAL_PRODUCTS = 100000; // Original count for local testing
  // const PRODUCT_BATCH_SIZE = 5000; // Original batch size for local testing
  const TOTAL_PRODUCTS = 100; // Reduced for Supabase Free Tier
  const PRODUCT_BATCH_SIZE = 50; // Reduced batch size for Supabase Free Tier

  console.log(`📦 Seeding ${TOTAL_PRODUCTS} JSONB products in batches of ${PRODUCT_BATCH_SIZE}...`);

  for (let i = 0; i < TOTAL_PRODUCTS; i += PRODUCT_BATCH_SIZE) {
    const productsBatch = [];

    for (let j = 0; j < PRODUCT_BATCH_SIZE; j++) {
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
    console.log(`✅ Products Progress: ${i + PRODUCT_BATCH_SIZE} / ${TOTAL_PRODUCTS} inserted`);
  }

  console.log("🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY!");
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