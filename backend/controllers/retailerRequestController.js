import bcrypt from "bcryptjs";
import { Resend } from "resend";
import mongoose from "mongoose";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import SuperAdminRequest from "../models/SuperAdminRequest.js";
import PlatformSettings from "../models/PlatformSettings.js";
import { storageService } from "../services/storageService.js";
import { createNotification } from "./notificationController.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_FROM = () => process.env.EMAIL_FROM || "DreamCity <Dreamcityadmin.in>";
const APP_URL = () => process.env.CLIENT_URL || "http://localhost:5173";

const ID_TYPE_LABELS = {
  AADHAAR: "Aadhaar Card",
  PAN: "PAN Card",
  PASSPORT: "Passport",
  DRIVING_LICENSE: "Driving License",
  VOTER_ID: "Voter ID",
  OTHER: "Other ID",
};

const PAYMENT_METHOD_LABELS = {
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

/**
 * Send transactional email — always best-effort, never blocks the request/approval.
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[RetailerRequest] RESEND_API_KEY missing; skipping email:", subject);
      return false;
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from: EMAIL_FROM(), to, subject, html });
    if (error) {
      console.error("[RetailerRequest] Email send failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[RetailerRequest] Email error:", err.message);
    return false;
  }
};

const shell = (title, bodyHtml) => `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f3f5f8;border-radius:12px;">
    <div style="background:#ffffff;border-radius:10px;padding:32px;box-shadow:0 4px 16px rgba(20,40,70,0.08);">
      <h2 style="margin:0 0 6px;color:#121d31;font-size:22px;font-weight:700;">DreamCity</h2>
      <p style="margin:0 0 24px;color:#718096;font-size:13px;">Real Estate Platform</p>
      ${bodyHtml}
      <p style="margin:0;color:#a0aec0;font-size:12px;text-align:center;">
        © ${new Date().getFullYear()} DreamCity Real Estate. All rights reserved.
      </p>
    </div>
  </div>
`;

/** True when the request carries any payment declaration (manual entry or gateway capture). */
const hasPaymentEvidence = (payment) =>
  Boolean(payment && (payment.method || payment.transactionId || payment.proofUrl));

/**
 * Public-safe projection of a retailer request (never leak passwordHash).
 */
const toPublicRequest = (doc, plan) => {
  const obj = doc.toObject ? doc.toObject() : doc;
  delete obj.passwordHash;
  return {
    ...obj,
    id: String(obj._id),
    plan: plan
      ? {
          _id: plan._id,
          name: plan.name,
          price: plan.price,
          currency: plan.currency,
          billingInterval: plan.billingInterval,
          durationDays: plan.durationDays,
          maxAdminSeats: plan.maxAdminSeats,
          isUnlimitedSeats: plan.isUnlimitedSeats,
          features: plan.features || [],
          isActive: plan.isActive,
        }
      : null,
    idTypeLabel: obj.identity ? ID_TYPE_LABELS[obj.identity.idType] || obj.identity.idType : "",
    paymentMethodLabel: obj.payment
      ? PAYMENT_METHOD_LABELS[obj.payment.method] || obj.payment.method
      : "",
  };
};

/**
 * Resolve the authoritative plan for a request.
 * Priority: explicitly chosen override planId (Supreme Admin, must be ACTIVE),
 * otherwise the originally requested plan (must exist & be ACTIVE).
 */
const resolvePlanForRequest = async (request, overridePlanId) => {
  if (overridePlanId) {
    const plan = await Plan.findOne({ _id: overridePlanId, isActive: true });
    if (!plan) {
      const err = new Error("The selected override package was not found or is inactive.");
      err.statusCode = 404;
      throw err;
    }
    return plan;
  }
  const plan = await Plan.findOne({ _id: request.requestedPlanId, isActive: true });
  if (!plan) {
    const err = new Error(
      "The originally requested package is no longer available. Please select another active package for this approval."
    );
    err.statusCode = 404;
    throw err;
  }
  return plan;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public endpoints (unauthenticated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    List ACTIVE subscription packages for the retailer signup form
 *          (reads the existing Supreme-Admin-managed Plan collection)
 * @route   GET /api/auth/retailer/plans
 * @access  Public
 */
export const getPublicActivePlans = async (req, res, next) => {
  try {
    const plans = await Plan.find({ isActive: true })
      .select("name description price currency billingInterval durationDays maxAdminSeats isUnlimitedSeats features")
      .sort({ price: 1, createdAt: 1 });

    res.status(200).json({
      success: true,
      count: plans.length,
      data: plans,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Submit a Super Admin (retailer) account creation request.
 *          Creates NO user — the account becomes usable only after
 *          Supreme Admin approval. Payment proof is stored as evidence
 *          only; payment is never auto-marked as verified.
 * @route   POST /api/auth/retailer/request
 * @access  Public
 */
export const submitRetailerRequest = async (req, res, next) => {
  const {
    name,
    email,
    password,
    phone,
    businessName,
    planId,
    paymentMethod,
    transactionId,
    paidAmount,
    paidOn,
    paymentNotes,
    paymentProofData,
    paymentProofMime,
    idType,
    idNumber,
  } = req.body;

  let proofUrl = "";
  let proofPublicId = "";
  let request = null;

  try {
    // Respect the platform-wide self registration switch
    const settings = await PlatformSettings.findOne({});
    if (settings && settings.allowSelfRegistration === false) {
      return res.status(403).json({
        success: false,
        message: "Public self-registration is currently disabled by platform administration.",
      });
    }

    // ── Validation ─────────────────────────────────────────────────
    if (!name || !email || !password || !businessName || !planId) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password, business name, and package selection are required.",
      });
    }
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }
    const validIdTypes = Object.keys(ID_TYPE_LABELS);
    if (!idType || !validIdTypes.includes(idType) || !idNumber || !String(idNumber).trim()) {
      return res.status(400).json({
        success: false,
        message: "Valid ID type and ID number are required.",
      });
    }

    // Payment details are OPTIONAL at submission — they will normally be
    // captured by the payment gateway integration. When the applicant has
    // declared manual payment details, validate their structure.
    const validMethods = Object.keys(PAYMENT_METHOD_LABELS);
    const declaredPayment = Boolean(
      paymentMethod || transactionId || paymentNotes || paymentProofData
    );
    if (declaredPayment) {
      if (!paymentMethod || !validMethods.includes(paymentMethod)) {
        return res.status(400).json({
          success: false,
          message: "A valid payment method is required when submitting payment details.",
        });
      }
      if (!transactionId || !String(transactionId).trim()) {
        return res.status(400).json({
          success: false,
          message: "Transaction / reference ID is required when submitting payment details.",
        });
      }
    }

    let declaredAmount = null;
    if (paidAmount !== undefined && paidAmount !== null && paidAmount !== "") {
      declaredAmount = Number(paidAmount);
      if (Number.isNaN(declaredAmount) || declaredAmount < 0) {
        return res.status(400).json({
          success: false,
          message: "Declared payment amount must be a non-negative number.",
        });
      }
    }

    let parsedPaidOn = new Date();
    if (paidOn) {
      parsedPaidOn = new Date(paidOn);
      if (Number.isNaN(parsedPaidOn.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Payment date is invalid.",
        });
      }
    }

    const emailNormalized = String(email).trim().toLowerCase();

    // ── Collision guards ───────────────────────────────────────────
    const existingUser = await User.findOne({ email: emailNormalized });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const pendingRequest = await SuperAdminRequest.findOne({
      email: emailNormalized,
      status: "PENDING",
    });
    if (pendingRequest) {
      return res.status(409).json({
        success: false,
        message: "A retailer account request with this email is already awaiting approval.",
      });
    }

    // ── Resolve the authoritative plan (client prices are IGNORED) ─
    const plan = await Plan.findOne({ _id: planId, isActive: true });
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Selected package not found or is no longer available.",
      });
    }

    // ── Optional payment proof upload (evidence only) ──────────────
    if (paymentProofData) {
      const mime = paymentProofMime || "image/png";
      // ~5 MB raw file cap (base64 inflates by ~4/3)
      if (paymentProofData.length > 7_000_000) {
        return res.status(400).json({
          success: false,
          message: "Payment proof image is too large. Maximum size is 5 MB.",
        });
      }
      const upload = await storageService.uploadRequestProof({
        fileData: paymentProofData,
        mimeType: mime,
        requestId: "pending",
      });
      proofUrl = upload.imageUrl;
      proofPublicId = upload.publicId;
    }

    // ── Hash password & persist request ────────────────────────────
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    request = await SuperAdminRequest.create({
      name: String(name).trim(),
      email: emailNormalized,
      phone: phone ? String(phone).trim() : "",
      businessName: String(businessName).trim(),
      passwordHash,
      requestedPlanId: plan._id,
      planSnapshot: {
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
        billingInterval: plan.billingInterval,
        durationDays: plan.durationDays,
        maxAdminSeats: plan.maxAdminSeats,
        isUnlimitedSeats: Boolean(plan.isUnlimitedSeats),
        features: Array.isArray(plan.features) ? plan.features : [],
      },
      payment: declaredPayment
        ? {
            method: paymentMethod,
            transactionId: String(transactionId).trim(),
            // Declared amount is informational. Authoritative reference = plan price.
            amount: declaredAmount !== null ? declaredAmount : plan.price,
            currency: plan.currency || "INR",
            paidOn: parsedPaidOn,
            proofUrl,
            proofPublicId,
            notes: paymentNotes ? String(paymentNotes).trim() : "",
            // Explicitly NOT verified — Supreme Admin must verify manually.
            verified: false,
          }
        : {
            // No payment captured yet — future payment-gateway integration
            // will attach gateway transaction data here.
            verified: false,
          },
      identity: {
        idType,
        idNumber: String(idNumber).trim(),
      },
      status: "PENDING",
    });

    // The proof upload was staged in a "pending" folder; move it under the
    // real request id folder so assets stay organized per request.
    if (proofUrl) {
      try {
        const moved = await storageService.uploadRequestProof({
          fileData: paymentProofData,
          mimeType: paymentProofMime || "image/png",
          requestId: request._id,
        });
        proofUrl = moved.imageUrl;
        proofPublicId = moved.publicId;
        request.payment.proofUrl = proofUrl;
        request.payment.proofPublicId = proofPublicId;
        await request.save();
      } catch (moveError) {
        // Ignore the move failure — staged folder copy is already stored
        console.warn("[RetailerRequest] Proof re-scope failed, keeping staged copy:", moveError.message);
      }
    }

    // ── Notify Supreme Admins (in-app) ─────────────────────────────
    const supremeAdmins = await User.find({ role: "SUPREME_ADMIN", status: "ACTIVE" }).select("_id");
    await Promise.all(
      supremeAdmins.map((admin) =>
        createNotification({
          recipient: admin._id,
          senderRole: "SYSTEM",
          senderName: "Signup System",
          type: "RETAILER_SIGNUP_REQUEST",
          title: "New Super Admin Account Request",
          message: `"${request.businessName}" (${request.email}) requested a Super Admin (Retailer) account on the "${plan.name}" package. Package and ID details are awaiting your review.`,
          metadata: {
            requestId: String(request._id),
            applicantEmail: request.email,
          },
        })
      )
    );

    // ── Acknowledge email to the applicant (best effort) ───────────
    await sendEmail({
      to: request.email,
      subject: "Your DreamCity Retailer Account Request",
      html: shell(
        "Request received",
        `
        <h3 style="margin:0 0 8px;color:#121d31;font-size:18px;">Request received</h3>
        <p style="margin:0 0 24px;color:#4a5568;font-size:14px;line-height:1.6;">
          Hello ${request.name},<br/><br/>
          We have received your Super Admin (Retailer) account request for
          <strong>${request.businessName}</strong> on the
          <strong>${plan.name}</strong> package (${plan.currency} ${plan.price}).
          <br/><br/>
          Your request is now <strong>pending approval</strong> by the DreamCity platform administrator.
          You will receive an email as soon as your account is reviewed. You cannot log in until it is approved.
        </p>
        `
      ),
    });

    res.status(201).json({
      success: true,
      message:
        "Your Super Admin (Retailer) account request has been submitted and is awaiting Supreme Admin approval. You will be able to log in once it is approved.",
      data: {
        id: String(request._id),
        email: request.email,
        businessName: request.businessName,
        status: request.status,
        plan: { name: plan.name, price: plan.price, currency: plan.currency },
      },
    });
  } catch (error) {
    // Clean up orphan proof upload if the request creation failed after upload
    if (proofPublicId && !request) {
      try {
        await storageService.deleteLayoutImage(proofPublicId);
      } catch {
        /* non-blocking cleanup */
      }
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message || "Request submission failed.",
      });
    }
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Supreme Admin endpoints (PROTECTED by route-level authorize)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    List retailer account requests for review
 * @route   GET /api/supreme-admin/retailer-requests?status=PENDING&search=
 * @access  Private (Supreme Admin)
 */
export const getRetailerRequests = async (req, res, next) => {
  try {
    const { status, search } = req.query;

    const query = {};
    if (status && ["PENDING", "APPROVED", "REJECTED"].includes(String(status).toUpperCase())) {
      query.status = String(status).toUpperCase();
    }
    if (search) {
      const reg = new RegExp(String(search).trim(), "i");
      query.$or = [{ name: reg }, { email: reg }, { businessName: reg }, { phone: reg }];
    }

    const requests = await SuperAdminRequest.find(query)
      .populate("requestedPlanId", "name price currency durationDays maxAdminSeats isUnlimitedSeats isActive")
      .sort({ createdAt: -1 })
      .limit(200);

    const counts = {
      pending: await SuperAdminRequest.countDocuments({ status: "PENDING" }),
      approved: await SuperAdminRequest.countDocuments({ status: "APPROVED" }),
      rejected: await SuperAdminRequest.countDocuments({ status: "REJECTED" }),
    };

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests.map((r) => toPublicRequest(r, r.requestedPlanId)),
      counts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Detailed view of a single retailer account request
 * @route   GET /api/supreme-admin/retailer-requests/:id
 * @access  Private (Supreme Admin)
 */
export const getRetailerRequestById = async (req, res, next) => {
  try {
    const request = await SuperAdminRequest.findById(req.params.id)
      .populate("requestedPlanId")
      .populate("reviewedBy", "name email");

    if (!request) {
      return res.status(404).json({ success: false, message: "Retailer request not found." });
    }

    let provisioned = null;
    if (request.provisionedUserId) {
      provisioned = await User.findById(request.provisionedUserId).select("name email status role");
      if (request.provisionedSubscriptionId) {
        provisioned = provisioned
          ? { ...provisioned.toObject(), subscription: await Subscription.findById(request.provisionedSubscriptionId) }
          : null;
      }
    }

    res.status(200).json({
      success: true,
      data: { ...toPublicRequest(request, request.requestedPlanId), provisioned },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Explicitly mark the declared payment as manually verified (or un-verify).
 *          An uploaded proof screenshot never sets this automatically.
 * @route   PATCH /api/supreme-admin/retailer-requests/:id/payment-verification
 * @access  Private (Supreme Admin)
 */
export const setPaymentVerification = async (req, res, next) => {
  try {
    const { verified, note } = req.body;
    const request = await SuperAdminRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Retailer request not found." });
    }

    if (request.status === "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "This request is already approved; payment verification state is locked.",
      });
    }

    const shouldVerify = Boolean(verified);
    request.payment.verified = shouldVerify;
    request.payment.verifiedBy = shouldVerify ? req.user?._id ?? null : null;
    request.payment.verifiedAt = shouldVerify ? new Date() : null;
    request.payment.verificationNote = note ? String(note).trim() : "";
    await request.save();

    res.status(200).json({
      success: true,
      message: shouldVerify
        ? "Payment details marked as manually verified."
        : "Payment verification revoked.",
      data: toPublicRequest(request, request.requestedPlanId),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve a retailer request → provisions the SUPER_ADMIN User,
 *          its Subscription from the chosen package (authoritative plan
 *          pricing/entitlements only) and finalizes the request.
 *          Idempotent: re-invoking an already-approved request returns the
 *          already-provisioned entities without duplicating anything.
 *          Retries after partial failures adopt the existing user and/or
 *          subscription instead of recreating them.
 * @route   PATCH /api/supreme-admin/retailer-requests/:id/approve
 * @access  Private (Supreme Admin)
 */
export const approveRetailerRequest = async (req, res, next) => {
  const { planId, durationDays, assignedSeats, isCustomOverride, customOverrideReason } = req.body || {};
  let request;

  try {
    request = await SuperAdminRequest.findById(req.params.id).select("+passwordHash");
    if (!request) {
      return res.status(404).json({ success: false, message: "Retailer request not found." });
    }

    // ── Idempotency: already approved → return existing entities ─────
    if (request.status === "APPROVED") {
      const existingUser = request.provisionedUserId
        ? await User.findById(request.provisionedUserId).select("-passwordHash")
        : await User.findOne({ email: request.email, role: "SUPER_ADMIN" }).select("-passwordHash");
      const existingSub = existingUser
        ? await Subscription.findOne({ subscriberId: existingUser._id }).sort({ createdAt: -1 })
        : null;
      return res.status(200).json({
        success: true,
        alreadyApproved: true,
        message: "This request was already approved. No changes were made.",
        data: { userId: existingUser?._id, subscriptionId: existingSub?._id },
      });
    }

    if (request.status === "REJECTED") {
      return res.status(400).json({
        success: false,
        message: "This request was rejected and cannot be approved.",
      });
    }

    // ── Payment verification enforcement ────────────────────────────
    // Only applies when payment details were declared on the request.
    // An uploaded proof is evidence only; it never auto-approves payment.
    // When no payment has been captured yet (e.g. gateway integration
    // upcoming), the package terms govern and approval may proceed.
    if (hasPaymentEvidence(request.payment) && request.payment.verified !== true) {
      return res.status(403).json({
        success: false,
        paymentNotVerified: true,
        message:
          "Payment details have not been verified yet. Use 'Mark Payment Verified' after checking the transaction before approving.",
      });
    }

    // ── Resolve authoritative plan (client values ignored) ─────────
    const plan = await resolvePlanForRequest(request, planId);

    // Seat / duration entitlements mirror assignSubscriberSubscription semantics
    let effectiveSeats = plan.maxAdminSeats;
    let overrideFlag = false;
    let overrideReasonText = "";
    if (isCustomOverride) {
      overrideFlag = true;
      overrideReasonText = customOverrideReason
        ? String(customOverrideReason).trim()
        : "Custom seat allocation approved by Platform Owner";
      effectiveSeats = assignedSeats !== undefined && assignedSeats !== null && assignedSeats !== ""
        ? Math.max(0, Number(assignedSeats))
        : plan.maxAdminSeats;
    }

    // Seats >= 0 allowed (Basic plan has 0 seats)
    if (typeof effectiveSeats !== "number" || effectiveSeats < 0) {
      return res.status(400).json({
        success: false,
        message: "Resolved package has an invalid seat allocation. Please fix the plan configuration first.",
      });
    }

    const effectiveDays = durationDays ? Number(durationDays) : plan.durationDays;
    if (!effectiveDays || effectiveDays < 1) {
      return res.status(400).json({
        success: false,
        message: "Resolved package has an invalid duration. Please fix the plan configuration first.",
      });
    }

    // ── Tenant provisioning (partial-failure tolerant) ─────────────
    // 1) USER — adopt if a previous attempt (or parallel path) already created it
    let user;
    if (request.provisionedUserId) {
      user = await User.findById(request.provisionedUserId);
      if (user && user.role !== "SUPER_ADMIN") {
        // Provisioned id points at an unexpected account — surface clearly instead of clobbering
        return res.status(409).json({
          success: false,
          message: `Linked account ${user.email} has role ${user.role}; expected SUPER_ADMIN. Resolve manually.`,
        });
      }
    }
    if (!user) {
      const existingByEmail = await User.findOne({ email: request.email });
      if (existingByEmail) {
        if (
          existingByEmail.role === "SUPER_ADMIN" &&
          (request.provisionedUserId || !existingByEmail.tenantId)
        ) {
          user = existingByEmail; // adopt (retry after partial failure)
        } else {
          return res.status(409).json({
            success: false,
            message: `An account with email ${existingByEmail.email} (role ${existingByEmail.role}) was created after this request. Reject this request or resolve the conflict manually.`,
          });
        }
      }
    }

    if (!user) {
      user = await User.create({
        name: request.name,
        email: request.email,
        passwordHash: request.passwordHash,
        phone: request.phone,
        businessName: request.businessName,
        authProvider: "local",
        isEmailVerified: false,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        tenantId: null, // subscriber itself owns the tenant
      });
    }

    // Register provisioning progress as early as possible (retry anchor)
    if (String(request.provisionedUserId || "") !== String(user._id)) {
      request.provisionedUserId = user._id;
      await request.save();
    }

    // 2) SUBSCRIPTION from the plan — reuse if a previous attempt created one
    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + effectiveDays);

    let subscription = await Subscription.findOne({ subscriberId: user._id }).sort({ createdAt: -1 });
    const currentActiveAdmins = await User.countDocuments({
      role: "ADMIN",
      status: "ACTIVE",
      tenantId: user._id,
    });

    if (subscription) {
      subscription.planId = plan._id;
      subscription.status = "ACTIVE";
      subscription.startDate = startDate;
      subscription.expiryDate = expiryDate;
      subscription.assignedSeats = effectiveSeats;
      subscription.usedSeats = currentActiveAdmins;
      subscription.isCustomOverride = overrideFlag;
      subscription.customOverrideReason = overrideReasonText;
      await subscription.save();
    } else {
      subscription = await Subscription.create({
        subscriberId: user._id,
        planId: plan._id,
        status: "ACTIVE",
        startDate,
        expiryDate,
        assignedSeats: effectiveSeats,
        usedSeats: currentActiveAdmins,
        isCustomOverride: overrideFlag,
        customOverrideReason: overrideReasonText,
        notes: "Provisioned from approved retailer signup request.",
      });
    }

    // 3) Finalize the request
    request.status = "APPROVED";
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.provisionedUserId = user._id;
    request.provisionedSubscriptionId = subscription._id;
    request.provisioningError = "";
    await request.save();

    // Clear stale notifications for this request on Supreme side is unnecessary;
    // Supreme Admin UI re-reads statuses live.

    // ── Post-commit comms (best effort, never blocking) ────────────
    await sendEmail({
      to: user.email,
      subject: "Your DreamCity Retailer Account is Approved",
      html: shell(
        "Approved",
        `
        <h3 style="margin:0 0 8px;color:#121d31;font-size:18px;">Account approved 🎉</h3>
        <p style="margin:0 0 24px;color:#4a5568;font-size:14px;line-height:1.6;">
          Hello ${user.name},<br/><br/>
          Your Super Admin (Retailer) account for <strong>${user.businessName}</strong> has been
          approved on the <strong>${plan.name}</strong> package.
        </p>
        <div style="background:#f0fff4;border:2px solid #22c55e;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
          <p style="margin:0;color:#166534;font-size:14px;line-height:1.7;">
            <strong>Package:</strong> ${plan.name} (${plan.currency} ${plan.price})<br/>
            <strong>Valid till:</strong> ${expiryDate.toDateString()}<br/>
            <strong>Staff admin seats:</strong> ${plan.isUnlimitedSeats ? "Unlimited" : effectiveSeats}
          </p>
        </div>
        <p style="margin:0 0 24px;color:#4a5568;font-size:14px;">
          You can now log in with your registered email and password at
          <a href="${APP_URL()}/login" style="color:#1268d8;">${APP_URL()}/login</a>.
        </p>
        `
      ),
    });

    await createNotification({
      recipient: user._id,
      sender: req.user._id,
      senderRole: "SUPREME_ADMIN",
      senderName: req.user.name || "Supreme Administrator",
      type: "RETAILER_REQUEST_APPROVED",
      title: "Retailer Account Approved",
      message: `Your Super Admin account has been approved on the "${plan.name}" package. You can now access your dashboard.`,
      metadata: { requestId: String(request._id), adminName: user.name },
    });

    const userPublic = user.toObject();
    delete userPublic.passwordHash;

    res.status(200).json({
      success: true,
      message: `Retailer account approved. "${user.businessName}" is now an active Super Admin with the "${plan.name}" package.`,
      data: {
        request: toPublicRequest(request, plan),
        user: userPublic,
        subscription,
      },
    });
  } catch (error) {
    // Persist failure diagnostics for visibility + retry support
    if (request && request._id && request.status === "PENDING") {
      try {
        await SuperAdminRequest.updateOne(
          { _id: request._id, status: "PENDING" },
          { $set: { provisioningError: String(error.message || "Unknown provisioning error").slice(0, 500) } }
        );
      } catch {
        /* non-blocking */
      }
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message || "Approval failed.",
      });
    }
    next(error);
  }
};

/**
 * @desc    Reject a retailer request with a mandatory reason.
 * @route   PATCH /api/supreme-admin/retailer-requests/:id/reject
 * @access  Private (Supreme Admin)
 */
export const rejectRetailerRequest = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body || {};
    if (!rejectionReason || !String(rejectionReason).trim()) {
      return res.status(400).json({
        success: false,
        message: "A rejection reason is required.",
      });
    }

    const request = await SuperAdminRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Retailer request not found." });
    }

    if (request.status === "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "This request is already approved and cannot be rejected. Manage the subscriber instead.",
      });
    }

    request.status = "REJECTED";
    request.reviewNote = String(rejectionReason).trim();
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    await request.save();

    await sendEmail({
      to: request.email,
      subject: "Update on Your DreamCity Retailer Account Request",
      html: shell(
        "Rejected",
        `
        <h3 style="margin:0 0 8px;color:#121d31;font-size:18px;">Request not approved</h3>
        <p style="margin:0 0 24px;color:#4a5568;font-size:14px;line-height:1.6;">
          Hello ${request.name},<br/><br/>
          Unfortunately your Super Admin (Retailer) account request for
          <strong>${request.businessName}</strong> was not approved.
        </p>
        <div style="background:#fff5f5;border:2px solid #e53e3e;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
          <p style="margin:0;color:#9b2c2c;font-size:14px;line-height:1.7;">
            <strong>Reason:</strong> ${String(rejectionReason).trim()}
          </p>
        </div>
        <p style="margin:0;color:#4a5568;font-size:14px;">
          If you believe this is a mistake, you may contact support or submit a new request.
        </p>
        `
      ),
    });

    const supremeAdmins = await User.find({ role: "SUPREME_ADMIN", status: "ACTIVE" }).select("_id");
    await Promise.all(
      supremeAdmins.map((admin) =>
        createNotification({
          recipient: admin._id,
          sender: req.user._id,
          senderRole: "SUPREME_ADMIN",
          senderName: req.user.name || "Supreme Administrator",
          type: "RETAILER_REQUEST_REJECTED",
          title: "Retailer Account Request Rejected",
          message: `Request from "${request.businessName}" (${request.email}) was rejected. Reason: ${String(rejectionReason).trim()}`,
          metadata: { requestId: String(request._id), applicantEmail: request.email },
        })
      )
    );

    res.status(200).json({
      success: true,
      message: "Retailer request rejected and the applicant has been notified.",
      data: toPublicRequest(request, request.requestedPlanId),
    });
  } catch (error) {
    next(error);
  }
};
