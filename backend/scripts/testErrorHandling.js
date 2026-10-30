/**
 * PlotPro — B6 Error Handling Regression Tests
 *
 * Tests the global error handler middleware for production safety and
 * development diagnostics. Uses mocked req/res/next — no database required.
 *
 * Run: node scripts/testErrorHandling.js
 */

let passed = 0;
let failed = 0;

const assert = (condition, message) => {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
};

const assertEqual = (actual, expected, message) => {
  assert(
    actual === expected,
    `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`
  );
};

const createMockReq = (overrides = {}) => ({
  method: "GET",
  originalUrl: "/api/test",
  ...overrides,
});

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

// Import the error handler
import { errorHandler, notFound } from "../middleware/errorMiddleware.js";

// ── Test 1: Production unexpected error returns generic message ──────────────
console.log("\n[Test 1] Production unexpected error returns generic message");
{
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const req = createMockReq();
  const res = createMockRes();
  const err = new Error("Database connection failed: ECONNREFUSED 127.0.0.1:27017");

  // Capture console.error
  const origConsoleError = console.error;
  let logged = false;
  console.error = (...args) => { logged = true; };

  errorHandler(err, req, res, () => {});

  assertEqual(res.statusCode, 500, "Status code is 500");
  assertEqual(res.body.message, "Internal server error.", "Message is generic in production");
  assertEqual(res.body.stack, null, "Stack is null in production");
  assert(logged, "Original error was logged server-side");

  console.error = origConsoleError;
  process.env.NODE_ENV = origEnv;
}

// ── Test 2: Production response does not expose stack traces ─────────────────
console.log("\n[Test 2] Production response does not expose stack traces");
{
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const req = createMockReq();
  const res = createMockRes();
  const err = new Error("Something broke");
  err.stack = "Error: Something broke\n    at /app/server.js:42:10";

  const origConsoleError = console.error;
  console.error = () => {};

  errorHandler(err, req, res, () => {});

  assertEqual(res.body.stack, null, "Stack is null");
  assert(!res.body.message.includes("Something broke"), "Message does not contain raw error");

  console.error = origConsoleError;
  process.env.NODE_ENV = origEnv;
}

// ── Test 3: Original errors are logged server-side ──────────────────────────
console.log("\n[Test 3] Original errors are logged server-side");
{
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const req = createMockReq({ method: "POST", originalUrl: "/api/test/endpoint" });
  const res = createMockRes();
  const err = new Error("Connection timeout to database");

  let loggedArgs = null;
  const origConsoleError = console.error;
  console.error = (...args) => { loggedArgs = args; };

  errorHandler(err, req, res, () => {});

  assert(loggedArgs !== null, "console.error was called");
  const logStr = loggedArgs.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
  assert(logStr.includes("POST"), "Log includes HTTP method");
  assert(logStr.includes("/api/test/endpoint"), "Log includes request path");
  assert(logStr.includes("Connection timeout to database"), "Log includes original error message");

  console.error = origConsoleError;
  process.env.NODE_ENV = origEnv;
}

// ── Test 4: Development errors retain useful diagnostics ─────────────────────
console.log("\n[Test 4] Development errors retain useful diagnostics");
{
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  const req = createMockReq();
  const res = createMockRes();
  const err = new Error("Detailed internal error for debugging");
  err.stack = "Error: Detailed internal error\n    at /app/server.js:42:10";

  const origConsoleError = console.error;
  console.error = () => {};

  errorHandler(err, req, res, () => {});

  assertEqual(res.body.message, "Detailed internal error for debugging", "Message preserved in dev");
  assert(res.body.stack !== null, "Stack present in dev");

  console.error = origConsoleError;
  process.env.NODE_ENV = origEnv;
}

// ── Test 5: Validation messages remain unchanged ─────────────────────────────
console.log("\n[Test 5] Validation messages remain unchanged");
{
  const req = createMockReq();
  const res = createMockRes();
  const err = new Error("Validation failed");
  err.name = "ValidationError";
  err.errors = {
    title: { message: "Path `title` is required." },
    location: { message: "Path `location` is required." },
  };

  const origConsoleError = console.error;
  console.error = () => {};

  errorHandler(err, req, res, () => {});

  assertEqual(res.statusCode, 400, "Status is 400");
  assertEqual(res.body.message, "Path `title` is required.. Path `location` is required.", "Validation messages joined");

  console.error = origConsoleError;
}

// ── Test 6: Authentication 401 remains unchanged ─────────────────────────────
console.log("\n[Test 6] Authentication 401 remains unchanged");
{
  const req = createMockReq();
  const res = createMockRes();
  res.status(401);
  const err = new Error("Not authenticated.");

  const origConsoleError = console.error;
  console.error = () => {};

  errorHandler(err, req, res, () => {});

  assertEqual(res.statusCode, 401, "Status is 401");
  assertEqual(res.body.message, "Not authenticated.", "Auth message preserved");

  console.error = origConsoleError;
}

// ── Test 7: Authorization 403 remains unchanged ──────────────────────────────
console.log("\n[Test 7] Authorization 403 remains unchanged");
{
  const req = createMockReq();
  const res = createMockRes();
  res.status(403);
  const err = new Error("Forbidden: Access restricted to [ADMIN].");

  const origConsoleError = console.error;
  console.error = () => {};

  errorHandler(err, req, res, () => {});

  assertEqual(res.statusCode, 403, "Status is 403");
  assertEqual(res.body.message, "Forbidden: Access restricted to [ADMIN].", "Authz message preserved");

  console.error = origConsoleError;
}

// ── Test 8: Duplicate-key errors return safe 409 responses ──────────────────
console.log("\n[Test 8] Duplicate-key errors return safe 409 responses");
{
  const req = createMockReq();
  const res = createMockRes();
  const err = new Error("E11000 duplicate key error");
  err.code = 11000;
  err.keyValue = { customId: 42 };

  const origConsoleError = console.error;
  console.error = () => {};

  errorHandler(err, req, res, () => {});

  assertEqual(res.statusCode, 409, "Status is 409");
  assertEqual(res.body.message, "A record with this customId already exists.", "Safe duplicate message");
  assert(!res.body.message.includes("E11000"), "No raw MongoDB error");

  console.error = origConsoleError;
}

// ── Test 9: CastError returns safe 400 responses ────────────────────────────
console.log("\n[Test 9] CastError returns safe 400 responses");
{
  const req = createMockReq();
  const res = createMockRes();
  const err = new Error("Cast to ObjectId failed");
  err.name = "CastError";
  err.path = "projectId";

  const origConsoleError = console.error;
  console.error = () => {};

  errorHandler(err, req, res, () => {});

  assertEqual(res.statusCode, 400, "Status is 400");
  assertEqual(res.body.message, "Invalid format for field: projectId", "Safe CastError message");

  console.error = origConsoleError;
}

// ── Test 10: Upload validation messages remain user-friendly ─────────────────
console.log("\n[Test 10] Upload validation messages remain user-friendly");
{
  const req = createMockReq();
  const res = createMockRes();
  const err = new Error("Invalid base64 encoding provided.");
  err.statusCode = 400;

  const origConsoleError = console.error;
  console.error = () => {};

  errorHandler(err, req, res, () => {});

  assertEqual(res.statusCode, 400, "Status is 400");
  assertEqual(res.body.message, "Invalid base64 encoding provided.", "Upload validation message preserved");

  console.error = origConsoleError;
}

// ── Test 11: No database details or filesystem paths in production ──────────
console.log("\n[Test 11] No database details or filesystem paths in production responses");
{
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const req = createMockReq();
  const res = createMockRes();
  const err = new Error("MongoServerError: E11000 duplicate key error collection: plotpro.projects index: customId_1 dup key: { customId: 42 }");

  const origConsoleError = console.error;
  console.error = () => {};

  errorHandler(err, req, res, () => {});

  assertEqual(res.body.message, "Internal server error.", "No DB details in message");
  assert(!JSON.stringify(res.body).includes("plotpro"), "No collection name in response");
  assert(!JSON.stringify(res.body).includes("customId_1"), "No index name in response");
  assert(!JSON.stringify(res.body).includes("E11000"), "No MongoDB error code in response");

  console.error = origConsoleError;
  process.env.NODE_ENV = origEnv;
}

// ── Test 12: Existing response structure remains compatible ─────────────────
console.log("\n[Test 12] Existing response structure remains compatible");
{
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const req = createMockReq();
  const res = createMockRes();
  const err = new Error("Unexpected failure");

  const origConsoleError = console.error;
  console.error = () => {};

  errorHandler(err, req, res, () => {});

  assert(res.body.hasOwnProperty("success"), "Response has 'success' field");
  assert(res.body.hasOwnProperty("message"), "Response has 'message' field");
  assert(res.body.hasOwnProperty("stack"), "Response has 'stack' field");
  assertEqual(res.body.success, false, "success is false");

  console.error = origConsoleError;
  process.env.NODE_ENV = origEnv;
}

// ── Test 13: notFound middleware returns safe 404 ───────────────────────────
console.log("\n[Test 13] notFound middleware returns safe 404");
{
  const req = createMockReq({ originalUrl: "/api/nonexistent" });
  const res = createMockRes();
  let nextCalled = false;
  let passedErr = null;

  notFound(req, res, (err) => {
    nextCalled = true;
    passedErr = err;
  });

  assert(nextCalled, "next() was called");
  assert(res.statusCode === 404, "Status set to 404");
  assertEqual(passedErr.message, "Resource not found.", "Safe 404 message (no URL path)");

  // Now run through errorHandler
  const res2 = createMockRes();
  res2.status(404);
  const origConsoleError = console.error;
  console.error = () => {};
  errorHandler(passedErr, req, res2, () => {});
  assertEqual(res2.body.message, "Resource not found.", "404 message preserved through handler");

  console.error = origConsoleError;
}

// ── Test 14: 4xx errors with err.status are preserved ───────────────────────
console.log("\n[Test 14] 4xx errors with err.status are preserved");
{
  const req = createMockReq();
  const res = createMockRes();
  const err = new Error("Bad request data");
  err.status = 400;

  const origConsoleError = console.error;
  console.error = () => {};

  errorHandler(err, req, res, () => {});

  assertEqual(res.statusCode, 400, "Status is 400");
  assertEqual(res.body.message, "Bad request data", "Message preserved for 4xx");

  console.error = origConsoleError;
}

// ── Test 15: 5xx errors with err.statusCode are treated as unexpected ────────
console.log("\n[Test 15] 5xx errors with err.statusCode are treated as unexpected");
{
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const req = createMockReq();
  const res = createMockRes();
  const err = new Error("Database connection failed");
  err.statusCode = 500;

  const origConsoleError = console.error;
  console.error = () => {};

  errorHandler(err, req, res, () => {});

  assertEqual(res.body.message, "Internal server error.", "5xx with statusCode returns generic message");

  console.error = origConsoleError;
  process.env.NODE_ENV = origEnv;
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? "PASS" : "FAIL"}: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
