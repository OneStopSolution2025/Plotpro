import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import SuperAdminRequest from "../models/SuperAdminRequest.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function inspectRequest() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");

    const email = "gokul24015677@gmail.com";
    const requests = await SuperAdminRequest.find({ email: { $regex: new RegExp(email, "i") } }).lean();
    console.log(`Found ${requests.length} SuperAdminRequests matching ${email}:`);
    console.log(JSON.stringify(requests, null, 2));

    const users = await User.find({ email: { $regex: new RegExp(email, "i") } }).lean();
    console.log(`Found ${users.length} Users matching ${email}:`);
    console.log(JSON.stringify(users, null, 2));

    if (requests.length > 0) {
      for (const r of requests) {
        if (r.provisionedUserId) {
          const u = await User.findById(r.provisionedUserId).lean();
          console.log(`User referenced by provisionedUserId (${r.provisionedUserId}):`, u);
          const sub = await Subscription.findOne({ subscriberId: r.provisionedUserId }).lean();
          console.log(`Subscription for provisionedUserId:`, sub);
        }
      }
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

inspectRequest();
