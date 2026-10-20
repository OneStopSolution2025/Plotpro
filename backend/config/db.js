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
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`[MongoDB] Connected successfully: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`[MongoDB] Connection Error: ${error.message}`);
    process.exit(1);
  }
};

