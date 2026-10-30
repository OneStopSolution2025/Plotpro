/**
 * PlotPro — API query-parameter regression tests (B1)
 *
 * Exercises the real `request()` code path with a stubbed fetch/localStorage.
 * Run: node scripts/test-query-params.mjs
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

// ── Environment stubs ───────────────────────────────────────────────────────
let tokenValue = null;
globalThis.localStorage = {
  getItem: (key) => (key === "dreamcity_token" ? tokenValue : null),
  setItem: () => {},
  removeItem: () => {},
};

const dispatched = [];
globalThis.window = {
  dispatchEvent: (event) => dispatched.push(event),
};

let lastRequest = null;
globalThis.fetch = async (url, config) => {
  lastRequest = { url, config };
  return new Response(JSON.stringify({ success: true, data: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

const { api, BASE_URL } = await import("../src/services/api.js");
const { appendQueryParams } = await import("../src/services/queryString.js");

// ── 1. Pure helper: URL composition ─────────────────────────────────────────
console.log("\n[1] appendQueryParams — URL composition");
assertEqual(
  appendQueryParams("http://x/api/enquiries", { page: 2, limit: 10 }),
  "http://x/api/enquiries?page=2&limit=10",
  "appends params when no query string exists"
);
assertEqual(
  appendQueryParams("http://x/api/enquiries?foo=bar", { page: 2 }),
  "http://x/api/enquiries?foo=bar&page=2",
  "preserves an existing query string"
);
assertEqual(
  appendQueryParams("http://x/api/enquiries?", { page: 2 }),
  "http://x/api/enquiries?page=2",
  "does not produce a double '?'"
);
assertEqual(
  appendQueryParams("http://x/api/enquiries#section", { page: 2 }),
  "http://x/api/enquiries?page=2#section",
  "keeps the hash fragment last"
);
assertEqual(
  appendQueryParams("http://x/api/enquiries", { a: undefined, b: null, c: "" }),
  "http://x/api/enquiries",
  "excludes undefined, null, and empty-string values"
);
assertEqual(
  appendQueryParams("http://x/api/enquiries", { page: 0, active: false }),
  "http://x/api/enquiries?page=0&active=false",
  "preserves 0 and false"
);
assertEqual(
  appendQueryParams("http://x/api/enquiries", { q: "a b&c=d" }),
  "http://x/api/enquiries?q=a+b%26c%3Dd",
  "encodes values exactly once"
);
assertEqual(
  appendQueryParams("http://x/api/enquiries", { tag: ["a", "b"] }),
  "http://x/api/enquiries?tag=a&tag=b",
  "serializes arrays as repeated keys"
);

// ── 2. Real request() path ──────────────────────────────────────────────────
console.log("\n[2] api.get — real request path");
tokenValue = null;
dispatched.length = 0;

await api.get("/super-admin/enquiries", {
  params: { page: 2, limit: 10, search: "john doe", status: "NEW" },
});
assertEqual(
  lastRequest.url,
  `${BASE_URL}/super-admin/enquiries?page=2&limit=10&search=john+doe&status=NEW`,
  "serializes params into the actual fetch URL"
);
assertEqual(lastRequest.config.method, "GET", "keeps the GET method");
assertEqual(
  Object.prototype.hasOwnProperty.call(lastRequest.config, "params"),
  false,
  "does not forward `params` into the fetch config"
);
assertEqual(
  lastRequest.config.headers["Content-Type"],
  "application/json",
  "keeps default headers"
);

await api.get("/super-admin/enquiries?existing=1", { params: { page: 3 } });
assertEqual(
  lastRequest.url,
  `${BASE_URL}/super-admin/enquiries?existing=1&page=3`,
  "handles endpoints that already contain a query string"
);

await api.get("/super-admin/enquiries", {
  params: { page: 0, active: false, empty: "", missing: undefined, nothing: null },
});
assertEqual(
  lastRequest.url,
  `${BASE_URL}/super-admin/enquiries?page=0&active=false`,
  "excludes empty values while preserving 0 and false"
);

await api.get("/super-admin/enquiries");
assertEqual(
  lastRequest.url,
  `${BASE_URL}/super-admin/enquiries`,
  "calls without params keep working (no '?')"
);

// ── 3. Auth + method/body behaviour unchanged ───────────────────────────────
console.log("\n[3] Auth, method, and body behaviour");
tokenValue = "test-token";
await api.get("/super-admin/enquiries", { params: { page: 1 } });
assertEqual(
  lastRequest.config.headers.Authorization,
  "Bearer test-token",
  "attaches the Bearer token"
);
assertEqual(lastRequest.config.credentials, "include", "keeps credentials: include");

await api.post("/super-admin/enquiries/x/status", { status: "CLOSED" });
assertEqual(lastRequest.config.method, "POST", "keeps the POST method");
assertEqual(
  lastRequest.config.body,
  JSON.stringify({ status: "CLOSED" }),
  "keeps JSON body serialization"
);
assertEqual(
  lastRequest.url,
  `${BASE_URL}/super-admin/enquiries/x/status`,
  "POST without params does not add a query string"
);

// ── 4. Error handling unchanged ─────────────────────────────────────────────
console.log("\n[4] Error handling");
tokenValue = "expired-token";
globalThis.fetch = async () =>
  new Response(JSON.stringify({ message: "Session expired" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

let caught = null;
try {
  await api.get("/auth/me");
} catch (err) {
  caught = err;
}
assert(caught !== null, "throws on a non-ok response");
assertEqual(caught?.status, 401, "preserves the HTTP status on the error");
assertEqual(dispatched.length, 1, "dispatches plotpro:auth-error on 401");

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? "PASS" : "FAIL"}: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
