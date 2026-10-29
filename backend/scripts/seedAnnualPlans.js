import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Plan from "../models/Plan.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function seedAnnualPlans() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to DB.");

    const monthlyPlans = await Plan.find({ billingInterval: "MONTHLY" });
    console.log(`Found ${monthlyPlans.length} monthly plans.`);

    for (const mPlan of monthlyPlans) {
      const annualName = `${mPlan.name} (Annual)`;
      const annualSlug = `${mPlan.slug}-annual`;
      const originalAnnualPrice = Number(mPlan.price) * 12;
      const discountedPrice = Math.round(originalAnnualPrice * 0.8); // 20% discount

      let annualPlan = await Plan.findOne({
        $or: [{ slug: annualSlug }, { name: annualName }],
      });

      if (!annualPlan) {
        annualPlan = await Plan.create({
          name: annualName,
          slug: annualSlug,
          description: mPlan.description || `${mPlan.name} 1-year annual plan with 20% discount.`,
          price: discountedPrice,
          currency: mPlan.currency || "INR",
          billingInterval: "ANNUAL",
          durationDays: 365,
          maxAdminSeats: mPlan.maxAdminSeats,
          isUnlimitedSeats: mPlan.isUnlimitedSeats,
          maxProjects: mPlan.maxProjects,
          isUnlimitedProjects: mPlan.isUnlimitedProjects,
          features: mPlan.features,
          isActive: mPlan.isActive,
        });
        console.log(`Created annual plan: ${annualName} (₹${discountedPrice}, maxProjects: ${mPlan.maxProjects})`);
      } else {
        annualPlan.price = discountedPrice;
        annualPlan.billingInterval = "ANNUAL";
        annualPlan.durationDays = 365;
        annualPlan.maxProjects = mPlan.maxProjects;
        annualPlan.maxAdminSeats = mPlan.maxAdminSeats;
        annualPlan.features = mPlan.features;
        await annualPlan.save();
        console.log(`Updated annual plan: ${annualName} (₹${discountedPrice}, maxProjects: ${mPlan.maxProjects})`);
      }
    }

    const allPlans = await Plan.find({}).lean();
    console.log(`Total plans now: ${allPlans.length}`);
    allPlans.forEach(p => console.log(`- ${p.name} (${p.billingInterval}): ₹${p.price}, ${p.maxProjects} projects, ${p.maxAdminSeats} seats`));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

seedAnnualPlans();
