import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Plot from "../models/Plot.js";
import Enquiry from "../models/Enquiry.js";
import SiteVisit from "../models/SiteVisit.js";
import {
  usersSeed,
  projectsSeed,
  projectPlotCounts,
  sizes,
  facings,
  statuses,
  prices,
} from "./seedData.js";

dotenv.config();

const runSeed = async () => {
  try {
    console.log("[Seed] Starting idempotent database seeding...");
    await connectDB();

    // 1. Clean existing collections
    console.log("[Seed] Cleaning existing collections...");
    await User.deleteMany({});
    await Project.deleteMany({});
    await Plot.deleteMany({});
    await Enquiry.deleteMany({});
    await SiteVisit.deleteMany({});

    // 2. Seed exactly 6 Users (1 SUPER_ADMIN, 4 ADMIN, 1 USER)
    console.log("[Seed] Seeding 6 user accounts...");
    const createdUsers = {};

    for (const u of usersSeed) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(u.password, salt);

      const createdUser = await User.create({
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        status: u.status,
        phone: u.phone,
      });

      createdUsers[u.slug] = createdUser;
      console.log(`  ✓ Created [${u.role}] ${u.name} (${u.email})`);
    }

    const superAdminUser = createdUsers["superadmin"];

    // 3. Seed Projects (18 Approved, 2 Pending)
    console.log("[Seed] Seeding 20 projects (18 Approved, 2 Pending)...");
    const createdProjectsMap = {};

    for (const p of projectsSeed) {
      const assignedAdmin = createdUsers[p.adminSlug];
      const isApproved = p.approvalStatus === "APPROVED";

      const defaultImages = [
        "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1524813686514-a57563d77d61?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&auto=format&fit=crop&q=80",
      ];
      const projectImg = p.image || defaultImages[(p.customId || 1) % defaultImages.length];
      const projectImgs = p.images || [projectImg, defaultImages[((p.customId || 1) + 1) % defaultImages.length]];

      const createdProject = await Project.create({
        customId: p.customId,
        title: p.title,
        location: p.location,
        city: p.city,
        category: p.category,
        plotType: p.plotType,
        budget: p.budget,
        plotPrice: p.plotPrice,
        priceLakhs: p.priceLakhs,
        plotSizes: p.plotSizes,
        distance: p.distance,
        status: p.status,
        launchDate: p.launchDate,
        about: p.about,
        image: projectImg,
        images: projectImgs,
        adminId: assignedAdmin ? assignedAdmin._id : null,
        approvalStatus: p.approvalStatus,
        approvedAt: isApproved ? new Date() : null,
        approvedBy: isApproved ? superAdminUser._id : null,
        rejectionReason: "",
        hasPendingUpdates: false,
        pendingUpdates: null,
        isArchived: false,
      });

      createdProjectsMap[p.customId] = createdProject;
    }

    console.log("  ✓ Created 16 APPROVED canonical projects (4 per admin)");

    // 4. Seed Canonical Plots for Projects 1..16
    console.log("[Seed] Generating canonical plots for projects 1..16...");
    const plotsToInsert = [];

    Object.entries(projectPlotCounts).forEach(([projectIdStr, totalPlots]) => {
      const projectId = Number(projectIdStr);
      const projectDoc = createdProjectsMap[projectId];

      if (!projectDoc) return;

      for (let index = 1; index <= totalPlots; index++) {
        const plotNumber = `${projectId}${String(index).padStart(2, "0")}`;
        const customId = `${projectId}-${index}`;

        plotsToInsert.push({
          customId,
          projectId: projectDoc._id,
          projectCustomId: projectId,
          plotNumber,
          size: sizes[(index - 1) % sizes.length],
          facing: facings[(index - 1) % facings.length],
          price: prices[(index - 1) % prices.length],
          status: statuses[(index - 1) % statuses.length],
          image: "/assets/plot.webp",
          images: ["/assets/plot.webp"],
        });
      }
    });

    console.log(`[Seed] Inserting ${plotsToInsert.length} plots in bulk...`);
    await Plot.insertMany(plotsToInsert);
    console.log(`  ✓ Successfully inserted ${plotsToInsert.length} plot records`);

    // 5. Seed Initial Mock Enquiries and Site Visits for demo accounts
    console.log("[Seed] Seeding sample enquiries and site visits...");
    const greenValley = createdProjectsMap[1];
    const arunAdmin = createdUsers["arun"];

    await Enquiry.create([
      {
        fullName: "Ramesh Sharma",
        email: "ramesh@example.com",
        mobile: "9876543210",
        contactMethod: "phone",
        message: "Interested in East facing residential plots.",
        projectId: greenValley._id,
        plot: "101",
        assignedAdminId: arunAdmin._id,
        status: "NEW",
      },
      {
        fullName: "Suresh Patel",
        email: "suresh@example.com",
        mobile: "9876512345",
        contactMethod: "whatsapp",
        message: "Looking for 1200 sq.ft villa plot.",
        projectId: greenValley._id,
        plot: "102",
        assignedAdminId: arunAdmin._id,
        status: "CONTACTED",
      },
    ]);

    await SiteVisit.create([
      {
        fullName: "Meena Sundaram",
        email: "meena@example.com",
        mobile: "9843267890",
        preferredDate: "2026-10-05",
        preferredTime: "10:30 AM",
        message: "Weekend site visit with family.",
        projectId: greenValley._id,
        plot: "101",
        assignedAdminId: arunAdmin._id,
        status: "Scheduled",
      },
    ]);

    console.log("  ✓ Created sample enquiries and site visits");

    console.log("\n========================================================");
    console.log("🎉 SEED COMPLETED SUCCESSFULLY!");
    console.log("========================================================");
    console.log(`Users Created:    6 (1 Super Admin, 4 Admins, 1 Customer)`);
    console.log(`Projects Created: ${projectsSeed.length} (All APPROVED, 4 per admin)`);
    console.log(`Plots Created:    ${plotsToInsert.length}`);
    console.log("========================================================\n");

    process.exit(0);
  } catch (error) {
    console.error("[Seed] Error during seeding:", error);
    process.exit(1);
  }
};

runSeed();
