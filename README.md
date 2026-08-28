# PostgreSQL ACID Transactions API

A high-concurrency Node.js, Express & TypeScript financial backend engine powered by PostgreSQL and Prisma ORM. Engineered for zero-data-loss P2P atomic digital wallet transfers, user provisioning pipelines, pessimistic row-locking race-condition prevention, automated debt recovery, double-entry reversal mechanics, strict input sanitization, dynamic JSONB search engines at 100k scale, GIN index query optimization, multi-column B-Tree performance benchmarking, cursor-based $O(1)$ seek pagination, automated reconciliation background workers, and multi-layered OWASP security hardening.

---

## 🏗️ Architecture & Tech Stack

* **Runtime & Framework:** Node.js, Express.js
* **Language:** TypeScript (Strict typing & ESNext compilation target)
* **Database:** PostgreSQL (Relational integrity, JSONB metadata, Decimal precision, GIN Indexing, B-Tree Composite Indexing)
* **ORM:** Prisma ORM v7 with `@prisma/adapter-pg`
* **Security & Validation:** Zod Environment Guard, Helmet Security Headers, Express Rate Limit (DDoS/Bot Mitigation)
* **Utilities:** Base64 Cursor Encoders/Decoders for $O(1)$ Seek Pagination, Periodic Background Cron Workers
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

### 📊 Phase 6: Relational B-Tree Indexing & Query Optimization (100k Multi-User Scale)
1. **High-Cardinality Multi-User Seed Pipeline:** Scaled database seeding (`prisma/seed.ts`) to generate 500 dummy users funded with initial capital ($50,000–$100,000) and 100,000 realistic historical transactions ($20–$1,500 range) distributed across 1 year of timestamps to ensure realistic B-Tree index cardinality tests.
2. **Relational B-Tree Schema Indexing:**
   * **Single-Column B-Tree Index:** Added `@@index([price], name: "idx_product_price_btree")` in `Product` schema for optimized numerical range queries (`WHERE price BETWEEN X AND Y`) and sorting.
   * **Composite Multi-Column B-Tree Index:** Configured `@@index([walletId, createdAt])` in `WalletTransaction` schema to optimize historical transaction lookups filtered by wallet and sorted chronologically.
3. **Deep Database Execution Verification (`verify-btree-deep.ts`):** Built dedicated session-toggling benchmarking scripts using `SET enable_indexscan = off/on` to execute raw PostgreSQL `EXPLAIN ANALYZE` commands, comparing full sequential table scans against B-Tree leaf node lookups.
4. **Sorting Overhead Elimination & 95x Engine Speedup:**
   * **Strategy Shift:** Replaced memory-heavy RAM `QuickSort` operations with instant pre-sorted leaf node reads.
   * **Database Execution Latency:** Accelerated ledger history lookups from **36.4ms → 0.31ms** (**~95x Speedup**).
5. **HTTP Controller Benchmarking Route (`/api/benchmark/transactions`):** Built an Express benchmark controller enabling real-time index toggling (`useIndex=true|false`), demonstrating an end-to-end API response time drop from **188.04ms → 100.63ms** (**~47% overall API latency drop**).

### ⏩ Phase 7: Cursor-Based (Seek) Pagination Engine & $O(1)$ Performance Benchmarking
1. **$O(1)$ Seek vs $O(N)$ Offset Mechanics:** Replaced traditional Offset pagination (`skip`) with Base64 encoded cursors (`encodeCursor` / `decodeCursor`). Offset pagination requires PostgreSQL to read, count, and discard $N$ preceding rows in memory ($O(N)$ linear delay), whereas Cursor pagination performs a direct B-Tree leaf node lookup (`WHERE id > target_id LIMIT limit`) with zero row-scan overhead.
2. **Composite & Primary Key B-Tree Integration:** Leveraged primary key (`id`) and composite indexes (`[walletId, createdAt]`) to allow the database engine to jump directly to specific cursor addresses without touching past records.
3. **Dual-Strategy Benchmarking Controllers:** Integrated high-precision `performance.now()` execution timing (`executionTimeMs`) and dynamic strategy indicators (`OFFSET (SKIP)` vs `CURSOR (SEEK)`) across product and wallet transaction endpoints (`getWalletTransactions`, `getProducts`).
4. **Deep-Page Postman Benchmarking & Real-World Validation:**
   * **Wallet Transactions Endpoint:** Accelerated deep-page transaction lookups from **71.99ms (Offset)** → **5.30ms (Cursor)** (**~13.5x Speedup**).
   * **Products Engine (80,000 Record Deep Jump):** Reduced query execution time from **142.75ms (Offset `skip=80000`)** → **< 5ms (Cursor)**, proving constant $O(1)$ sub-millisecond latency regardless of dataset depth.

### 🛡️ Phase 8: Automated Background Worker, Security Hardening & System Resilience
1. **Zod Boot-Time Environment Guard (`env.config.ts`):** Enforces strict Zod validation on `.env` variables (`DATABASE_URL`, `JWT_SECRET` min 16 chars, `PORT`) prior to application initialization. Implements a fail-fast boot pattern (`process.exit(1)`) preventing runtime database connection drops or weak encryption keys.
2. **Automated Reconciliation Background Worker (`reconciliation.cron.ts`):** Operates a background cron worker running every 15 minutes (and immediately on server boot) to recalculate user balances against immutable transaction histories, identifying ledger anomalies without manual intervention.
3. **Express Rate Limiting (DDoS & Bot Spam Protection):** Integrates `express-rate-limit` middleware enforcing strict rate caps: 10 requests / 1 minute on sensitive financial endpoints (`/api/wallets/transfer`), and 100 requests / 15 minutes application-wide to block brute-force scripts and DDoS attacks.
4. **Helmet Security Header Injection (`helmet()`):** Injects production-grade HTTP response headers (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-DNS-Prefetch-Control: off`) to automatically defend against Cross-Site Scripting (XSS), Clickjacking, and MIME-sniffing vulnerabilities.
5. **Global Centralized Error Interceptor (`errorHandler.middleware.ts`):** Implements Express error handling middleware protecting against internal system information leakage. In production mode (`NODE_ENV=production`), hides database stack traces and returns clean, standardized JSON errors (`500 Internal Server Error`).
6. **OS Signal Lifecycle & Process Exception Guards (`server.ts`):** Intercepts OS signals (`SIGINT`, `SIGTERM`) to gracefully shut down HTTP connections, clear active interval timers, and disconnect the Prisma database pool. Registers system-wide listeners for `unhandledRejection` and `uncaughtException` events to maintain process stability.

---

## 🗄️ Database Schema Design

* **`User`**: Core identity table. Indexed on `email` for rapid authentication lookups.
* **`Wallet`**: Enforces a `1-to-1` relationship with `User`. Tracks `balance` (`Decimal(12,2)`) and `status` (`ACTIVE`, `FROZEN`, `RESTRICTED`).
* **`WalletTransaction`**: Immutable ledger recording `CREDIT`, `DEBIT`, `REVERSAL_CREDIT`, and `REVERSAL_DEBIT` events. Contains `idempotencyKey`, `senderName`, `receiverName`, and composite B-Tree indexing on `[walletId, createdAt]`.
* **`Product`**: Inventory table incorporating `JSONB` for `metadata`, configured with a PostgreSQL `GIN` index (`JsonbPathOps`) on `metadata` for ultrafast schema-less search and a B-Tree index on `price` for numerical range filtering.
* **`Order` & `OrderItem`**: Normalized checkout records representing snapshot pricing and purchasing relational integrity.

---

## 🚀 Local Development Setup

### 1. Prerequisites
Define your connection string, application port, environment state, and secret key in a `.env` file at the project root:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/postgres_acid_db"
PORT=5000
NODE_ENV=development
JWT_SECRET=super_secret_key_at_least_16_chars_long
```

### 2. Initialization Workflow

```bash
# 1. Install dependencies
npm install

# 2. Apply database schema changes, GIN & B-Tree Indexing
npx prisma db push

# 3. Generate Prisma Client bindings
npx prisma generate

# 4. Seed high-volume test state (500 Users, 100k Transactions, 100k JSONB Products, Reserve Float)
npx prisma db seed

# 5. Start development server with Zod guard and background audit worker
npm run dev
```

### 3. Automated CLI Test Suite

Execute CLI test suites to verify atomic transfers, financial reversals, debt recovery, payload validation, status guards, GIN JSONB performance, and B-Tree index optimization:

```bash
# Atomic Wallet Transfer & Guard Test Suite
npx tsx scripts/run-atomic-wallet-transfer-test.ts

# Financial Recovery & Debt Offset Test Suite
npx tsx scripts/run-financial-recovery-test.ts

# PostgreSQL JSONB GIN Index Benchmark Test Suite (100k Scale)
npx tsx scripts/run-postgres-jsonb-query-test.ts

# B-Tree Index Surface Benchmark Test Suite
npx tsx scripts/run-btree-query-test.ts

# Deep Comparative B-Tree Benchmark (With Index vs Without Index)
npx tsx scripts/verify-btree-deep.ts
```

---

## 📡 API Reference

### 🏥 System Module (`/health`)

| Method | Endpoint | Description | Response Example |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Server health check verifying HTTP server uptime and Helmet security header injection. | `{"status": "OK", "message": "Server is running smoothly!"}` |

### 👤 User Module (`/api/users`)

| Method | Endpoint | Description | Payload Example |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/users/signup` | Atomically creates a `User` and provisions a default `$1000.00` wallet. | `{"name": "Anas", "email": "anas@example.com"}` |
| `GET` | `/api/users` | Lists registered users and relational wallet context. | *None* |

### 💳 Wallet Module (`/api/wallets`)

| Method | Endpoint | Description | Payload / Query / Headers |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/wallets` | Retrieves all active and restricted wallets. | *None* |
| `POST` | `/api/wallets/transfer` | High-concurrency P2P atomic transfer with status checks, row-locking & rate limiting (10 req/min). | **Headers:** `x-idempotency-key: <UUID>`<br>**Body:** `{"senderUserId": "...", "receiverUserId": "...", "amount": 60.00}` |
| `POST` | `/api/wallets/reverse` | Executes double-entry reversal with negative balance overdraft handling. | **Headers:** `x-idempotency-key: <UUID>`<br>**Body:** `{"transactionId": "..."}` |
| `POST` | `/api/wallets/deposit` | Deposits funds into wallet, automatically clearing active system debt if restricted. | **Headers:** `x-idempotency-key: <UUID>`<br>**Body:** `{"userId": "...", "amount": 100.00}` |
| `GET` | `/api/wallets/:walletId/transactions` | Fetches wallet transaction ledger using $O(1)$ Cursor (Seek) or Offset (Skip) benchmarking. | **Query Params:**<br>`?limit=20&cursor=eyJpZCI6...`<br>or `?limit=20&skip=5000` |

### 📦 Product Module (`/api/products`)

| Method | Endpoint | Description | Payload / Query Example |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Fetches available inventory using $O(1)$ Cursor (Seek) or Offset (Skip) benchmarking. | Query parameters:<br>`?limit=20&cursor=eyJpZCI6...`<br>or `?limit=20&skip=80000` |
| `GET` | `/api/products/search` | Dynamic nested JSONB search optimized with GIN indexing (`@>`). | Query parameters:<br>`?category=electronics&brand=Apple&ram=16GB&cpu=M3%20Max&zone=A1` |

### 📊 Benchmark Module (`/api/benchmark`)

| Method | Endpoint | Description | Query Example |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/benchmark/transactions` | Compares ledger lookup performance with B-Tree index vs forced full table scan. | Query parameters:<br>`?walletId=...&useIndex=true` or `?useIndex=false` |

---

## 🛣️ Engineering Roadmap

- [x] **Phase 1:** Core Initialization, TS Configurations & Prisma v7 DB Connection.
- [x] **Phase 2:** User Provisioning Pipeline with Atomic Wallet Initialization.
- [x] **Phase 3:** P2P Atomic Ledger Transfers & Prevention Layer (ACID, `FOR UPDATE` Row Locking, Idempotency Middleware, 5-Sec Short-Window Guard, Strict Input Guard, CLI Test Suite).
- [x] **Phase 4:** Financial Recovery & Reversal Engine (System Reserve Float Wallet, Double-Entry Reversal Engine, Overdraft & Negative Balance Math, Auto Debt Offset on Deposit, Audit Names Integration).
- [x] **Phase 5:** PostgreSQL JSONB Filtering Engine & GIN Index Benchmarking (Dynamic parameter searching via `@>` containment, GIN Indexing with `JsonbPathOps`, 100k scale batch seeding, `DISCARD ALL` Cold Scan CLI benchmarks, 57.4% Query Cost reduction).
- [x] **Phase 6:** Database Indexing & B-Tree / Multi-Column Query Performance Benchmarking (Composite `[walletId, createdAt]` B-Tree indexing, 500 multi-user high-cardinality 100k seed pipeline, `verify-btree-deep.ts` side-by-side verification, 95x DB execution speedup on ledger sorts, Postman benchmark endpoint).
- [x] **Phase 7:** Cursor-Based (Seek) Pagination Engine & $O(1)$ Benchmarking (Base64 cursor encoding, dual Offset vs Cursor controllers, B-Tree leaf node seek jumps, 80k deep-skip benchmarking reducing DB execution latency from 142.7ms to <5ms).
- [x] **Phase 8:** Automated Background Reconciliation Worker, Security Hardening & System Resilience (Zod Boot Guard, Rate Limiting, Helmet Headers, Global Error Handler, Graceful Shutdown & Exception Guards).