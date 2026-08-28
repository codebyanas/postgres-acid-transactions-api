import request from "supertest";
import app from "../../src/app";
import { cleanDatabase, disconnectTestDb, prisma } from "../helpers/testDb";

describe("Integration: Wallet Transfer & Security Guards", () => {
  let senderUser: any;
  let receiverUser: any;

  beforeEach(async () => {
    await cleanDatabase();

    senderUser = await prisma.user.create({
      data: {
        name: "Sender Test",
        email: "sender@test.com",
        wallet: { create: { balance: 1000.0 } },
      },
      include: { wallet: true },
    });

    receiverUser = await prisma.user.create({
      data: {
        name: "Receiver Test",
        email: "receiver@test.com",
        wallet: { create: { balance: 100.0 } },
      },
      include: { wallet: true },
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectTestDb();
  });

  it("should execute an atomic transfer and update balances correctly", async () => {
    const response = await request(app)
      .post("/api/wallet/transfer")
      .set("x-idempotency-key", "test-idempotency-key-100")
      .send({
        senderUserId: senderUser.id,
        receiverUserId: receiverUser.id,
        amount: 200.0,
      });

    expect(response.status).toBe(200);

    const updatedSender = await prisma.wallet.findUnique({
      where: { userId: senderUser.id },
    });
    const updatedReceiver = await prisma.wallet.findUnique({
      where: { userId: receiverUser.id },
    });

    expect(Number(updatedSender?.balance)).toBe(800.0);
    expect(Number(updatedReceiver?.balance)).toBe(300.0);
  });

  it("should handle duplicate requests with identical idempotency keys safely", async () => {
    const payload = {
      senderUserId: senderUser.id,
      receiverUserId: receiverUser.id,
      amount: 100.0,
    };

    const firstReq = await request(app)
      .post("/api/wallet/transfer")
      .set("x-idempotency-key", "duplicate-key-guard")
      .send(payload);

    expect(firstReq.status).toBe(200);

    const secondReq = await request(app)
      .post("/api/wallet/transfer")
      .set("x-idempotency-key", "duplicate-key-guard")
      .send(payload);

    // Idempotency middleware either returns 200 (cached success) or 409 Conflict depending on configuration
    expect([200, 409]).toContain(secondReq.status);
  });
});