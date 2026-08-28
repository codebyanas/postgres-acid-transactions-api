import request from "supertest";
import app from "../../src/app";
import { cleanDatabase, disconnectTestDb, prisma } from "../helpers/testDb";

describe("Integration: Reversal & Overdraft Negative Balance Guard", () => {
  let userA: any;
  let userB: any;

  beforeEach(async () => {
    await cleanDatabase();

    userA = await prisma.user.create({
      data: {
        name: "User A",
        email: "usera@test.com",
        wallet: { create: { balance: 500.0 } },
      },
      include: { wallet: true },
    });

    userB = await prisma.user.create({
      data: {
        name: "User B",
        email: "userb@test.com",
        wallet: { create: { balance: 0.0 } },
      },
      include: { wallet: true },
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectTestDb();
  });

  it("should restrict wallet when reversal causes negative overdraft balance", async () => {
    const transferRes = await request(app)
      .post("/api/wallet/transfer")
      .set("x-idempotency-key", "rev-test-key-1")
      .send({
        senderUserId: userA.id,
        receiverUserId: userB.id,
        amount: 200.0,
      });

    expect(transferRes.status).toBe(200);

    const tx = await prisma.walletTransaction.findFirst({
      where: { walletId: userA.wallet.id, type: "DEBIT" },
    });

    expect(tx).not.toBeNull();

    await prisma.wallet.update({
      where: { userId: userB.id },
      data: { balance: 0.0 },
    });

    const reverseRes = await request(app)
      .post("/api/wallet/reverse")
      .set("x-idempotency-key", "rev-test-key-2")
      .send({
        transactionId: tx?.id,
        reason: "Integration test reversal check",
      });

    expect(reverseRes.status).toBe(200);

    const walletB = await prisma.wallet.findUnique({
      where: { userId: userB.id },
    });

    expect(Number(walletB?.balance)).toBe(-200.0);
    expect(walletB?.status).toBe("RESTRICTED");
  });
});