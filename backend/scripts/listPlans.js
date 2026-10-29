import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Plan from "../models/Plan.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function listPlans() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const plans = await Plan.find({}).lean();
    console.log("=== ALL PLANS IN DB ===");
    console.log(JSON.stringify(plans, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

listPlans();
