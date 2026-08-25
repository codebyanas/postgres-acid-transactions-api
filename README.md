# PostgreSQL ACID Transactions API

A high-concurrency Node.js, Express & TypeScript financial backend engine powered by PostgreSQL and Prisma ORM. Engineered for zero-data-loss P2P atomic digital wallet transfers, user provisioning pipelines, pessimistic row-locking race-condition prevention, automated debt recovery, double-entry reversal mechanics, strict input sanitization, and multi-layered audit logging.

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

---

## 🗄️ Database Schema Design

* **`User`**: Core identity table. Indexed on `email` for rapid authentication lookups.
* **`Wallet`**: Enforces a `1-to-1` relationship with `User`. Tracks `balance` (`Decimal(12,2)`) and `status` (`ACTIVE`, `FROZEN`, `RESTRICTED`).
* **`WalletTransaction`**: Immutable ledger recording `CREDIT`, `DEBIT`, `REVERSAL_CREDIT`, and `REVERSAL_DEBIT` events. Contains `idempotencyKey`, `senderName`, `receiverName`, and composite indexing on `[walletId, createdAt]`.
* **`Product`**: Inventory table incorporating `JSONB` for `metadata`, allowing flexible schema-less attributes.
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

# 2. Apply database schema changes
npx prisma db push

# 3. Generate Prisma Client bindings
npx prisma generate

# 4. Seed initial state (Users, Wallets, System Reserve Float)
npx prisma db seed
```

### 3. Automated CLI Test Suite

Execute CLI test suites to verify atomic transfers, financial reversals, debt recovery, payload validation, and status guards:

```bash
# Atomic Wallet Transfer & Guard Test Suite
npx tsx scripts/run-atomic-wallet-transfer-test.ts

# Financial Recovery & Debt Offset Test Suite
npx tsx scripts/run-financial-recovery-test.ts
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

| Method | Endpoint | Description | Payload Example |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Fetches available inventory, exposing standard columns and JSONB `metadata`. | *None* |

---

## 🛣️ Engineering Roadmap

- [x] **Phase 1:** Core Initialization, TS Configurations & Prisma v7 DB Connection.
- [x] **Phase 2:** User Provisioning Pipeline with Atomic Wallet Initialization.
- [x] **Phase 3:** P2P Atomic Ledger Transfers & Prevention Layer (ACID, `FOR UPDATE` Row Locking, Idempotency Middleware, 5-Sec Short-Window Guard, Strict Input Guard, CLI Test Suite).
- [x] **Phase 4:** Financial Recovery & Reversal Engine (System Reserve Float Wallet, Double-Entry Reversal Engine, Overdraft & Negative Balance Math, Auto Debt Offset on Deposit, Audit Names Integration).
- [ ] **Phase 5:** PostgreSQL JSONB Filtering Engine (Dynamic parameter searching via JSONB queries & GIN indexing).
- [ ] **Phase 6:** Database Indexing & Query Performance Benchmarking (`EXPLAIN ANALYZE`, B-Tree / GIN tuning).
- [ ] **Phase 7:** Immutable Audit Logging, Soft Deletes & Cursor-Based Pagination.