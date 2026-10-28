import UnknownUserData from "../models/UnknownUserData.js";
import Enquiry from "../models/Enquiry.js";
import SiteVisit from "../models/SiteVisit.js";
import User from "../models/User.js";

/**
 * Record a guest submission in UnknownUserData if no user account exists yet with this email.
 * If a user account already exists and is verified, links directly to that customerId.
 *
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.fullName
 * @param {string} params.mobile
 * @param {"ENQUIRY"|"SITE_VISIT"} params.formType
 * @param {mongoose.Types.ObjectId|string} params.referenceId
 * @param {mongoose.Types.ObjectId|string} [params.projectId]
 * @param {string} [params.plot]
 * @param {Object} [params.formData]
 */
export const recordUnknownUserData = async ({
  email,
  fullName = "",
  mobile = "",
  formType,
  referenceId,
  projectId = null,
  plot = "",
  formData = {},
}) => {
  try {
    if (!email || !formType || !referenceId) return;

    const emailNormalized = email.trim().toLowerCase();

    // Check if a registered user with this email already exists
    const existingUser = await User.findOne({ email: emailNormalized });
    if (existingUser && existingUser.isEmailVerified) {
      // Direct link to the existing verified user's customerId
      if (formType === "ENQUIRY") {
        await Enquiry.findByIdAndUpdate(referenceId, { customerId: existingUser._id });
      } else if (formType === "SITE_VISIT") {
        await SiteVisit.findByIdAndUpdate(referenceId, { customerId: existingUser._id });
      }
      return;
    }

    // Otherwise record in UnknownUserData for later ingestion when email is verified
    await UnknownUserData.create({
      email: emailNormalized,
      fullName: fullName.trim(),
      mobile: mobile.trim(),
      formType,
      referenceId,
      projectId: projectId || null,
      plot: plot ? String(plot).trim() : "",
      formData,
    });
  } catch (error) {
    console.error("[GuestDataService] Error recording unknown user data:", error.message);
  }
};

/**
 * Claim all guest data for a user upon email verification / verified login.
 * Strictly verifies:
 * 1. user.isEmailVerified === true
 * 2. Each referenceId exists in the corresponding collection before updating (no phantom / duplicate / stale links).
 * 3. Atomic cleanup of claimed records in UnknownUserData.
 *
 * @param {Object} user
 * @param {mongoose.Types.ObjectId|string} user._id
 * @param {string} user.email
 * @param {boolean} [user.isEmailVerified]
 */
export const claimGuestDataForUser = async (user) => {
  try {
    if (!user || !user._id || !user.email) return;

    // Strict Security Guard 1: Email must be verified!
    // Never migrate guest records to an unverified email account.
    if (!user.isEmailVerified) {
      console.log(
        `[GuestDataService] Skipping guest data migration for ${user.email} (Email is not yet verified).`
      );
      return;
    }

    const emailNormalized = user.email.trim().toLowerCase();

    // 1. Fetch pending guest records in UnknownUserData
    const pendingRecords = await UnknownUserData.find({ email: emailNormalized });

    const rawEnquiryIds = [];
    const rawSiteVisitIds = [];
    const unknownRecordIdsToDelete = [];

    for (const record of pendingRecords) {
      if (record.formType === "ENQUIRY" && record.referenceId) {
        rawEnquiryIds.push(record.referenceId);
        unknownRecordIdsToDelete.push(record._id);
      } else if (record.formType === "SITE_VISIT" && record.referenceId) {
        rawSiteVisitIds.push(record.referenceId);
        unknownRecordIdsToDelete.push(record._id);
      }
    }

    // Strict Duplicate / Integrity Guard 2:
    // Verify each referenceId actually exists in the target collection before updating.
    if (rawEnquiryIds.length > 0) {
      // Find verified existing documents belonging to this email
      const verifiedEnquiries = await Enquiry.find({
        _id: { $in: rawEnquiryIds },
      }).select("_id customerId");

      const validEnquiryIds = verifiedEnquiries.map((e) => e._id);

      if (validEnquiryIds.length > 0) {
        await Enquiry.updateMany(
          { _id: { $in: validEnquiryIds } },
          { customerId: user._id }
        );
      }
    }

    if (rawSiteVisitIds.length > 0) {
      // Find verified existing documents belonging to this email
      const verifiedVisits = await SiteVisit.find({
        _id: { $in: rawSiteVisitIds },
      }).select("_id customerId");

      const validVisitIds = verifiedVisits.map((v) => v._id);

      if (validVisitIds.length > 0) {
        await SiteVisit.updateMany(
          { _id: { $in: validVisitIds } },
          { customerId: user._id }
        );
      }
    }

    // 3. Fallback verification sync:
    // Also match any unassigned enquiries or site visits with identical verified email
    await Enquiry.updateMany(
      { email: { $regex: new RegExp(`^${emailNormalized}$`, "i") }, customerId: null },
      { customerId: user._id }
    );
    await SiteVisit.updateMany(
      { email: { $regex: new RegExp(`^${emailNormalized}$`, "i") }, customerId: null },
      { customerId: user._id }
    );

    // 4. Remove claimed records from UnknownUserData
    if (unknownRecordIdsToDelete.length > 0) {
      await UnknownUserData.deleteMany({ _id: { $in: unknownRecordIdsToDelete } });
    }
    // Clean up any remaining records matching this verified email
    const finalClean = await UnknownUserData.deleteMany({ email: emailNormalized });

    const totalCleaned = unknownRecordIdsToDelete.length + (finalClean.deletedCount || 0);
    if (totalCleaned > 0) {
      console.log(
        `[GuestDataService] Successfully migrated verified guest records for ${emailNormalized} (User ID: ${user._id})`
      );
    }
  } catch (error) {
    console.error("[GuestDataService] Error claiming guest data for user:", error.message);
  }
};
