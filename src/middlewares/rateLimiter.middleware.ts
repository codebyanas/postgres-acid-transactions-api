import rateLimit from "express-rate-limit";

/**
 * Global API Rate Limiter
 * Limits general HTTP requests across all public endpoints to prevent basic spam.
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute time window
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: {
    success: false,
    error: "Too many requests from this IP. Please try again after 15 minutes.",
  },
});

/**
 * Strict Financial Transaction Rate Limiter
 * Applied to high-risk financial routes (transfers, deposits, admin adjustments) to thwart DDoS and brute-force attacks.
 */
export const financialRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1-minute time window
  max: 10, // Limit each IP to 10 financial operations per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Financial rate limit exceeded. Maximum 10 transaction operations allowed per minute.",
  },
});