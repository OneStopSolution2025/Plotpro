import mongoose from "mongoose";
import User from "../models/User.js";
import Project from "../models/Project.js";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SUPREME ADMIN — Published Projects Overview (platform-wide, READ-ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 *  "Published" in PlotPro is defined as:
 *      approvalStatus: "APPROVED"  &&  isArchived: false
 *  The published date is the existing `approvedAt` field.
 *
 *  Tenant attribution uses the EXISTING relationships only:
 *      • Branch Admin attribution  → Project.adminId (creator/assignee ADMIN)
 *      • Tenant attribution        → ADMIN.tenantId (→ Super Admin user)
 *      • Legacy (no adminId)       → Super Admin-wise totals ONLY when
 *        Project.approvedBy reliably identifies the tenant (a SUPER_ADMIN
 *        user owning that tenant). Never assigned to any Branch Admin —
 *        shown as "Unknown / Legacy".
 *
 *  All handlers are strictly read-only. No project mutation is possible
 *  through this controller.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Escape user-supplied search text for safe use inside RegExp. */
const escapeRegExp = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isObjectId = (value) =>
  typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value.trim());

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value).trim());

/** Base filter for "currently published" projects */
const PUBLISHED_MATCH = { approvalStatus: "APPROVED", isArchived: false };

/** Sort helper: published count desc, then name asc (deterministic). */
const sortByCountDesc = (rows) =>
  rows.sort((a, b) => {
    if (b.publishedCount !== a.publishedCount) return b.publishedCount - a.publishedCount;
    return (a.name || "").localeCompare(b.name || "");
  });

/** Parse and validate pagination query params. */
const parsePagination = (query = {}) => {
  const q = query || {};
  const page = Number(q.page);
  const limit = Number(q.limit);

  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const safeLimit =
    Number.isInteger(limit) && limit >= 1
      ? Math.min(limit, 50) // clamp oversized values instead of resetting
      : 10;

  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
};

/** Parse and validate the approvedAt (published date) range filter. */
const parseDateRange = (query = {}) => {
  const q = query || {};
  const from = q.from;
  const to = q.to;
  const filter = {};

  if (from) {
    const fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) {
      return { error: "Invalid 'from' date. Use the YYYY-MM-DD or ISO format." };
    }
    filter.approvedAt = { $gte: fromDate };
  }

  if (to) {
    const toDate = new Date(to);
    if (Number.isNaN(toDate.getTime())) {
      return { error: "Invalid 'to' date. Use the YYYY-MM-DD or ISO format." };
    }
    // Inclusive end-of-day for date-only 'to' values
    if (to.length === 10) {
      toDate.setUTCHours(23, 59, 59, 999);
    }
    filter.approvedAt = { ...(filter.approvedAt || {}), $lte: toDate };
  }

  // A reversed range can never match; reject it explicitly for clarity.
  if (from && to && new Date(from) > new Date(to)) {
    return { error: "'from' date cannot be after 'to' date." };
  }

  return { filter };
};

/**
 * @desc    Platform-wide published-project summary (supreme dashboard cards)
 * @route   GET /api/supreme-admin/published-projects/summary
 * @access  Private (Supreme Admin) — enforced on the router
 */
export const getPublishedProjectsSummary = async (req, res, next) => {
  try {
    const subscriberIds = await User.find({ role: "SUPER_ADMIN" })
      .select("_id")
      .lean();

    const subscriberIdList = subscriberIds.map((u) => u._id);

    const [totalPublishedProjects, totalBranchAdmins] = await Promise.all([
      Project.countDocuments(PUBLISHED_MATCH),
      User.countDocuments({
        role: "ADMIN",
        tenantId: { $in: subscriberIdList },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalPublishedProjects,
        totalSuperAdmins: subscriberIdList.length,
        totalBranchAdmins,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Super Admin-wise published project counts (all subscribers listed)
 * @route   GET /api/supreme-admin/published-projects/super-admins?search=
 * @access  Private (Supreme Admin) — enforced on the router
 */
export const getSuperAdminPublishedCounts = async (req, res, next) => {
  try {
    const { search: rawSearch = "" } = req.query || {};
    const search = typeof rawSearch === "string" ? rawSearch.trim() : "";

    // All Super Admin (subscriber) accounts — sanitized field projection only.
    const superAdmins = await User.find({ role: "SUPER_ADMIN" })
      .select("name email businessName")
      .lean();

    const superAdminIdSet = new Set(superAdmins.map((u) => String(u._id)));

    // Tenant admin membership: ONE grouped query — adminId → tenant map.
    const tenantGroups = await User.aggregate([
      {
        $match: {
          role: "ADMIN",
          tenantId: { $ne: null, $in: Array.from(superAdminIdSet).map(toObjectId) },
        },
      },
      { $group: { _id: "$tenantId", adminIds: { $addToSet: "$_id" } } },
    ]);

    const adminTenantMap = new Map(); // adminId -> tenantId (Super Admin id)
    for (const group of tenantGroups) {
      for (const adminId of group.adminIds) {
        adminTenantMap.set(String(adminId), String(group._id));
      }
    }

    /**
     * ONE aggregation over published projects grouped by (adminId, approvedBy).
     * Every project document contributes to exactly ONE group, so duplicate
     * counting is impossible — a project with matching adminId AND approvedBy
     * for the same tenant is counted once.
     */
    const projectGroups = await Project.aggregate([
      { $match: PUBLISHED_MATCH },
      { $group: { _id: { adminId: "$adminId", approvedBy: "$approvedBy" }, count: { $sum: 1 } } },
    ]);

    const tenantCounts = new Map(); // tenantId(SuperAdmin id) -> count
    for (const group of projectGroups) {
      const adminId = group._id?.adminId ? String(group._id.adminId) : null;
      const approvedBy = group._id?.approvedBy ? String(group._id.approvedBy) : null;

      if (adminId) {
        const tenantId = adminTenantMap.get(adminId);
        if (tenantId) {
          tenantCounts.set(tenantId, (tenantCounts.get(tenantId) || 0) + group.count);
        }
        // adminId without a resolvable tenant admin → NOT attributed anywhere.
      } else if (approvedBy && superAdminIdSet.has(approvedBy)) {
        // Legacy project with no creator — attributed to the tenant ONLY when
        // approvedBy reliably identifies a Super Admin (tenant owner).
        tenantCounts.set(approvedBy, (tenantCounts.get(approvedBy) || 0) + group.count);
      }
      // Neither field resolvable → unattributable; excluded from totals.
    }

    let rows = superAdmins.map((sa) => ({
      subscriberId: String(sa._id),
      name: sa.businessName || sa.name || "Super Admin",
      email: sa.email,
      publishedCount: tenantCounts.get(String(sa._id)) || 0,
    }));

    if (search) {
      const reg = new RegExp(escapeRegExp(search), "i");
      rows = rows.filter(
        (row) =>
          reg.test(row.name || "") ||
          reg.test(row.email || "")
      );
    }

    sortByCountDesc(rows);

    res.status(200).json({
      success: true,
      data: {
        superAdmins: rows,
        totalPublishedProjects: rows.reduce((sum, row) => sum + row.publishedCount, 0),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Branch Admin-wise published counts for ONE subscriber (tenant)
 * @route   GET /api/supreme-admin/published-projects/super-admins/:subscriberId
 * @access  Private (Supreme Admin) — enforced on the router
 */
export const getSuperAdminPublishedAdmins = async (req, res, next) => {
  try {
    const { subscriberId } = req.params;

    if (!isObjectId(subscriberId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Super Admin identifier.",
      });
    }

    // The route parameter is re-verified against the database — a tenant id
    // supplied by the frontend is never trusted.
    const subscriber = await User.findOne({
      _id: toObjectId(subscriberId),
      role: "SUPER_ADMIN",
    })
      .select("name email businessName")
      .lean();

    if (!subscriber) {
      return res.status(404).json({
        success: false,
        message: "Super Admin (subscriber) not found.",
      });
    }

    // Branch Admins strictly belonging to this tenant (no cross-tenant rows).
    const tenantAdmins = await User.find({
      role: "ADMIN",
      tenantId: subscriber._id,
    })
      .select("name email")
      .lean();

    const adminIdList = tenantAdmins.map((a) => a._id);

    // Per-admin published counts — single aggregation, no N+1.
    const adminCounts = adminIdList.length
      ? await Project.aggregate([
          {
            $match: {
              ...PUBLISHED_MATCH,
              adminId: { $in: adminIdList },
            },
          },
          { $group: { _id: "$adminId", count: { $sum: 1 } } },
        ])
      : [];

    const countByAdminId = new Map(
      adminCounts.map((c) => [String(c._id), c.count])
    );

    let rows = tenantAdmins.map((admin) => ({
      adminId: String(admin._id),
      name: admin.name || "Branch Admin",
      email: admin.email || "—",
      publishedCount: countByAdminId.get(String(admin._id)) || 0,
    }));

    // Legacy published projects in this tenant with NO creator on record.
    // Attributed via approvedBy only, and shown as "Unknown / Legacy" — they
    // are never assigned to an arbitrary Branch Admin.
    const legacyCount = await Project.countDocuments({
      ...PUBLISHED_MATCH,
      adminId: null,
      approvedBy: subscriber._id,
    });

    if (legacyCount > 0) {
      rows.push({
        adminId: null,
        name: "Unknown / Legacy",
        email: "—",
        publishedCount: legacyCount,
        isLegacy: true,
      });
    }

    sortByCountDesc(rows);

    res.status(200).json({
      success: true,
      data: {
        subscriber: {
          subscriberId: String(subscriber._id),
          name: subscriber.businessName || subscriber.name || "Super Admin",
          email: subscriber.email,
        },
        admins: rows,
        tenantPublishedTotal: rows.reduce((sum, row) => sum + row.publishedCount, 0),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Published projects created by ONE Branch Admin (paginated, filtered)
 * @route   GET /api/supreme-admin/published-projects/super-admins/:subscriberId/admins/:adminId/projects?page=&limit=&from=&to=&search=
 * @access  Private (Supreme Admin) — enforced on the router
 *
 * `:adminId` may be the literal value "legacy" to browse this tenant's
 * published projects with no creator on record (displayed "Unknown / Legacy").
 */
export const getSuperAdminPublishedProjectsAdminWise = async (req, res, next) => {
  try {
    const { subscriberId, adminId } = req.params;
    const { search: rawSearch = "" } = req.query || {};

    if (!isObjectId(subscriberId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Super Admin identifier.",
      });
    }

    // Tenant re-verification in the database (never trust the client).
    const subscriber = await User.findOne({
      _id: toObjectId(subscriberId),
      role: "SUPER_ADMIN",
    })
      .select("name email businessName")
      .lean();

    if (!subscriber) {
      return res.status(404).json({
        success: false,
        message: "Super Admin (subscriber) not found.",
      });
    }

    // Resolve the requested creator row.
    let creatorId = null;
    let creatorName = "Unknown / Legacy";

    if (adminId === "legacy") {
      // Only projects approved by THIS tenant's Super Admin with no creator —
      // tenant attribution via approvedBy is reliable; creator is not.
      creatorId = null;
      creatorName = "Unknown / Legacy";
    } else {
      if (!isObjectId(adminId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Branch Admin identifier.",
        });
      }

      // The admin must actually belong to this tenant in the database.
      const admin = await User.findOne({
        _id: toObjectId(adminId),
        role: "ADMIN",
        tenantId: subscriber._id,
      })
        .select("name")
        .lean();

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: "Branch Admin not found under this Super Admin's organization.",
        });
      }

      creatorId = admin._id;
      creatorName = admin.name || "Branch Admin";
    }

    // ── Filter validation ──
    const dateFilter = parseDateRange(req.query);
    if (dateFilter.error) {
      return res.status(400).json({ success: false, message: dateFilter.error });
    }

    const projectSearch = typeof rawSearch === "string" ? rawSearch.trim() : "";
    if (projectSearch.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Search text is too long (maximum 200 characters).",
      });
    }

    const { page, limit, skip } = parsePagination(req.query);

    const matchStage = {
      ...PUBLISHED_MATCH,
      ...(creatorId
        ? { adminId: toObjectId(adminId) }
        : { adminId: null, approvedBy: subscriber._id }),
      ...(Object.keys(dateFilter.filter).length ? dateFilter.filter : {}),
      ...(projectSearch
        ? { title: new RegExp(escapeRegExp(projectSearch), "i") }
        : {}),
    };

    // Single round-trip: counts and page items via $facet.
    const [result] = await Project.aggregate([
      { $match: matchStage },
      {
        $facet: {
          items: [
            { $sort: { approvedAt: -1, _id: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                customId: 1,
                title: 1,
                image: 1,
                location: 1,
                city: 1,
                adminId: 1,
                approvedAt: 1,
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const total = result?.total?.[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        subscriber: {
          subscriberId: String(subscriber._id),
          name: subscriber.businessName || subscriber.name || "Super Admin",
          email: subscriber.email,
        },
        creator: {
          adminId: creatorId ? String(creatorId) : null,
          name: creatorName,
          isLegacy: creatorId === null,
        },
        items: result?.items || [],
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (error) {
    next(error);
  }
};
