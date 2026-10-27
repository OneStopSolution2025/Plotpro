import mongoose from "mongoose";
import dns from "dns";

// Ensure DNS SRV records resolve cleanly on all networks / ISPs
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignore in case custom environment restricts setting DNS servers
}

/**
 * Connect to MongoDB instance using Mongoose.
 * Uses URI from environment variable MONGODB_URI.
 */
export const connectDB = async () => {
  try {
    let uri = process.env.MONGODB_URI || "";
    if (uri && !uri.includes("retryWrites=")) {
      const separator = uri.includes("?") ? "&" : "?";
      uri = `${uri}${separator}retryWrites=false`;
    }

    const conn = await mongoose.connect(uri, {
      retryWrites: false,
    });
    console.log(`[MongoDB] Connected successfully: ${conn.connection.host}/${conn.connection.name}`);
    import("../scripts/ensureStandardPackages.js")
      .then((m) => m.ensureStandardPackages())
      .catch((err) => console.warn("[Packages] Ensure packages background notice:", err.message));
  } catch (error) {
    console.error(`[MongoDB] Connection Error: ${error.message}`);
    process.exit(1);
  }
};

/**
 * Helper to check if the active MongoDB topology supports multi-document transactions.
 * Standalone MongoDB instances do not support replica set transactions and require atomic single-document operations.
 */
export const supportsTransactions = () => {
  try {
    const client = mongoose.connection.getClient();
    const topology = client?.topology?.description;
    const isReplicaSet = topology?.type === "ReplicaSetWithPrimary" || Boolean(topology?.setName);
    return Boolean(isReplicaSet);
  } catch (err) {
    return false;
  }
};

