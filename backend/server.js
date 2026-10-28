import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import { initStorage, getUploadDir } from "./config/storageConfig.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";
import authRoutes from "./routes/authRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import superAdminRoutes from "./routes/superAdminRoutes.js";
import supremeAdminRoutes from "./routes/supremeAdminRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";

// Load environment variables from backend/.env
dotenv.config();

// ─── Security Guard: Strictly Prohibit Device OTP Bypass Outside Local Dev ──
export function validateBypassConfiguration() {
  const isBypassRequested = process.env.DEV_LOCAL_BYPASS_DEVICE_OTP === "true";
  if (!isBypassRequested) return;

  const isProduction = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";
  const isCloudDeployment = Boolean(
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RENDER_SERVICE_ID ||
    process.env.VERCEL ||
    process.env.HEROKU_APP_ID
  );

  if (isProduction || isCloudDeployment || process.env.NODE_ENV !== "development") {
    const errorMsg =
      "[SECURITY FATAL] DEV_LOCAL_BYPASS_DEVICE_OTP is strictly prohibited in production and cloud deployments! " +
      `Detected: NODE_ENV=${process.env.NODE_ENV}, CloudDeployment=${isCloudDeployment}. Refusing to start server.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  console.warn(
    "[SECURITY WARNING] DEV_LOCAL_BYPASS_DEVICE_OTP is enabled for local development only. " +
    "Administrative logins will skip email device verification on this machine."
  );
}

// Execute guard check immediately on startup
validateBypassConfiguration();

// Connect to Database
connectDB();

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
// Allow localhost, local network IP, VS Code forwarded ports (*.app.github.dev)
// and any custom CLIENT_URL set in .env
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // curl, Postman, mobile apps without origin header

  // Always allow localhost / 127.0.0.1
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;

  // Allow local network IPs (192.168.x.x, 10.x.x.x)
  if (/^https?:\/\/(192\.168\.|10\.)[\d.]+:\d+/.test(origin)) return true;

  // Allow VS Code port forwarding URLs (*.app.github.dev)
  if (/^https:\/\/.*\.app\.github\.dev$/.test(origin)) return true;

  // Allow explicit CLIENT_URL from .env
  if (process.env.CLIENT_URL && origin === process.env.CLIENT_URL) return true;
  // Allow deployed Railway frontend
if (
  origin === "https://plotpro-production-5000.up.railway.app"
) {
  return true;
}

  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked origin: ${origin}`);
        callback(new Error(`CORS: Origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Initialize persistent storage and serve uploads statically
initStorage();
app.use("/uploads", express.static(getUploadDir()));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "PlotPro Backend API is running smoothly",
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/supreme-admin", supremeAdminRoutes);
app.use("/api/user", userRoutes);
app.use("/api/notifications", notificationRoutes);

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[PlotPro Server] Listening on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  console.log(`[PlotPro Server] Local:   http://localhost:${PORT}`);
});

export default app;
