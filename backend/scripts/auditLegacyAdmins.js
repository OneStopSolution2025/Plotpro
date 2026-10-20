/**
 * Legacy Admin Ownership Audit & Optional Assignment Script.
 * 
 * SAFEGUARDS:
 * - Defaults to DRY-RUN mode.
 * - Does NOT assign ownership automatically without explicit confirmation.
 * - Reports each legacy admin, their project assignments, and proposed assignment.
 * - Requires --apply AND --tenant-id <id> to make any changes.
 * 
 * Usage:
 *   node scripts/auditLegacyAdmins.js               (Dry-run report)
 *   node scripts/auditLegacyAdmins.js --apply --tenant-id <subscriberId>  (Explicit apply)
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/User.js";
import Project from "../models/Project.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const isApply = process.argv.includes("--apply");
const tenantIndex = process.argv.indexOf("--tenant-id");
const explicitTenantId = tenantIndex !== -1 ? process.argv[tenantIndex + 1] : null;

async function audit() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[Audit] MONGODB_URI not found");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log(`[Audit] Connected to ${mongoose.connection.name}`);
    console.log(`[Audit] Mode: ${isApply ? "APPLY (writes requested)" : "DRY-RUN (read-only report)"}`);

    // Find all Super Admins (subscribers)
    const subscribers = await User.find({ role: "SUPER_ADMIN" }).select("_id name email status");
    console.log(`\n--- Registered Subscriber Businesses (${subscribers.length}) ---`);
    subscribers.forEach((s) => console.log(`  Subscriber: ${s.name} (${s.email}) [ID: ${s._id}]`));

    // Find all Admins
    const admins = await User.find({ role: "ADMIN" }).select("_id name email status tenantId");
    console.log(`\n--- Admin Accounts (${admins.length}) ---`);

    const unassignedAdmins = [];
    for (const a of admins) {
      const assignedProjects = await Project.find({ adminId: a._id, isArchived: false }).select("title");
      const projectNames = assignedProjects.map((p) => p.title).join(", ") || "None";
      const hasTenant = !!a.tenantId;

      console.log(`  Admin: ${a.name} (${a.email})`);
      console.log(`    Status: ${a.status} | TenantId: ${a.tenantId || "NONE (Unassigned Legacy)"}`);
      console.log(`    Assigned Projects: ${projectNames}`);

      if (!hasTenant) {
        unassignedAdmins.push(a);
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Total Admins: ${admins.length}`);
    console.log(`Unassigned Legacy Admins: ${unassignedAdmins.length}`);

    if (unassignedAdmins.length > 0) {
      console.log(`\n[Audit Policy]: Unassigned legacy admins are isolated from new tenants.`);
      if (!isApply) {
        console.log(`To link unassigned admins to a specific subscriber, run:`);
        console.log(`  node scripts/auditLegacyAdmins.js --apply --tenant-id <SUBSCRIBER_OBJECT_ID>`);
      } else {
        if (!explicitTenantId || !mongoose.Types.ObjectId.isValid(explicitTenantId)) {
          console.error(`[Audit] Error: --apply requires a valid --tenant-id <ObjectId>. Aborting.`);
          process.exit(1);
        }

        const targetSubscriber = await User.findOne({ _id: explicitTenantId, role: "SUPER_ADMIN" });
        if (!targetSubscriber) {
          console.error(`[Audit] Error: Subscriber with ID ${explicitTenantId} not found. Aborting.`);
          process.exit(1);
        }

        console.log(`[Audit] Explicit confirmation received. Assigning ${unassignedAdmins.length} admins to ${targetSubscriber.email}...`);
        const res = await User.updateMany(
          { role: "ADMIN", tenantId: null },
          { $set: { tenantId: targetSubscriber._id } }
        );
        console.log(`[Audit] Successfully assigned ${res.modifiedCount} admin(s) to tenant ${targetSubscriber.name}.`);
      }
    }

    await mongoose.disconnect();
    console.log("\n[Audit] Done.");
    process.exit(0);
  } catch (err) {
    console.error("[Audit] Error:", err.message);
    process.exit(1);
  }
}

audit();
