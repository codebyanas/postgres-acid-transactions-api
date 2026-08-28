import { Request, Response, NextFunction } from "express";

/**
 * Centralized Global Production Error Handling Middleware
 * Intercepts uncaught errors, masks sensitive database stack traces, and sends clean standardized responses.
 */
export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log full internal error stack trace securely on backend console
  console.error("🚨 [UNCAUGHT EXCEPTION]:", err);

  const statusCode = err.statusCode || 500;
  
  // Mask raw internal database errors in production environments
  const isProduction = process.env.NODE_ENV === "production";
  const errorMessage = isProduction
    ? "An unexpected internal server error occurred. Please contact system support."
    : err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    ...(isProduction ? {} : { stack: err.stack }),
  });
};