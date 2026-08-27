import { Prisma } from "@prisma/client";

/**
 * Prisma Client Extension to intercept query operations and handle Soft Deletion automatically.
 * Uses type assertions on args.where to bypass generic Prisma extension TypeScript checks.
 */
export const softDeleteExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    name: "softDeleteExtension",
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (["Product", "User", "Wallet"].includes(model)) {
            (args as any).where = { deletedAt: null, ...(args as any).where };
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (["Product", "User", "Wallet"].includes(model)) {
            (args as any).where = { deletedAt: null, ...(args as any).where };
          }
          return query(args);
        },
        async findUnique({ model, args, query }) {
          if (["Product", "User", "Wallet"].includes(model)) {
            const result: any = await query(args);
            if (result && result.deletedAt !== null) {
              return null;
            }
            return result;
          }
          return query(args);
        },
        async delete({ model, args, query }) {
          if (["Product", "User", "Wallet"].includes(model)) {
            // Intercept hard delete and transform into soft delete update
            return (client as any)[model].update({
              where: (args as any).where,
              data: { deletedAt: new Date() },
            });
          }
          return query(args);
        },
      },
    },
  });
});