# PostgreSQL ACID Transactions API
A high-concurrency Node.js, Express & TypeScript backend engine powered by PostgreSQL and Prisma ORM, featuring atomic digital wallet transactions, race-condition handling, and JSONB dynamic indexing.

---

## 🏗️ Architecture & Tech Stack

*   **Runtime & Framework:** Node.js, Express.js
*   **Language:** TypeScript (Strict typing)
*   **Database:** PostgreSQL (Relational integrity, JSONB, Decimal precision)
*   **ORM:** Prisma ORM v7 with `@prisma/adapter-pg`
*   **Execution Environment:** `tsx`, Node `pg` pool, `dotenv`

---

## 🗄️ Database Schema Design

The relational model utilizes PostgreSQL-specific features to ensure data integrity and performance:

*   **`User`**: Core identity table. Indexed on `email` for rapid authentication lookups.
*   **`Wallet`**: Enforces a strictly `1-to-1` relationship with `User`. Uses `Decimal(12, 2)` to prevent floating-point anomalies common in financial applications.
*   **`WalletTransaction`**: Immutable ledger recording `CREDIT` and `DEBIT` events. Uses a composite index on `[walletId, createdAt]` for performant historical queries.
*   **`Product`**: Inventory table. Incorporates `JSONB` for `metadata`, allowing flexible schema-less attributes (e.g., dynamic hardware specifications) within a structured table.
*   **`Order` & `OrderItem`**: Normalized checkout records representing exact snapshot pricing and relational integrity at the time of purchase.

---

## 🚀 Local Development Setup

### 1. Prerequisites
Ensure a local PostgreSQL instance is running. Define your connection string and application port in a `.env` file at the project root:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/postgres_acid_db"
PORT=5000
```

### 2. Initialization Workflow

Execute the following sequence to bootstrap the environment:

```bash
# 1. Install dependencies
npm install

# 2. Apply database migrations
npm run db:migrate

# 3. Generate Prisma Client bindings
npm run db:generate

# 4. Seed initial state (1 User, 1 Wallet, 2 Products)
npx prisma db seed

# 5. Launch development server with hot-reloading
npm run dev
```

---

## 📡 API Reference

### 👤 User Module (`/api/users`)

| Method | Endpoint | Description | Payload Example |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/users/signup` | Executes an atomic `$transaction` to persist a `User` and provision a default `$1000.00` balance `Wallet`. | `{"name": "Anas Khalid", "email": "anas@example.com"}` |
| `GET` | `/api/users` | Aggregates all registered users and their relational wallet context. | *None* |

### 💳 Wallet Module (`/api/wallets`)

| Method | Endpoint | Description | Payload Example |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/wallets` | Retrieves a comprehensive list of all operational wallets. | *None* |
| `GET` | `/api/wallets/:userId` | Looks up a specific wallet balance utilizing the `userId` foreign key. | *None* |

### 📦 Product Module (`/api/products`)

| Method | Endpoint | Description | Payload Example |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Fetches available inventory, exposing standard columns and JSONB `metadata`. | *None* |

---

## 🛣️ Engineering Roadmap

- [x] **Phase 1:** Core Initialization, TS Configurations & Prisma v7 DB Connection.
- [x] **Phase 2:** User Provisioning Pipeline with Atomic Wallet Initialization.
- [ ] **Phase 3:** P2P Atomic Ledger Transfers (`/wallet/transfer` with strictly enforced rollbacks).
- [ ] **Phase 4:** Dynamic Parameter Searching via PostgreSQL `JSONB` querying.
- [ ] **Phase 5:** High-Concurrency Flash-Sale Engine (Implementing row-level locking or optimistic concurrency control).
- [ ] **Phase 6:** Data Seeding (`@faker-js/faker`) & Optimized Cursor-Based Pagination for ledger history.
