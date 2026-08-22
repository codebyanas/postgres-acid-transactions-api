import { Request, Response, NextFunction } from "express";

/**
 * In-memory store for tracking processed idempotency keys.
 * In production systems, this is usually replaced by Redis with a TTL (Time-To-Live).
 */
const idempotencyStore = new Map<string, { statusCode: number; body: any }>();

/**
 * Idempotency Middleware
 * Ensures that requests with the same 'x-idempotency-key' are processed exactly once.
 * Subsequent identical requests return the cached response without re-executing business logic.
 */
export const idempotencyMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const idempotencyKey = req.headers["x-idempotency-key"] as string;

  // 1. If no idempotency key is provided, allow the request to proceed normally
  if (!idempotencyKey) {
    return next();
  }

  // 2. If the key exists in our cache, return the previously saved response immediately
  if (idempotencyStore.has(idempotencyKey)) {
    const cachedResponse = idempotencyStore.get(idempotencyKey)!;
    res.status(cachedResponse.statusCode).json({
      ...cachedResponse.body,
      isIdempotentResponse: true, // Flag indicating this was served from cache
    });
    return;
  }

  // 3. Intercept res.json to capture and save the response payload before sending
  const originalJson = res.json.bind(res);
  res.json = (body: any): Response => {
    // Cache the response only for successful operations (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyStore.set(idempotencyKey, {
        statusCode: res.statusCode,
        body,
      });
    }
    return originalJson(body);
  };

  next();
};