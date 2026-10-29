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

async function checkReq() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const req = await SuperAdminRequest.findOne({ email: "gokul24015677@gmail.com" }).select("+passwordHash").lean();
    console.log("Request details:");
    console.log({
      _id: req._id,
      name: req.name,
      email: req.email,
      status: req.status,
      hasPasswordHash: Boolean(req.passwordHash),
      passwordHashPrefix: req.passwordHash ? req.passwordHash.slice(0, 10) : null,
      provisionedUserId: req.provisionedUserId,
      provisionedSubscriptionId: req.provisionedSubscriptionId
    });
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

checkReq();
