import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import SuperAdminRequest from "../models/SuperAdminRequest.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function fixOrphanRequest() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");

    const email = "gokul24015677@gmail.com";
    const request = await SuperAdminRequest.findOne({ email }).select("+passwordHash");
    if (!request) {
      console.log("Request not found!");
      return;
    }

    console.log(`Found request: ${request._id}, status: ${request.status}`);

    // Check if user already exists
    let user = await User.findOne({ email });
    if (!user) {
      console.log("Creating user for", email);
      user = await User.create({
        _id: request.provisionedUserId || new mongoose.Types.ObjectId(),
        name: request.name,
        email: request.email,
        passwordHash: request.passwordHash,
        phone: request.phone,
        businessName: request.businessName,
        authProvider: "local",
        isEmailVerified: false,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        tenantId: null,
      });
      console.log("User created with ID:", user._id);
    } else {
      console.log("User already exists:", user._id);
    }

    // Resolve plan
    const plan = await Plan.findById(request.requestedPlanId) || await Plan.findOne({ name: "Elite" }) || await Plan.findOne({});
    console.log("Using plan:", plan?.name, "maxProjects:", plan?.maxProjects, "maxAdminSeats:", plan?.maxAdminSeats);

    // Check or create subscription
    let subscription = await Subscription.findOne({ subscriberId: user._id });
    const effectiveDays = request.planSnapshot?.durationDays || plan?.durationDays || 30;
    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + effectiveDays);

    if (!subscription) {
      console.log("Creating subscription for user:", user._id);
      subscription = await Subscription.create({
        subscriberId: user._id,
        planId: plan._id,
        status: "ACTIVE",
        startDate,
        expiryDate,
        assignedSeats: plan.maxAdminSeats || 3,
        assignedProjects: plan.maxProjects || 50,
        usedSeats: 0,
        isCustomOverride: false,
        customOverrideReason: "",
        notes: "Restored from approved retailer request.",
      });
      console.log("Subscription created with ID:", subscription._id);
    } else {
      console.log("Subscription already exists:", subscription._id);
    }

    // Update request references
    request.provisionedUserId = user._id;
    request.provisionedSubscriptionId = subscription._id;
    request.status = "APPROVED";
    await request.save();
    console.log("Request successfully synchronized with User and Subscription!");

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

fixOrphanRequest();
