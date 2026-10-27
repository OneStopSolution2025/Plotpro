import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Plan from "../models/Plan.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const standardPackages = [
  {
    name: "Basic",
    slug: "basic",
    description: "Ideal for boutique developers & single projects with centralized administration",
    price: 1999,
    currency: "INR",
    billingInterval: "MONTHLY",
    durationDays: 30,
    maxAdminSeats: 0,
    isUnlimitedSeats: false,
    maxProjects: 3,
    features: [
      "0 Branch Admin seats (Centralized owner operation)",
      "Up to 3 Active Projects",
      "Public Enquiry Capture",
      "Basic Analytics",
    ],
    isActive: true,
  },
  {
    name: "Growth",
    slug: "growth",
    description: "Designed for expanding real estate developers managing regional locations",
    price: 6999,
    currency: "INR",
    billingInterval: "MONTHLY",
    durationDays: 30,
    maxAdminSeats: 2,
    isUnlimitedSeats: false,
    maxProjects: 15,
    features: [
      "Up to 2 Branch Admin seats",
      "Up to 15 Active Projects",
      "Interactive Plot Layouts",
      "Branch-Wise Enquiry & Site-Visit Management",
      "Export Reports",
    ],
    isActive: true,
  },
  {
    name: "Elite",
    slug: "elite",
    description: "Enterprise tier for premier multi-branch real estate developers",
    price: 14999,
    currency: "INR",
    billingInterval: "MONTHLY",
    durationDays: 30,
    maxAdminSeats: 3,
    isUnlimitedSeats: false,
    maxProjects: 50,
    features: [
      "Up to 3 Branch Admin seats initially (Expandable upon request)",
      "Up to 50 Active Projects",
      "Dedicated Account Manager",
      "Custom Branding & Live Vector Maps",
      "Priority Support",
    ],
    isActive: true,
  },
];

export async function ensureStandardPackages() {
  console.log("[EnsurePackages] Checking standard subscription packages...");

  // 1. Correct any legacy / typo records like "Eliet" / "eliet" -> "Elite" / "elite"
  const typoPlans = await Plan.find({
    $or: [
      { name: { $regex: /^eliet$/i } },
      { slug: { $regex: /^eliet$/i } },
    ],
  });

  for (const p of typoPlans) {
    p.name = "Elite";
    p.slug = "elite";
    if (typeof p.maxAdminSeats !== "number" || p.maxAdminSeats < 3) {
      p.maxAdminSeats = 3;
    }
    await p.save();
    console.log(`  ✓ Corrected typo plan "${p._id}" to "Elite" (slug: elite, seats: ${p.maxAdminSeats})`);
  }

  // 2. Ensure Basic, Growth, Elite exist and have correct default seats
  for (const pkg of standardPackages) {
    const existing = await Plan.findOne({
      $or: [{ slug: pkg.slug }, { name: { $regex: new RegExp(`^${pkg.name}$`, "i") } }],
    });

    if (!existing) {
      const created = await Plan.create(pkg);
      console.log(`  ✓ Created package tier: ${created.name} (${created.maxAdminSeats} Branch Admin seats)`);
    } else {
      let changed = false;
      if (existing.name !== pkg.name) {
        existing.name = pkg.name;
        changed = true;
      }
      if (existing.slug !== pkg.slug) {
        existing.slug = pkg.slug;
        changed = true;
      }
      if (existing.maxAdminSeats !== pkg.maxAdminSeats) {
        existing.maxAdminSeats = pkg.maxAdminSeats;
        changed = true;
      }
      if (changed) {
        await existing.save();
        console.log(`  ✓ Updated package tier: ${existing.name} (default seats: ${existing.maxAdminSeats})`);
      } else {
        console.log(`  - Package tier verified: ${existing.name} (default seats: ${existing.maxAdminSeats})`);
      }
    }
  }

  console.log("[EnsurePackages] All standard packages verified.");
}

// Run standalone if invoked directly
if (process.argv[1] && process.argv[1].endsWith("ensureStandardPackages.js")) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  await ensureStandardPackages();
  await mongoose.disconnect();
  process.exit(0);
}
