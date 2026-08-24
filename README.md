# PostgreSQL ACID Transactions API

A high-concurrency Node.js, Express & TypeScript financial backend engine powered by PostgreSQL and Prisma ORM. Engineered for zero-data-loss P2P atomic digital wallet transfers, user provisioning pipelines, pessimistic row-locking race-condition prevention, strict input sanitization, and multi-layered duplicate protection.

---

## 🏗️ Architecture & Tech Stack

* **Runtime & Framework:** Node.js, Express.js
* **Language:** TypeScript (Strict typing & ESNext compilation target)
* **Database:** PostgreSQL (Relational integrity, JSONB metadata, Decimal precision)
* **ORM:** Prisma ORM v7 with `@prisma/adapter-pg`
* **Execution Environment:** `tsx`, Node `pg` connection pool, `dotenv`

---

## ⚙️ Core System Architecture & Implementation Phases

### 🔹 Phase 1 & 2: Foundation & User Provisioning Pipeline
* **Atomic User & Wallet Signup:** Executes an atomic `$transaction` during user creation (`POST /api/users/signup`), ensuring every new `User` record is instantly provisioned with a default `$1000.00` balance `Wallet`.
* **Financial Precision Modeling:** Utilizes PostgreSQL `Decimal(12, 2)` types to eliminate floating-point arithmetic rounding errors common in monetary calculations.
* **Relational Schema Setup:** Establishes strict 1-to-1 relationships between `User` and `Wallet`, along with normalized `Order`, `OrderItem`, and `WalletTransaction` ledgers.

### 🛡️ Phase 3: Financial Prevention Layer (P2P Atomic Transfers)
The system implements a 6-tier security and consistency architecture for high-concurrency wallet transfers:

1. **ACID Atomic Transfers & Rollback Guarantees:**
   * Executed within Prisma's interactive `$transaction`. If any ledger entry or balance mutation fails, the database automatically rolls back all state changes completely.
2. **Pessimistic Row Locking (`FOR UPDATE`) & Deadlock Prevention:**
   * Executes raw PostgreSQL SQL (`SELECT id FROM "Wallet" WHERE "userId" = $1 FOR UPDATE`) to acquire exclusive database row locks.
   * **Deterministic Lock Ordering:** Sender and Receiver User IDs are sorted alphabetically (`[senderUserId, receiverUserId].sort()`) prior to acquiring locks. This guarantees concurrent bidirectional transfers (User A → B and User B → A) lock resources in identical order, completely eliminating database deadlocks.
3. **Strict Input Guard & Payload Sanitization (`parseAndValidateAmount`):**
   * Enforces strict regex patterns (`/^\d+(\.\d{1,2})?$/`) permitting only positive values with up to 2 decimal places.
   * Rejects alphabetic strings (`gh34`), operator exploits (`*10`), negative amounts (`-100`), zero transactions (`0`), float precision exploits (> 2 decimal places), non-numeric types, and self-transfers (`senderUserId === receiverUserId`).
4. **Idempotency Middleware Protection:**
   * Validates `x-idempotency-key` HTTP headers to prevent duplicate processing caused by rapid UI button clicks or network retries.
5. **5-Second Short-Window Duplicate Protection:**
   * In-database defense check that intercepts rapid duplicate requests even when idempotency headers are missing. Rejects transactions if an identical transfer (same sender, same receiver, exact same amount) was recorded within the last 5 seconds.
6. **Double-Entry Accounting Ledger:**
   * Creates paired, immutable audit records (`DEBIT` entry for the sender and `CREDIT` entry for the receiver) in `WalletTransaction` for every transfer.

---

## 🗄️ Database Schema Design

The relational model utilizes PostgreSQL-specific features to ensure high data integrity and auditability:

* **`User`**: Core identity table. Indexed on `email` for rapid authentication lookups.
* **`Wallet`**: Enforces a strictly `1-to-1` relationship with `User`. Uses `Decimal(12, 2)` to eliminate floating-point arithmetic rounding errors.
* **`WalletTransaction`**: Immutable ledger recording `CREDIT` and `DEBIT` events. Uses a composite index on `[walletId, createdAt]` for fast historical queries.
* **`Product`**: Inventory table incorporating `JSONB` for `metadata`, allowing flexible schema-less attributes (e.g., dynamic hardware specifications) within structured SQL tables.
* **`Order` & `OrderItem`**: Normalized checkout records representing exact snapshot pricing and relational integrity at purchase time.

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

# 4. Seed initial state (Users, Wallets, Products)
npx prisma db seed

# 5. Launch development server with hot-reloading
npm run dev
```

### 3. Automated CLI Test Suite

Execute the comprehensive CLI test suite to verify atomic transactions, payload validation, exploit rejection, and duplicate guards:

```bash
npx tsx scripts/run-atomic-wallet-transfer-test.ts
```

**CLI Test Suite Coverage:**
* ✅ **Test 1:** Valid P2P Transfer ($50.00) & Real-time Balance Verification
* ✅ **Test 2:** Garbage String Exploit Rejection (`'gh34'`)
* ✅ **Test 3:** Operator Exploit Rejection (`'*10'`)
* ✅ **Test 4:** Negative Value Exploit Rejection (`-100`)
* ✅ **Test 5:** Zero Amount Transfer Rejection (`0`)
* ✅ **Test 6:** Invalid Decimal Precision Rejection (`10.1234`)
* ✅ **Test 7:** Self-Transfer Prevention Guard
* ✅ **Test 8:** 5-Second Short-Window Duplicate Protection Guard

---

## 📡 API Reference

### 👤 User Module (`/api/users`)

| Method | Endpoint | Description | Payload Example |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/users/signup` | Executes an atomic `$transaction` to persist a `User` and provision a default `$1000.00` wallet balance. | `{"name": "Anas Khalid", "email": "anas@example.com"}` |
| `GET` | `/api/users` | Aggregates all registered users and their relational wallet context. | *None* |

### 💳 Wallet Module (`/api/wallets`)

| Method | Endpoint | Description | Payload / Headers |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/wallets` | Retrieves a list of all operational wallets. | *None* |
| `GET` | `/api/wallets/:userId` | Looks up a specific wallet balance utilizing the `userId` foreign key. | *None* |
| `POST` | `/api/wallets/transfer` | Executes high-concurrency P2P atomic wallet transfer with row locking & duplicate guards. | **Headers:** `x-idempotency-key: <UUID>`<br>**Body:** `{"senderUserId": "f94a089f-...", "receiverUserId": "c5d7e043-...", "amount": 50.00}` |

### 📦 Product Module (`/api/products`)

| Method | Endpoint | Description | Payload Example |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Fetches available inventory, exposing standard columns and JSONB `metadata`. | *None* |

---

## 🛣️ Engineering Roadmap

- [x] **Phase 1:** Core Initialization, TS Configurations & Prisma v7 DB Connection.
- [x] **Phase 2:** User Provisioning Pipeline with Atomic Wallet Initialization.
- [x] **Phase 3:** P2P Atomic Ledger Transfers & Prevention Layer (ACID, `FOR UPDATE` Row Locking, Idempotency Middleware, 5-Sec Short-Window Guard, Strict Input Guard, CLI Test Suite).
- [ ] **Phase 4:** Financial Recovery & Reversal Engine (System Reserve Float Wallet, Double-Entry Reversal Engine, Overdraft & Negative Balance Math, Auto Debt Offset on Deposit, Reconciliation Cron Job).
- [ ] **Phase 5:** PostgreSQL JSONB Filtering Engine (Dynamic parameter searching via JSONB queries & GIN indexing).
- [ ] **Phase 6:** Database Indexing & Query Performance Benchmarking (`EXPLAIN ANALYZE`, B-Tree / GIN tuning).
- [ ] **Phase 7:** Immutable Audit Logging, Soft Deletes & Cursor-Based Pagination.
