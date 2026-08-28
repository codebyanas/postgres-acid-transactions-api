import { validateEnv } from "../../src/config/env.config";

describe("Unit: Environment Variable Validation", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Tests ke dauran console.error output ko temporarily hide karne ke liye
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("should pass validation with complete and valid env variables", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.PORT = "5000";
    process.env.JWT_SECRET = "super_secret_test_key_123456789";

    expect(() => validateEnv()).not.toThrow();
  });

  it("should call process.exit(1) if JWT_SECRET is shorter than 16 characters", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.PORT = "5000";
    process.env.JWT_SECRET = "short_key";

    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("PROCESS_EXIT");
    }) as any);

    expect(() => validateEnv()).toThrow("PROCESS_EXIT");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});
