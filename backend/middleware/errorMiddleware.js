/**
 * 404 Not Found Middleware for unmatched routes.
 */
export const notFound = (req, res, next) => {
  const error = new Error("Resource not found.");
  res.status(404);
  next(error);
};

/**
 * Centralized Error Handler Middleware.
 *
 * Returns consistent JSON response format. In production, unexpected (5xx)
 * errors return a generic message to avoid leaking internal details. In
 * development, the original error message and stack are preserved for
 * diagnostics. Expected business/validation/auth errors always retain their
 * intended messages and status codes.
 */
export const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  const isProd = process.env.NODE_ENV === "production";

  // Handle Mongoose CastError (invalid ObjectId) — safe, field-level message
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid format for field: ${err.path}`,
    });
  }

  // Handle Mongoose duplicate key error (code 11000) — safe, generic message
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({
      success: false,
      message: `A record with this ${field} already exists.`,
    });
  }

  // Handle Mongoose ValidationError — safe, schema-defined messages
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join(". "),
    });
  }

  // Handle intentional HTTP errors with an explicit statusCode (4xx).
  // These come from controllers (e.g., storage service validation errors)
  // that set err.statusCode + err.message for user-facing validation failures.
  // In production, preserve the message only if it's a known safe 4xx error.
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message || "Request failed.",
      code: err.code || undefined,
    });
  }

  // Handle intentional HTTP errors with err.status (Express convention)
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({
      success: false,
      message: err.message || "Request failed.",
      code: err.code || undefined,
    });
  }

  // Unexpected errors (5xx): log server-side, return generic message in production
  console.error(
    `[ErrorHandler] ${statusCode} ${req.method} ${req.originalUrl}:`,
    err
  );

  res.status(statusCode).json({
    success: false,
    message: isProd ? "Internal server error." : (err.message || "Internal Server Error"),
    stack: isProd ? null : err.stack,
  });
};
