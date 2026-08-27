import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

// Extend Express Request type interface globally to include user context
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Authentication Middleware: Validates Bearer JWT token in Authorization header.
 * Attaches decoded user payload (ID & Role) to Request object.
 */
export const authenticateJWT = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Access denied. Bearer authorization token required.",
    });
    return;
  }

  const token = authHeader.split(" ")[1];
  const secret = process.env.JWT_SECRET || "default_super_secret_key";

  try {
    const decoded = jwt.verify(token, secret) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({
      success: false,
      error: "Invalid or expired authorization token.",
    });
  }
};

/**
 * RBAC Guard Middleware: Restricts route access to specified allowed roles.
 * Prevents unauthorized users from executing administrative endpoints.
 */
export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Unauthorized access. User session context missing.",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Forbidden. Action restricted to [${allowedRoles.join(", ")}] roles.`,
      });
      return;
    }

    next();
  };
};