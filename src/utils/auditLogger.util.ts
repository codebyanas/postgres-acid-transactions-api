import { prisma } from "../config/db";
import { UserRole, AuditAction } from "@prisma/client";

interface AuditLogPayload {
  actorId: string;
  role: UserRole;
  action: AuditAction;
  resource: string;
  resourceId: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

/**
 * Helper utility to record an immutable audit entry into AuditLog database table.
 * Preserves high-value system operations for compliance auditing and security analysis.
 */
export const createAuditLog = async (payload: AuditLogPayload): Promise<void> => {
  try {
    await (prisma as any).auditLog.create({
      data: {
        actorId: payload.actorId,
        role: payload.role,
        action: payload.action,
        resource: payload.resource,
        resourceId: payload.resourceId,
        ipAddress: payload.ipAddress || null,
        metadata: payload.metadata || {},
      },
    });
  } catch (error) {
    console.error("CRITICAL: Failed to insert immutable audit log entry:", error);
  }
};