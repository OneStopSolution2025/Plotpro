/**
 * Secure bootstrap script for Supreme Admin platform owner account.
 * 
 * SAFEGUARDS:
 * - Reads credentials explicitly from environment variables (SUPREME_ADMIN_EMAIL, SUPREME_ADMIN_PASSWORD, SUPREME_ADMIN_NAME).
 * - Checks if a SUPREME_ADMIN already exists in the database. If so, aborts safely.
 * - Does NOT promote, alter, or touch any existing SUPER_ADMIN, ADMIN, or USER accounts.
 * - Does NOT automatically assign plans or subscriptions to existing subscribers.
 * - Never runs automatically during application boot or seeding.
 * 
 * Usage:
 *   SUPREME_ADMIN_EMAIL="owner@plotpro.in" SUPREME_ADMIN_PASSWORD="YourSecurePassword123!" node scripts/bootstrapSupremeAdmin.js
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function bootstrap() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[Bootstrap] Error: MONGODB_URI not found in backend/.env");
    process.exit(1);
  }

  const email = (process.env.SUPREME_ADMIN_EMAIL || process.argv[2] || "").trim().toLowerCase();
  const password = process.env.SUPREME_ADMIN_PASSWORD || process.argv[3] || "";
  const name = process.env.SUPREME_ADMIN_NAME || process.argv[4] || "Supreme Admin";

  if (!email || !password) {
    console.error("[Bootstrap] Error: Email and password are required.");
    console.log("Usage: node scripts/bootstrapSupremeAdmin.js <email> <password> [name]");
    console.log("Or define SUPREME_ADMIN_EMAIL and SUPREME_ADMIN_PASSWORD in environment.");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("[Bootstrap] Error: Password must be at least 8 characters long for platform owner.");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log(`[Bootstrap] Connected to database: ${mongoose.connection.name}`);

    // Check if any SUPREME_ADMIN already exists
    const existingSupreme = await User.findOne({ role: "SUPREME_ADMIN" });
    if (existingSupreme) {
      console.log(`[Bootstrap] Notice: A Supreme Admin account already exists (${existingSupreme.email}).`);
      console.log(`[Bootstrap] No new account created. Existing credentials are preserved.`);
      await mongoose.disconnect();
      process.exit(0);
    }

    // Check if the email is already in use by another role
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      console.error(`[Bootstrap] Error: An account with email ${email} already exists with role ${existingEmail.role}.`);
      console.error(`[Bootstrap] Will not overwrite or escalate existing account. Please specify a different email.`);
      await mongoose.disconnect();
      process.exit(1);
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const supremeAdmin = await User.create({
      name,
      email,
      passwordHash,
      role: "SUPREME_ADMIN",
      status: "ACTIVE",
      phone: "+91 00000 00000",
    });

    console.log(`[Bootstrap] Successfully created platform-owner account:`);
    console.log(`  ID:    ${supremeAdmin._id}`);
    console.log(`  Name:  ${supremeAdmin.name}`);
    console.log(`  Email: ${supremeAdmin.email}`);
    console.log(`  Role:  ${supremeAdmin.role}`);

    await mongoose.disconnect();
    console.log(`[Bootstrap] Done.`);
    process.exit(0);
  } catch (err) {
    console.error(`[Bootstrap] Error:`, err.message);
    process.exit(1);
  }
}

bootstrap();
