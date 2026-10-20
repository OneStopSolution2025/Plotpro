/**
 * Seat Limit Reconciliation Script
 * 
 * Compares actual active tenant Admin accounts against usedSeats in Subscription documents.
 * Defaults to DRY-RUN mode.
 * 
 * Usage:
 *   node scripts/reconcileSeats.js          (Report discrepancies)
 *   node scripts/reconcileSeats.js --apply  (Apply atomic corrections)
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const isApply = process.argv.includes("--apply");

async function reconcile() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[Reconcile] MONGODB_URI not found");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log(`[Reconcile] Connected to ${mongoose.connection.name}`);
    console.log(`[Reconcile] Mode: ${isApply ? "APPLY (corrections enabled)" : "DRY-RUN (audit only)"}`);

    const subscriptions = await Subscription.find({}).populate("subscriberId planId");
    console.log(`\nFound ${subscriptions.length} subscription(s) to reconcile:\n`);

    let discrepanciesFound = 0;

    for (const sub of subscriptions) {
      const subscriber = sub.subscriberId;
      if (!subscriber) {
        console.log(`  [Warning] Orphaned subscription ${sub._id} (Subscriber deleted)`);
        continue;
      }

      // Count actual ACTIVE admins belonging to this subscriber
      const actualActiveAdmins = await User.countDocuments({
        role: "ADMIN",
        status: "ACTIVE",
        $or: [{ tenantId: subscriber._id }, { tenantId: null }],
      });

      const recordedUsedSeats = sub.usedSeats || 0;
      const isMismatch = recordedUsedSeats !== actualActiveAdmins;

      console.log(`  Subscriber: ${subscriber.name} (${subscriber.email})`);
      console.log(`    Plan: ${sub.planId?.name || "Custom"} | Assigned: ${sub.assignedSeats}`);
      console.log(`    Recorded usedSeats: ${recordedUsedSeats}`);
      console.log(`    Actual active admins: ${actualActiveAdmins}`);
      console.log(`    Status: ${isMismatch ? "DISCREPANCY DETECTED" : "MATCHED ✓"}`);

      if (isMismatch) {
        discrepanciesFound++;
        if (isApply) {
          await Subscription.updateOne(
            { _id: sub._id },
            { $set: { usedSeats: actualActiveAdmins } }
          );
          console.log(`    -> [APPLIED] Updated usedSeats to ${actualActiveAdmins}`);
        }
      }
      console.log("");
    }

    console.log(`--- Reconciliation Summary ---`);
    console.log(`Total Subscriptions: ${subscriptions.length}`);
    console.log(`Discrepancies: ${discrepanciesFound}`);
    if (discrepanciesFound > 0 && !isApply) {
      console.log(`To correct mismatches, run: node scripts/reconcileSeats.js --apply`);
    }

    await mongoose.disconnect();
    console.log("[Reconcile] Done.");
    process.exit(0);
  } catch (err) {
    console.error("[Reconcile] Error:", err.message);
    process.exit(1);
  }
}

reconcile();
