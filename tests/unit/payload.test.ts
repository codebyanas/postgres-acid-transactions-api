import { z } from "zod";

const transferPayloadSchema = z.object({
  senderUserId: z.string().uuid("Invalid sender UUID"),
  receiverUserId: z.string().uuid("Invalid receiver UUID"),
  amount: z
    .number()
    .positive("Amount must be greater than zero")
    .refine(
      (val) => /^\d+(\.\d{1,2})?$/.test(val.toString()),
      "Amount can have maximum 2 decimal places"
    ),
});

describe("Unit: Transfer Payload Guard Schema", () => {
  // Valid RFC 4122 v4 UUIDs
  const validSenderId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const validReceiverId = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12";

  it("should accept valid payload format", () => {
    const payload = {
      senderUserId: validSenderId,
      receiverUserId: validReceiverId,
      amount: 150.5,
    };
    expect(() => transferPayloadSchema.parse(payload)).not.toThrow();
  });

  it("should reject negative or zero amount transfers", () => {
    const payload = {
      senderUserId: validSenderId,
      receiverUserId: validReceiverId,
      amount: -50,
    };
    expect(() => transferPayloadSchema.parse(payload)).toThrow();
  });

  it("should reject invalid UUID inputs", () => {
    const payload = {
      senderUserId: "invalid-user-id",
      receiverUserId: validReceiverId,
      amount: 100,
    };
    expect(() => transferPayloadSchema.parse(payload)).toThrow();
  });
});