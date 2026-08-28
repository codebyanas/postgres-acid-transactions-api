import request from "supertest";
import app from "../../src/app";
import { cleanDatabase, disconnectTestDb, prisma } from "../helpers/testDb";
import { runReconciliationAudit } from "../../src/jobs/reconciliation.cron";

describe("E2E: Complete Financial System Lifecycle", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectTestDb();
  });

  it("should process: Signup -> Deposit -> Transfer -> Reconciliation Audit", async () => {
    const signup1 = await request(app)
      .post("/api/users/signup")
      .send({ name: "E2E User 1", email: "e2e1@test.com" });
    expect(signup1.status).toBe(201);
    const user1Id = signup1.body.data?.id || signup1.body.data?.user?.id;

    const signup2 = await request(app)
      .post("/api/users/signup")
      .send({ name: "E2E User 2", email: "e2e2@test.com" });
    expect(signup2.status).toBe(201);
    const user2Id = signup2.body.data?.id || signup2.body.data?.user?.id;

    const depositRes = await request(app)
      .post("/api/wallet/deposit")
      .set("x-idempotency-key", "e2e-deposit-key")
      .send({
        userId: user1Id,
        amount: 500.0,
      });
    expect(depositRes.status).toBe(200);

    const transferRes = await request(app)
      .post("/api/wallet/transfer")
      .set("x-idempotency-key", "e2e-transfer-key")
      .send({
        senderUserId: user1Id,
        receiverUserId: user2Id,
        amount: 300.0,
      });
    expect(transferRes.status).toBe(200);

    await expect(runReconciliationAudit()).resolves.not.toThrow();

    const auditLogs = await prisma.auditLog.findMany();
    expect(auditLogs.length).toBeGreaterThan(0);
  });
});