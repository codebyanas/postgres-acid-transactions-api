# PostgreSQL ACID Transactions API

A high-concurrency Node.js, Express & TypeScript financial backend engine powered by PostgreSQL and Prisma ORM. Engineered for zero-data-loss P2P atomic digital wallet transfers, user provisioning pipelines, pessimistic row-locking race-condition prevention, automated debt recovery, double-entry reversal mechanics, strict input sanitization, dynamic JSONB search engines at 100k scale, GIN index query optimization, and multi-layered audit logging.

---

## 🏗️ Architecture & Tech Stack

* **Runtime & Framework:** Node.js, Express.js
* **Language:** TypeScript (Strict typing & ESNext compilation target)
* **Database:** PostgreSQL (Relational integrity, JSONB metadata, Decimal precision, GIN Indexing)
* **ORM:** Prisma ORM v7 with `@prisma/adapter-pg`
* **Execution Environment:** `tsx`, Node `pg` connection pool, `dotenv`

---

## ⚙️ Core System Architecture & Implementation Phases

### 🔹 Phase 1 & 2: Foundation & User Provisioning Pipeline
* **Atomic User & Wallet Signup:** Executes an atomic `$transaction` during user creation (`POST /api/users/signup`), ensuring every new `User` record is instantly provisioned with a default `$1000.00` balance `Wallet`.
* **Financial Precision Modeling:** Utilizes PostgreSQL `Decimal(12, 2)` types to eliminate floating-point arithmetic rounding errors common in monetary calculations.
* **Relational Schema Setup:** Establishes strict 1-to-1 relationships between `User` and `Wallet`, along with normalized `Order`, `OrderItem`, and `WalletTransaction` ledgers.

### 🛡️ Phase 3: Financial Prevention Layer (P2P Atomic Transfers)
The system implements a security and consistency architecture for high-concurrency wallet transfers:

1. **ACID Atomic Transfers & Rollback Guarantees:** Executed within Prisma's interactive `$transaction`. If any ledger entry or balance mutation fails, the database automatically rolls back all state changes completely.
2. **Pessimistic Row Locking (`FOR UPDATE`) & Deadlock Prevention:** Executes raw SQL (`SELECT id FROM "Wallet" WHERE "userId" = $1 FOR UPDATE`) to acquire exclusive row locks sorted alphabetically by User ID (`[senderUserId, receiverUserId].sort()`), completely eliminating database deadlocks during concurrent transfers.
3. **Strict Input Guard & Payload Sanitization (`parseAndValidateAmount`):** Enforces strict regex patterns (`/^\d+(\.\d{1,2})?$/`) permitting only positive values up to 2 decimal places. Rejects invalid strings, operator exploits, zero transactions, and self-transfers.
4. **Idempotency Middleware & 5-Sec Short-Window Protection:** Validates `x-idempotency-key` HTTP headers while maintaining an in-database 5-second duplicate check window to intercept rapid repeated requests.
5. **Double-Entry Accounting Ledger:** Creates paired, immutable audit records (`DEBIT` for sender, `CREDIT` for receiver) capturing full details and human-readable names (`senderName`, `receiverName`).

### 🔄 Phase 4: Financial Recovery, Reversal Engine & Debt Management
1. **System Reserve Float Isolation:** Integrates a system-level float user (`system.reserve@bank.internal`) isolated from standard P2P transfer routes to absorb overdraft risks during reversals.
2. **Double-Entry Reversal Engine:** Reverses erroneous primary `DEBIT` entries atomically using paired ledger entries (`REVERSAL_CREDIT` to sender, `REVERSAL_DEBIT` from receiver) while guaranteeing zero double-reversal through explicit transaction tracking.
3. **Negative Balance Overdraft & Status Guarding:** If a receiver spends funds prior to a transaction reversal, their balance drops into a negative deficit (debt). The system automatically transitions their account status to `RESTRICTED`, blocking any outgoing P2P transfers until the debt is cleared.
4. **Automated Debt Offset on Deposit:** Processing incoming deposits (`POST /api/wallets/deposit`) automatically diverts incoming funds to repay system reserve debt first. Once the balance returns to non-negative, the wallet status is automatically restored to `ACTIVE`.
5. **Human-Readable Audit Trail:** Enriches all transaction records with `senderName` and `receiverName` alongside transaction IDs and idempotency keys for instant visual database auditing and reporting.

### ⚡ Phase 5: PostgreSQL JSONB Search Engine & GIN Index Benchmarking (1 million Scale)
1. **Dynamic JSONB Containment Search (`@>`):** Implemented high-performance dynamic searching (`/api/products/search`) querying nested schema-less attributes (`category`, `brand`, `specs.ram`, `specs.cpu`, `warehouse.zone`) using PostgreSQL's `@>` JSONB containment operator.
2. **PostgreSQL GIN Indexing (`JsonbPathOps`):** Permanent database-level indexing via Prisma schema (`@@index([metadata(ops: JsonbPathOps)], type: Gin, name: "idx_product_metadata_gin")`) to accelerate key-value and nested object lookups.
3. **High-Volume Data Pipeline (100,000 Records):** Engineered memory-safe batch seeding (`BATCH_SIZE = 5000`) populating 100,000 rich product entries with multi-level metadata using `@faker-js/faker`.
4. **Cold Storage & RAM Cache Bypass Benchmarking:** Built an automated CLI benchmark suite (`scripts/run-postgres-jsonb-query-test.ts`) executing session cache flushes (`DISCARD ALL`) to measure raw disk I/O performance differences before and after GIN indexing.
5. **Execution Strategy & Performance Metrics:**
   * **Execution Strategy Shift:** Successfully converted database query plan from a costly full table scan (`Seq Scan`) to a high-speed indexed lookup (`Bitmap Heap Scan`).
   * **Query Cost Optimization:** Reduced total PostgreSQL query cost from **4744 → 2022.48** (**57.4% Cost Reduction**).
   * **Execution Latency:** Accelerated deep nested query execution time from **52.6ms → 13.8ms** (**3.8x Speedup**), dropping warm API response latencies down to **~18ms**.

---

## 🗄️ Database Schema Design

* **`User`**: Core identity table. Indexed on `email` for rapid authentication lookups.
* **`Wallet`**: Enforces a `1-to-1` relationship with `User`. Tracks `balance` (`Decimal(12,2)`) and `status` (`ACTIVE`, `FROZEN`, `RESTRICTED`).
* **`WalletTransaction`**: Immutable ledger recording `CREDIT`, `DEBIT`, `REVERSAL_CREDIT`, and `REVERSAL_DEBIT` events. Contains `idempotencyKey`, `senderName`, `receiverName`, and composite indexing on `[walletId, createdAt]`.
* **`Product`**: Inventory table incorporating `JSONB` for `metadata`, configured with a PostgreSQL `GIN` index (`JsonbPathOps`) on `metadata` for ultrafast schema-less query performance.
* **`Order` & `OrderItem`**: Normalized checkout records representing snapshot pricing and purchasing relational integrity.

---

## 🚀 Local Development Setup

### 1. Prerequisites
Define your connection string and application port in a `.env` file at the project root:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/postgres_acid_db"
PORT=5000
```

### 2. Initialization Workflow

```bash
# 1. Install dependencies
npm install

# 2. Apply database schema changes & GIN Indexing
npx prisma db push

# 3. Generate Prisma Client bindings
npx prisma generate

# 4. Seed high-volume test state (100,000 JSONB Products, Users, Wallets, System Reserve Float)
npx prisma db seed
```

### 3. Automated CLI Test Suite

Execute CLI test suites to verify atomic transfers, financial reversals, debt recovery, payload validation, status guards, and JSONB GIN index performance:

```bash
# Atomic Wallet Transfer & Guard Test Suite
npx tsx scripts/run-atomic-wallet-transfer-test.ts

# Financial Recovery & Debt Offset Test Suite
npx tsx scripts/run-financial-recovery-test.ts

# PostgreSQL JSONB GIN Index Benchmark Test Suite (100k Scale)
npx tsx scripts/run-postgres-jsonb-query-test.ts
```

---

## 📡 API Reference

### 👤 User Module (`/api/users`)

| Method | Endpoint | Description | Payload Example |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/users/signup` | Atomically creates a `User` and provisions a default `$1000.00` wallet. | `{"name": "Anas", "email": "anas@example.com"}` |
| `GET` | `/api/users` | Lists registered users and relational wallet context. | *None* |

### 💳 Wallet Module (`/api/wallets`)

| Method | Endpoint | Description | Payload / Headers |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/wallets` | Retrieves all active and restricted wallets. | *None* |
| `POST` | `/api/wallets/transfer` | High-concurrency P2P atomic transfer with status checks & row-locking. | **Headers:** `x-idempotency-key: <UUID>`<br>**Body:** `{"senderUserId": "...", "receiverUserId": "...", "amount": 60.00}` |
| `POST` | `/api/wallets/reverse` | Executes double-entry reversal with negative balance overdraft handling. | **Headers:** `x-idempotency-key: <UUID>`<br>**Body:** `{"transactionId": "..."}` |
| `POST` | `/api/wallets/deposit` | Deposits funds into wallet, automatically clearing active system debt if restricted. | **Headers:** `x-idempotency-key: <UUID>`<br>**Body:** `{"userId": "...", "amount": 100.00}` |

### 📦 Product Module (`/api/products`)

| Method | Endpoint | Description | Payload / Query Example |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Fetches available inventory, exposing standard columns and JSONB `metadata`. | *None* |
| `GET` | `/api/products/search` | Dynamic nested JSONB search optimized with GIN indexing (`@>`). | Query parameters:<br>`?category=electronics&brand=Apple&ram=16GB&cpu=M3%20Max&zone=A1` |

---

## 🛣️ Engineering Roadmap

- [x] **Phase 1:** Core Initialization, TS Configurations & Prisma v7 DB Connection.
- [x] **Phase 2:** User Provisioning Pipeline with Atomic Wallet Initialization.
- [x] **Phase 3:** P2P Atomic Ledger Transfers & Prevention Layer (ACID, `FOR UPDATE` Row Locking, Idempotency Middleware, 5-Sec Short-Window Guard, Strict Input Guard, CLI Test Suite).
- [x] **Phase 4:** Financial Recovery & Reversal Engine (System Reserve Float Wallet, Double-Entry Reversal Engine, Overdraft & Negative Balance Math, Auto Debt Offset on Deposit, Audit Names Integration).
- [x] **Phase 5:** PostgreSQL JSONB Filtering Engine & GIN Index Benchmarking (Dynamic parameter searching via `@>` containment, GIN Indexing with `JsonbPathOps`, 100k scale batch seeding, `DISCARD ALL` Cold Scan CLI benchmarks, 57.4% Query Cost reduction).
- [ ] **Phase 6:** Database Indexing & B-Tree / Multi-Column Query Performance Benchmarking (`EXPLAIN ANALYZE`).
- [ ] **Phase 7:** Immutable Audit Logging, Soft Deletes & Cursor-Based Pagination.
