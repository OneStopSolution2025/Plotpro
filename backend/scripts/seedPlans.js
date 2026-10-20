/**
 * Optional plan seeding script.
 * Creates standard PlotPro subscription tiers if they do not exist.
 * Does NOT touch users or assign subscriptions.
 * 
 * Usage:
 *   node scripts/seedPlans.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Plan from "../models/Plan.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const defaultPlans = [
  {
    name: "Starter",
    slug: "starter",
    description: "Ideal for boutique developers & single projects",
    price: 4999,
    currency: "INR",
    billingInterval: "MONTHLY",
    durationDays: 30,
    maxAdminSeats: 3,
    maxProjects: 5,
    features: ["Up to 3 Admin seats", "5 Active Projects", "Inquiry Management", "Basic Analytics"],
    isActive: true,
  },
  {
    name: "Professional",
    slug: "professional",
    description: "Designed for growing real estate businesses managing multiple layouts",
    price: 12999,
    currency: "INR",
    billingInterval: "MONTHLY",
    durationDays: 30,
    maxAdminSeats: 10,
    maxProjects: 25,
    features: [
      "Up to 10 Admin seats",
      "25 Active Projects",
      "Interactive Plot Layouts",
      "Lead Allocation",
      "Export Reports",
    ],
    isActive: true,
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    description: "For large enterprise developers requiring high seat capacity and dedicated support",
    price: 34999,
    currency: "INR",
    billingInterval: "MONTHLY",
    durationDays: 30,
    maxAdminSeats: 50,
    maxProjects: 100,
    features: [
      "Up to 50 Admin seats",
      "100 Active Projects",
      "Dedicated Account Manager",
      "Full API Access",
      "Custom Branding",
    ],
    isActive: true,
  },
];

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[SeedPlans] MONGODB_URI not found");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log(`[SeedPlans] Connected to ${mongoose.connection.name}`);

    for (const p of defaultPlans) {
      const existing = await Plan.findOne({ slug: p.slug });
      if (!existing) {
        await Plan.create(p);
        console.log(`  ✓ Created plan: ${p.name} (${p.maxAdminSeats} seats, ₹${p.price})`);
      } else {
        console.log(`  - Plan already exists: ${p.name}`);
      }
    }

    await mongoose.disconnect();
    console.log("[SeedPlans] Done.");
    process.exit(0);
  } catch (err) {
    console.error("[SeedPlans] Error:", err.message);
    process.exit(1);
  }
}

seed();
