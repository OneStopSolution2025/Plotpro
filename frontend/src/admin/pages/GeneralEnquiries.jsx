import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FaSearch,
  FaPhone,
  FaEnvelope,
  FaWhatsapp,
  FaEllipsisH,
  FaEye,
  FaEdit,
  FaTimes,
  FaInbox,
  FaBuilding,
  FaUserTie,
  FaHistory,
  FaFilter,
  FaSyncAlt,
  FaCalendarAlt,
  FaClock,
  FaMapMarkerAlt,
  FaArrowRight,
  FaArrowLeft,
} from "react-icons/fa";

import "../styles/enquiries.css";
import { superAdminApi } from "../../services/api";
import ConfirmationModal from "../components/ConfirmationModal";

const cleanPhone = (phone) => (phone ? String(phone).replace(/[\s\-+]/g, "") : "");

const ENQUIRIES_PAGE_SIZE = 10;

const ENQUIRY_STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "FOLLOW_UP", label: "Follow Up" },
  { value: "CLOSED", label: "Closed" },
];

const SITE_VISIT_STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const getBranchSlug = (branch) => {
  if (!branch) return "";
  if (branch._id === "unassigned") return "direct";
  const raw = branch.city || branch.name || String(branch._id || "");
  return raw
    .toLowerCase()
    .replace(/branch/i, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
};

const formatActionLabel = (action) => {
  if (!action) return "Activity Logged";
  switch (action) {
    case "STATUS_CHANGE":
      return "Status Updated";
    case "FOLLOW_UP":
      return "Follow-up Set";
    case "TOUCHPOINT":
      return "Customer Reached";
    case "NOTE":
      return "Note Added";
    case "CALL":
      return "Phone Call";
    case "WHATSAPP":
      return "WhatsApp Sent";
    case "EMAIL":
      return "Email Sent";
    default:
      return action.replace(/_/g, " ");
  }
};

const GeneralEnquiries = () => {
  const { branchSlug } = useParams();
  const navigate = useNavigate();

  // Core Data
  const [branches, setBranches] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [siteVisits, setSiteVisits] = useState([]);

  // UI Navigation State
  const [activeTab, setActiveTab] = useState("enquiries"); // "enquiries" | "siteVisits"

  // Search & Filter State
  const [branchSearchTerm, setBranchSearchTerm] = useState("");
  const [itemSearchTerm, setItemSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Interaction & Modals
  const [selectedMenuId, setSelectedMenuId] = useState(null);
  const [viewDetailsEnquiry, setViewDetailsEnquiry] = useState(null);
  const [changeStatusEnquiry, setChangeStatusEnquiry] = useState(null);
  const [enquiryStatusNote, setEnquiryStatusNote] = useState("");
  const [changeStatusSiteVisit, setChangeStatusSiteVisit] = useState(null);
  const [siteVisitStatusNote, setSiteVisitStatusNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const [alertModal, setAlertModal] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState("");

  // Server-side pagination for the branch drill-down table
  const [page, setPage] = useState(1);
  const [pageEnquiries, setPageEnquiries] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);

  const isMountedRef = useRef(true);

  // Load all data
  const loadAllData = async (showLoadingSpinner = false) => {
    if (showLoadingSpinner) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [branchesRes, enquiriesRes, siteVisitsRes] = await Promise.allSettled([
        superAdminApi.getBranches(),
        superAdminApi.getAllEnquiries(),
        superAdminApi.getAllSiteVisits(),
      ]);

      if (!isMountedRef.current) return;

      if (branchesRes.status === "fulfilled" && branchesRes.value?.success && Array.isArray(branchesRes.value.data)) {
        setBranches(branchesRes.value.data);
      }

      if (enquiriesRes.status === "fulfilled" && enquiriesRes.value?.success && Array.isArray(enquiriesRes.value.data)) {
        setEnquiries(enquiriesRes.value.data);
      }

      if (siteVisitsRes.status === "fulfilled" && siteVisitsRes.value?.success && Array.isArray(siteVisitsRes.value.data)) {
        setSiteVisits(siteVisitsRes.value.data);
      }

      setLastSyncTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (err) {
      console.error("[GeneralEnquiries] Sync error:", err);
      if (showLoadingSpinner) setError(err.message || "Failed to load branch enquiries.");
    } finally {
      if (isMountedRef.current) {
        if (showLoadingSpinner) setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    loadAllData(true);

    // Auto-sync polling every 8 seconds for real-time live data
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadAllData(false);
      }
    }, 8000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest("[data-more-menu]")) {
        setSelectedMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setViewDetailsEnquiry(null);
        setChangeStatusEnquiry(null);
        setChangeStatusSiteVisit(null);
        setSelectedMenuId(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Helper: check if a record belongs to a specific branch ID
  const matchesBranch = (record, branchId) => {
    if (!record) return false;
    const rBranchId = record.branchId?._id || record.branchId?.id || record.branchId;
    const pBranchId = record.projectId?.branchId?._id || record.projectId?.branchId?.id || record.projectId?.branchId;
    const currentId = String(rBranchId || pBranchId || "");

    if (branchId === "unassigned") {
      return !currentId;
    }
    return currentId === String(branchId);
  };

  // Branch statistics mapping
  const branchCardsData = useMemo(() => {
    return branches.map((branch) => {
      const bEnquiries = enquiries.filter((e) => matchesBranch(e, branch._id));
      const bSiteVisits = siteVisits.filter((s) => matchesBranch(s, branch._id));

      const newEnquiries = bEnquiries.filter((e) => e.status === "NEW").length;
      const followUpEnquiries = bEnquiries.filter((e) => e.status === "FOLLOW_UP").length;
      const closedEnquiries = bEnquiries.filter((e) => e.status === "CLOSED").length;

      const scheduledVisits = bSiteVisits.filter((s) => s.status === "SCHEDULED").length;
      const confirmedVisits = bSiteVisits.filter((s) => s.status === "CONFIRMED").length;
      const completedVisits = bSiteVisits.filter((s) => s.status === "COMPLETED").length;

      return {
        ...branch,
        totalEnquiries: bEnquiries.length,
        newEnquiries,
        followUpEnquiries,
        closedEnquiries,
        totalSiteVisits: bSiteVisits.length,
        scheduledVisits,
        confirmedVisits,
        completedVisits,
      };
    });
  }, [branches, enquiries, siteVisits]);

  // Check for unassigned items
  const unassignedData = useMemo(() => {
    const uEnquiries = enquiries.filter((e) => matchesBranch(e, "unassigned"));
    const uSiteVisits = siteVisits.filter((s) => matchesBranch(s, "unassigned"));
    return {
      _id: "unassigned",
      name: "Direct / Website Enquiries",
      city: "Online / General Portal",
      state: "System",
      status: "ACTIVE",
      branchAdmin: null,
      assignedAdminId: null,
      totalEnquiries: uEnquiries.length,
      newEnquiries: uEnquiries.filter((e) => e.status === "NEW").length,
      followUpEnquiries: uEnquiries.filter((e) => e.status === "FOLLOW_UP").length,
      closedEnquiries: uEnquiries.filter((e) => e.status === "CLOSED").length,
      totalSiteVisits: uSiteVisits.length,
      scheduledVisits: uSiteVisits.filter((s) => s.status === "SCHEDULED").length,
      confirmedVisits: uSiteVisits.filter((s) => s.status === "CONFIRMED").length,
      completedVisits: uSiteVisits.filter((s) => s.status === "COMPLETED").length,
    };
  }, [enquiries, siteVisits]);

  // Filtered branches for grid view
  const filteredBranchCards = useMemo(() => {
    let list = [...branchCardsData];
    if (unassignedData.totalEnquiries > 0 || unassignedData.totalSiteVisits > 0) {
      list.push(unassignedData);
    }
    if (!branchSearchTerm.trim()) return list;

    const term = branchSearchTerm.toLowerCase().trim();
    return list.filter((b) => {
      const matchName = b.name?.toLowerCase().includes(term);
      const matchCity = b.city?.toLowerCase().includes(term);
      const admin = b.branchAdmin || b.assignedAdminId;
      const matchAdmin =
        admin?.name?.toLowerCase().includes(term) ||
        admin?.email?.toLowerCase().includes(term);
      return matchName || matchCity || matchAdmin;
    });
  }, [branchCardsData, unassignedData, branchSearchTerm]);

  // Selected branch derived directly from URL param (or null when on main grid)
  const activeBranch = useMemo(() => {
    if (!branchSlug) return null;
    const target = branchSlug.toLowerCase().trim();
    if (target === "direct" || target === "unassigned") return unassignedData;

    return (
      filteredBranchCards.find((b) => {
        const slug = getBranchSlug(b);
        const id = String(b._id || b.id || "").toLowerCase();
        const city = (b.city || "").toLowerCase().trim();
        const name = (b.name || "").toLowerCase().trim();
        return slug === target || id === target || city === target || name.includes(target);
      }) || null
    );
  }, [branchSlug, filteredBranchCards, unassignedData]);

  const selectedBranchId = activeBranch?._id || null;

  // Enquiries for selected branch
  const branchEnquiries = useMemo(() => {
    if (!selectedBranchId) return [];
    return enquiries.filter((e) => matchesBranch(e, selectedBranchId));
  }, [enquiries, selectedBranchId]);

  // Server-side paginated fetch for the selected branch's enquiries
  useEffect(() => {
    if (activeTab !== "enquiries" || !selectedBranchId) return undefined;

    let cancelled = false;

    const params = {
      page,
      limit: ENQUIRIES_PAGE_SIZE,
      branchId: selectedBranchId === "unassigned" ? "unassigned" : selectedBranchId,
    };
    if (itemSearchTerm.trim()) params.search = itemSearchTerm.trim();
    if (statusFilter !== "ALL") params.status = statusFilter;

    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setPageLoading(true);
        return superAdminApi.getAllEnquiries(params);
      })
      .then((res) => {
        if (cancelled || !res) return;
        setPageEnquiries(Array.isArray(res.data) ? res.data : []);
        setPagination(res.pagination || null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[GeneralEnquiries] Paginated fetch failed:", err);
        setPageEnquiries([]);
        setPagination(null);
      })
      .finally(() => {
        if (!cancelled) setPageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedBranchId, itemSearchTerm, statusFilter, page, lastSyncTime]);

  // Site visits for selected branch
  const branchSiteVisits = useMemo(() => {
    if (!selectedBranchId) return [];
    return siteVisits.filter((s) => matchesBranch(s, selectedBranchId));
  }, [siteVisits, selectedBranchId]);

  // Filtered site visits for selected branch
  const filteredBranchSiteVisits = useMemo(() => {
    return branchSiteVisits.filter((s) => {
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      if (itemSearchTerm.trim()) {
        const term = itemSearchTerm.toLowerCase().trim();
        const matchVisitor =
          s.visitorName?.toLowerCase().includes(term) ||
          s.visitorEmail?.toLowerCase().includes(term) ||
          s.visitorPhone?.toLowerCase().includes(term);
        const matchProject = s.projectId?.title?.toLowerCase().includes(term);
        const matchPlot = s.plotId?.plotNumber?.toLowerCase().includes(term);
        const matchNotes = s.notes?.toLowerCase().includes(term);
        return matchVisitor || matchProject || matchPlot || matchNotes;
      }
      return true;
    });
  }, [branchSiteVisits, statusFilter, itemSearchTerm]);

  // Global totals
  const totalGlobalEnquiries = enquiries.length;
  const totalGlobalSiteVisits = siteVisits.length;
  const totalFollowUps = enquiries.filter((e) => e.status === "FOLLOW_UP").length;
  const totalScheduledVisits = siteVisits.filter((s) => s.status === "SCHEDULED").length;

  // Contact Handlers
  const handleCall = (phone) => {
    if (!phone) {
      setAlertModal({
        title: "Contact Info Unavailable",
        message: "Phone number is not available for this record.",
        type: "warning",
      });
      return;
    }
    window.location.href = `tel:${cleanPhone(phone)}`;
  };

  const handleWhatsApp = (phone, name) => {
    if (!phone) {
      setAlertModal({
        title: "Contact Info Unavailable",
        message: "Phone number is not available for this record.",
        type: "warning",
      });
      return;
    }
    const message = `Hello ${name || "Customer"}, this is Plotpro management regarding your inquiry.`;
    window.open(
      `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleEmail = (email) => {
    if (!email) {
      setAlertModal({
        title: "Contact Info Unavailable",
        message: "Email address is not available for this record.",
        type: "warning",
      });
      return;
    }
    window.location.href = `mailto:${email}`;
  };

  // Status Change: Enquiry
  const confirmEnquiryStatusChange = async (id, newStatus) => {
    setSubmittingStatus(true);
    try {
      const res = await superAdminApi.updateEnquiryStatus(id, newStatus, enquiryStatusNote);
      if (res?.success && res.data) {
        setEnquiries((prev) =>
          prev.map((item) => (item._id === id ? { ...item, ...res.data } : item))
        );
      }
      setChangeStatusEnquiry(null);
      setEnquiryStatusNote("");
    } catch (err) {
      setAlertModal({
        title: "Status Update Failed",
        message: err.message || "Failed to update enquiry status",
        type: "danger",
      });
    } finally {
      setSubmittingStatus(false);
    }
  };

  // Status Change: Site Visit
  const confirmSiteVisitStatusChange = async (id, newStatus) => {
    setSubmittingStatus(true);
    try {
      const res = await superAdminApi.updateSiteVisitStatus(id, newStatus, siteVisitStatusNote);
      if (res?.success && res.data) {
        setSiteVisits((prev) =>
          prev.map((item) => (item._id === id ? { ...item, ...res.data } : item))
        );
      }
      setChangeStatusSiteVisit(null);
      setSiteVisitStatusNote("");
    } catch (err) {
      setAlertModal({
        title: "Status Update Failed",
        message: err.message || "Failed to update site visit status",
        type: "danger",
      });
    } finally {
      setSubmittingStatus(false);
    }
  };

  // Status Badge Rendering
  const getEnquiryStatusBadge = (status) => {
    switch (status) {
      case "NEW":
        return <span className="enquiry-badge new">New</span>;
      case "CONTACTED":
        return <span className="enquiry-badge contacted">Contacted</span>;
      case "FOLLOW_UP":
        return (
          <span
            className="enquiry-badge"
            style={{ backgroundColor: "#fffbeb", color: "#b45309", borderColor: "#fde68a" }}
          >
            Follow Up
          </span>
        );
      case "CLOSED":
        return <span className="enquiry-badge closed">Closed</span>;
      default:
        return <span className="enquiry-badge">{status}</span>;
    }
  };

  const getSiteVisitStatusBadge = (status) => {
    switch (status) {
      case "SCHEDULED":
        return (
          <span
            className="enquiry-badge"
            style={{ backgroundColor: "#ecfeff", color: "#0891b2", borderColor: "#a5f3fc" }}
          >
            Scheduled
          </span>
        );
      case "CONFIRMED":
        return (
          <span
            className="enquiry-badge"
            style={{ backgroundColor: "#eff6ff", color: "#2563eb", borderColor: "#bfdbfe" }}
          >
            Confirmed
          </span>
        );
      case "COMPLETED":
        return (
          <span
            className="enquiry-badge"
            style={{ backgroundColor: "#ecfdf5", color: "#059669", borderColor: "#a7f3d0" }}
          >
            Completed
          </span>
        );
      case "CANCELLED":
        return (
          <span
            className="enquiry-badge"
            style={{ backgroundColor: "#fef2f2", color: "#dc2626", borderColor: "#fecaca" }}
          >
            Cancelled
          </span>
        );
      default:
        return <span className="enquiry-badge">{status}</span>;
    }
  };

  return (
    <div className="enquiries-page">
      {/* =========================================================
          VIEW 1: SQUARE CARDS GRID (When no branchSlug in URL)
         ========================================================= */}
      {!branchSlug ? (
        <>
          {/* Header */}
          <div className="enquiries-header">
            <div>
              <span className="enquiries-kicker">REGIONAL MONITORING & OVERSIGHT</span>
              <h1>Branch Enquiries & Site Visits</h1>
              <p>
                Click any regional branch card below to inspect its live enquiries, customer requests,
                and scheduled site visits.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="live-sync-indicator" title="Auto-syncing every 8 seconds with branch admins">
                <span className="live-pulse-dot" />
                <span>Live Sync {lastSyncTime ? `• ${lastSyncTime}` : "Active"}</span>
              </div>
              <button
                className="enquiries-filter-btn"
                onClick={() => loadAllData(false)}
                disabled={refreshing}
                title="Refresh latest leads from branch admins"
              >
                <FaSyncAlt className={refreshing ? "fa-spin" : ""} />
                <span>{refreshing ? "Syncing..." : "Refresh"}</span>
              </button>
            </div>
          </div>

          {/* Global Summary Statistics */}
          <div className="enquiries-summary">
            <div className="enquiry-summary-card">
              <span>Total Active Branches</span>
              <strong>{branches.filter((b) => b.status === "ACTIVE").length}</strong>
              <small>{branches.length} registered regional branches</small>
            </div>
            <div className="enquiry-summary-card">
              <span>Total Enquiries</span>
              <strong>{totalGlobalEnquiries}</strong>
              <small style={{ color: "#2563eb", fontWeight: 700 }}>
                {enquiries.filter((e) => e.status === "NEW").length} New Leads across all branches
              </small>
            </div>
            <div className="enquiry-summary-card">
              <span>Follow Ups Pending</span>
              <strong style={{ color: "#b45309" }}>{totalFollowUps}</strong>
              <small>Action required by branch admins</small>
            </div>
            <div className="enquiry-summary-card">
              <span>Total Site Visits</span>
              <strong>{totalGlobalSiteVisits}</strong>
              <small style={{ color: "#0891b2", fontWeight: 700 }}>
                {totalScheduledVisits} Scheduled / Confirmed
              </small>
            </div>
          </div>

          {/* Search Bar for Branch Cards */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 16,
              marginTop: 12,
            }}
          >
            <div className="enquiries-search" style={{ width: "100%", maxWidth: 420 }}>
              <FaSearch />
              <input
                type="text"
                placeholder="Search branch by name, city, or admin..."
                value={branchSearchTerm}
                onChange={(e) => setBranchSearchTerm(e.target.value)}
              />
            </div>
            <div style={{ color: "#64748b", fontSize: 13, fontWeight: 600 }}>
              Showing {filteredBranchCards.length} {filteredBranchCards.length === 1 ? "branch" : "branches"}
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              style={{
                padding: "16px 20px",
                marginBottom: 24,
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 14,
                color: "#991b1b",
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          {/* Square Cards Grid */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "#64748b" }}>
              <FaSyncAlt className="fa-spin" style={{ fontSize: 32, marginBottom: 12, color: "#a63d2f" }} />
              <p style={{ margin: 0, fontWeight: 600 }}>Loading regional branch cards...</p>
            </div>
          ) : filteredBranchCards.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "70px 20px",
                background: "#ffffff",
                borderRadius: 20,
                border: "1px dashed #cbd5e1",
              }}
            >
              <FaBuilding style={{ fontSize: 44, color: "#94a3b8", marginBottom: 14 }} />
              <h3 style={{ margin: "0 0 6px 0", color: "#1e293b", fontSize: 18 }}>No Branches Found</h3>
              <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
                {branchSearchTerm
                  ? "No branches match your search criteria. Try a different query."
                  : "No branches have been registered yet under your company account."}
              </p>
            </div>
          ) : (
            <div className="branch-cards-grid">
              {filteredBranchCards.map((b) => {
                const isActive = b.status === "ACTIVE";
                const admin = b.branchAdmin || b.assignedAdminId;
                const adminName = admin?.name || "No Admin Assigned";
                const slug = getBranchSlug(b);

                return (
                  <div
                    key={b._id}
                    className="branch-v2-card"
                    onClick={() => {
                      navigate(`/super-admin/general-enquiries/${slug}`);
                      setActiveTab("enquiries");
                      setStatusFilter("ALL");
                      setItemSearchTerm("");
                      setPage(1);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <span className={`v2-badge-pill ${isActive ? "active" : "inactive"}`}>
                          {isActive ? "Active Branch" : "Inactive"}
                        </span>
                        <div className="v2-meta-badge">
                          <FaMapMarkerAlt style={{ color: "#a63d2f" }} />
                          <span>{b.city || "Tamil Nadu"}</span>
                        </div>
                      </div>

                      <h3 style={{ fontSize: 20, fontWeight: 700, color: "#17240f", marginBottom: 6 }}>{b.name}</h3>
                      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>
                        Managed by <strong style={{ color: "#1e293b" }}>{adminName}</strong>
                      </p>

                      <div className="v2-kpi-pill">
                        <span style={{ fontSize: 13, color: "#475569", display: "flex", alignItems: "center", gap: 7, fontWeight: 500 }}>
                          <FaInbox style={{ color: "#2563eb" }} /> Total Enquiries
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#17240f" }}>{b.totalEnquiries}</span>
                      </div>

                      <div className="v2-kpi-pill">
                        <span style={{ fontSize: 13, color: "#475569", display: "flex", alignItems: "center", gap: 7, fontWeight: 500 }}>
                          <FaCalendarAlt style={{ color: "#0891b2" }} /> Total Visits
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#17240f" }}>{b.totalSiteVisits}</span>
                      </div>
                    </div>

                    <div className="v2-btn-action">
                      <span>Explore Branch</span>
                      <FaArrowRight style={{ fontSize: 11 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* =========================================================
           VIEW 2: BRANCH DRILL-DOWN (Selected Branch from URL)
           ========================================================= */
        <div>
          {/* Branch Top Navigation Bar */}
          <div className="branch-detail-header">
            <div className="branch-detail-left">
              <button
                className="back-to-branches-btn"
                onClick={() => {
                  navigate("/super-admin/general-enquiries");
                  setStatusFilter("ALL");
                  setItemSearchTerm("");
                  setPage(1);
                }}
              >
                <FaArrowLeft /> Back to All Branches
              </button>

              <div className="branch-detail-title-group">
                <h2>{activeBranch?.name || "Branch Leads"}</h2>
                <div className="branch-detail-sub">
                  {activeBranch?.city && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <FaMapMarkerAlt style={{ color: "#a63d2f" }} />
                      {activeBranch.city}
                      {activeBranch.state ? `, ${activeBranch.state}` : ""}
                    </span>
                  )}
                  {(activeBranch?.branchAdmin?.name || activeBranch?.assignedAdminId?.name) && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <FaUserTie style={{ color: "#2563eb" }} />
                      Admin: <strong>{activeBranch.branchAdmin?.name || activeBranch.assignedAdminId?.name}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Tabs Switcher & Refresh */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="branch-tabs-container">
                <button
                  className={`branch-tab-btn ${activeTab === "enquiries" ? "active" : ""}`}
                  onClick={() => {
                    setActiveTab("enquiries");
                    setStatusFilter("ALL");
                    setPage(1);
                  }}
                >
                  <FaInbox />
                  <span>Enquiries</span>
                  <span className="tab-badge">{branchEnquiries.length}</span>
                </button>
                <button
                  className={`branch-tab-btn ${activeTab === "siteVisits" ? "active" : ""}`}
                  onClick={() => {
                    setActiveTab("siteVisits");
                    setStatusFilter("ALL");
                    setPage(1);
                  }}
                >
                  <FaCalendarAlt />
                  <span>Site Visits</span>
                  <span className="tab-badge">{branchSiteVisits.length}</span>
                </button>
              </div>

              <div className="live-sync-indicator" title="Auto-syncing every 8 seconds with branch admins">
                <span className="live-pulse-dot" />
                <span>Live</span>
              </div>

              <button
                className="enquiries-filter-btn"
                onClick={() => loadAllData(false)}
                disabled={refreshing}
                title="Sync now"
              >
                <FaSyncAlt className={refreshing ? "fa-spin" : ""} />
              </button>
            </div>
          </div>

          {/* =========================================================
              TAB 1: ENQUIRIES FOR THIS BRANCH
             ========================================================= */}
          {activeTab === "enquiries" && (
            <div>
              {/* Branch Enquiry Sub-summary */}
              <div className="enquiries-summary">
                <div className="enquiry-summary-card">
                  <span>Branch Enquiries</span>
                  <strong>{branchEnquiries.length}</strong>
                  <small>Total customer leads for this branch</small>
                </div>
                <div className="enquiry-summary-card">
                  <span>New Leads</span>
                  <strong style={{ color: "#2563eb" }}>
                    {branchEnquiries.filter((e) => e.status === "NEW").length}
                  </strong>
                  <small>Pending initial contact</small>
                </div>
                <div className="enquiry-summary-card">
                  <span>Follow Ups</span>
                  <strong style={{ color: "#b45309" }}>
                    {branchEnquiries.filter((e) => e.status === "FOLLOW_UP").length}
                  </strong>
                  <small>Scheduled customer touchpoints</small>
                </div>
                <div className="enquiry-summary-card">
                  <span>Closed</span>
                  <strong style={{ color: "#059669" }}>
                    {branchEnquiries.filter((e) => e.status === "CLOSED").length}
                  </strong>
                  <small>Successfully converted or completed</small>
                </div>
              </div>

              {/* Main Card with Toolbar & Table */}
              <div className="enq-v1-card">
                <div className="v1-toolbar">
                  <div className="enquiries-search-input-wrap" style={{ flex: 1, maxWidth: 420 }}>
                    <FaSearch />
                    <input
                      type="text"
                      placeholder="Filter leads..."
                      value={itemSearchTerm}
                      onChange={(e) => {
                        setItemSearchTerm(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div className="enquiries-filter-select-box">
                    <FaFilter />
                    <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                      {ENQUIRY_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <table className="v1-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Project & Plot</th>
                      <th>Date</th>
                      <th>Status</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageEnquiries.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{ textAlign: "center", padding: "40px 16px", color: "#64748b" }}
                        >
                          {pageLoading
                            ? "Loading enquiries..."
                            : "No enquiries match your search or status filter."}
                        </td>
                      </tr>
                    )}
                    {pageEnquiries.map((e) => (
                      <tr key={e._id}>
                        <td>
                          <strong style={{ color: "#17240f", fontSize: 14 }}>{e.fullName || "—"}</strong>
                          <div style={{ fontSize: 12, color: "#64748b" }}>{e.mobile} • {e.email}</div>
                        </td>
                        <td>
                          <div>{e.projectId?.title || "Website"}</div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#a63d2f" }}>Plot #{e.plot || "General"}</span>
                        </td>
                        <td style={{ color: "#64748b" }}>
                          {new Date(e.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td>{getEnquiryStatusBadge(e.status)}</td>
                      
                        <td style={{ textAlign: "right" }}>
                          <div className="action-buttons-cell" style={{ justifyContent: "flex-end" }}>
                            <button className="enquiry-action-btn call-btn" onClick={() => handleCall(e.mobile)} title="Call">
                              <FaPhone />
                            </button>
                            <button className="enquiry-action-btn whatsapp-btn" onClick={() => handleWhatsApp(e.mobile, e.fullName)} title="WhatsApp">
                              <FaWhatsapp />
                            </button>
                            <button className="enquiry-action-btn email-btn" onClick={() => handleEmail(e.email)} title="Email">
                              <FaEnvelope />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {pagination && pagination.total > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "14px 20px",
                      borderTop: "1px solid #e2e8f0",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <span style={{ fontSize: 13, color: "#64748b" }}>
                      Showing {pageEnquiries.length} of {pagination.total} enquiries
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        className="enquiries-filter-btn"
                        disabled={page <= 1 || pageLoading}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                      >
                        Previous
                      </button>
                      <span style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>
                        Page {pagination.page} of {pagination.totalPages || 1}
                      </span>
                      <button
                        className="enquiries-filter-btn"
                        disabled={!pagination.hasNextPage || pageLoading}
                        onClick={() => setPage((current) => current + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =========================================================
              TAB 2: SITE VISITS FOR THIS BRANCH
             ========================================================= */}
          {activeTab === "siteVisits" && (
            <div>
              {/* Branch Site Visit Sub-summary */}
              <div className="enquiries-summary">
                <div className="enquiry-summary-card">
                  <span>Branch Site Visits</span>
                  <strong>{branchSiteVisits.length}</strong>
                  <small>Total scheduled plot inspections</small>
                </div>
                <div className="enquiry-summary-card">
                  <span>Scheduled</span>
                  <strong style={{ color: "#0891b2" }}>
                    {branchSiteVisits.filter((s) => s.status === "SCHEDULED").length}
                  </strong>
                  <small>Awaiting branch confirmation</small>
                </div>
                <div className="enquiry-summary-card">
                  <span>Confirmed</span>
                  <strong style={{ color: "#2563eb" }}>
                    {branchSiteVisits.filter((s) => s.status === "CONFIRMED").length}
                  </strong>
                  <small>Visit confirmed by branch admin</small>
                </div>
                <div className="enquiry-summary-card">
                  <span>Completed</span>
                  <strong style={{ color: "#059669" }}>
                    {branchSiteVisits.filter((s) => s.status === "COMPLETED").length}
                  </strong>
                  <small>Site visits carried out</small>
                </div>
              </div>

              {/* Main Card with Toolbar & Table */}
              <div className="enquiries-card">
                <div className="enquiries-toolbar-flex">
                  <div className="enquiries-search-input-wrap">
                    <FaSearch />
                    <input
                      type="text"
                      placeholder="Search visitor name, phone, project, plot..."
                      value={itemSearchTerm}
                      onChange={(e) => setItemSearchTerm(e.target.value)}
                    />
                  </div>

                  <div className="enquiries-filter-select-box">
                    <FaFilter />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      {SITE_VISIT_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {filteredBranchSiteVisits.length === 0 ? (
                  <div className="enquiries-empty-state">
                    <div className="enquiries-empty-icon-wrap">
                      <FaCalendarAlt />
                    </div>
                    <h3>No Site Visits Found</h3>
                    <p>
                      {itemSearchTerm || statusFilter !== "ALL"
                        ? "No site visits match your search or status filter."
                        : `No site visits have been requested for ${activeBranch?.name || "this branch"} yet.`}
                    </p>
                  </div>
                ) : (
                  <div className="enquiries-table-container">
                    <table className="branch-data-table">
                      <thead>
                        <tr>
                          <th className="col-customer">Visitor</th>
                          <th className="col-project">Project & Plot</th>
                          <th className="col-date">Preferred Date & Slot</th>
                          <th className="col-status">Status</th>
                          <th className="col-activity">Notes</th>
                          <th className="col-actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBranchSiteVisits.map((visit) => {
                          const dateStr = visit.preferredDate
                            ? new Date(visit.preferredDate).toLocaleDateString("en-IN", {
                                weekday: "short",
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—";

                          return (
                            <tr key={visit._id}>
                              {/* Visitor info — Left Aligned */}
                              <td className="col-customer">
                                <div className="customer-cell">
                                  <span className="customer-name">{visit.visitorName || "Unnamed Visitor"}</span>
                                  <div className="customer-meta-row">
                                    <span>{visit.visitorPhone || "No phone"}</span>
                                    {visit.visitorEmail && (
                                      <>
                                        <span className="customer-dot">•</span>
                                        <span>{visit.visitorEmail}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Project & Plot — Left Aligned */}
                              <td className="col-project">
                                <div className="project-cell">
                                  <span className="project-title">{visit.projectId?.title || "Project"}</span>
                                  {visit.plotId?.plotNumber && (
                                    <span className="plot-pill">
                                      Plot: <strong>{visit.plotId.plotNumber}</strong>
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Preferred Date & Time */}
                              <td className="col-date">
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                                    {dateStr}
                                  </span>
                                  {visit.preferredTimeSlot && (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        color: "#0891b2",
                                        fontWeight: 600,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 4,
                                      }}
                                    >
                                      <FaClock style={{ fontSize: 10 }} /> {visit.preferredTimeSlot}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Status */}
                              <td className="col-status">{getSiteVisitStatusBadge(visit.status)}</td>

                              {/* Notes */}
                              <td className="col-activity">
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "#475569",
                                    maxWidth: 220,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                  title={visit.notes || "No notes"}
                                >
                                  {visit.notes || <span style={{ color: "#94a3b8" }}>No remarks</span>}
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="col-actions">
                                <div className="action-buttons-cell">
                                  <button
                                    className="enquiry-action-btn call-btn"
                                    title="Call Visitor"
                                    onClick={() => handleCall(visit.visitorPhone)}
                                  >
                                    <FaPhone />
                                  </button>
                                  <button
                                    className="enquiry-action-btn whatsapp-btn"
                                    title="WhatsApp Visitor"
                                    onClick={() => handleWhatsApp(visit.visitorPhone, visit.visitorName)}
                                  >
                                    <FaWhatsapp />
                                  </button>
                                  <button
                                    className="enquiry-action-btn email-btn"
                                    title="Email Visitor"
                                    onClick={() => handleEmail(visit.visitorEmail)}
                                  >
                                    <FaEnvelope />
                                  </button>
                                  <button
                                    className="enquiry-action-btn edit-btn"
                                    title="Change Visit Status"
                                    onClick={() => {
                                      setChangeStatusSiteVisit(visit);
                                      setSiteVisitStatusNote("");
                                    }}
                                  >
                                    <FaEdit />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          MODAL 1: VIEW DETAILS & ACTIVITY TIMELINE (Enquiry)
         ========================================================= */}
      {viewDetailsEnquiry && (
        <div className="enquiry-modal-overlay" onClick={() => setViewDetailsEnquiry(null)}>
          <div
            className="enquiry-modal"
            style={{ maxWidth: 650 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="enquiry-modal-header">
              <h2>Customer Enquiry & Activity Timeline</h2>
              <button
                className="enquiry-modal-close"
                onClick={() => setViewDetailsEnquiry(null)}
              >
                <FaTimes />
              </button>
            </div>

            <div className="modal-body-v1">
              <div className="v1-customer-header">
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div className="v1-avatar-circle">
                    {(viewDetailsEnquiry.fullName || "C")[0].toUpperCase()}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#17240f" }}>
                      {viewDetailsEnquiry.fullName || "Unnamed Customer"}
                    </h4>
                    <div style={{ fontSize: 13, color: "#64748b", display: "flex", gap: 12, marginTop: 3 }}>
                      <span>📞 {viewDetailsEnquiry.mobile || "—"}</span>
                      <span>✉️ {viewDetailsEnquiry.email || "—"}</span>
                    </div>
                  </div>
                </div>
                <div>{getEnquiryStatusBadge(viewDetailsEnquiry.status)}</div>
              </div>

              <div className="v1-field-grid">
                <div className="v1-field-item">
                  <div className="v1-field-label">Project Interested</div>
                  <div className="v1-field-val" style={{ color: "#17240f" }}>
                    {viewDetailsEnquiry.projectId?.title || "Direct Website Enquiry"}
                  </div>
                </div>
                <div className="v1-field-item">
                  <div className="v1-field-label">Plot Selection</div>
                  <div className="v1-field-val" style={{ color: "#a63d2f" }}>
                    Plot #{viewDetailsEnquiry.plot || "General"}
                  </div>
                </div>
                <div className="v1-field-item">
                  <div className="v1-field-label">Branch Attribution</div>
                  <div className="v1-field-val" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <FaBuilding style={{ color: "#a63d2f" }} />
                    {viewDetailsEnquiry.branchId?.name || "Direct / Unassigned"}
                  </div>
                </div>
                <div className="v1-field-item">
                  <div className="v1-field-label">Assigned Branch Admin</div>
                  <div className="v1-field-val" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <FaUserTie style={{ color: "#2563eb" }} />
                    {viewDetailsEnquiry.assignedAdminId?.name || "Pending Assignment"}
                  </div>
                </div>
              </div>

              {viewDetailsEnquiry.message && (
                <div className="v1-msg-box">
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#17240f", marginBottom: 6, textTransform: "uppercase" }}>
                    Customer Note / Message
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: "#334155", lineHeight: 1.5 }}>
                    "{viewDetailsEnquiry.message}"
                  </p>
                </div>
              )}

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #edf2f7" }}>
                <h5 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <FaHistory style={{ color: "#a63d2f" }} /> Activity & Follow-up Timeline
                </h5>
                {Array.isArray(viewDetailsEnquiry.activityLog) && viewDetailsEnquiry.activityLog.length > 0 ? (
                  <div style={{ paddingLeft: 16, borderLeft: "2px solid #e2e8f0" }}>
                    {viewDetailsEnquiry.activityLog.map((act, i) => (
                      <div key={i} style={{ marginBottom: 12, position: "relative" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{act.action}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>
                          By {act.performedByName || "Admin"} • {new Date(act.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>No prior activity</p>
                )}
              </div>
            </div>

            <div className="enquiry-modal-actions">
              <button
                className="enquiry-btn-secondary"
                onClick={() => setViewDetailsEnquiry(null)}
              >
                Close
              </button>
              <button
                className="enquiry-btn-primary"
                onClick={() => {
                  setChangeStatusEnquiry(viewDetailsEnquiry);
                  setViewDetailsEnquiry(null);
                  setEnquiryStatusNote("");
                }}
              >
                Change Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: CHANGE STATUS (Enquiry)
         ========================================================= */}
      {changeStatusEnquiry && (
        <div className="enquiry-modal-overlay" onClick={() => setChangeStatusEnquiry(null)}>
          <div className="enquiry-modal" onClick={(e) => e.stopPropagation()}>
            <div className="enquiry-modal-header">
              <h2>Change Enquiry Status</h2>
              <button
                className="enquiry-modal-close"
                onClick={() => setChangeStatusEnquiry(null)}
              >
                <FaTimes />
              </button>
            </div>

            <div className="enquiry-modal-body">
              <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: 14 }}>
                Update status for <strong>{changeStatusEnquiry.fullName || "Customer"}</strong>.
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
                  Super Admin Note (Optional)
                </label>
                <textarea
                  style={{
                    width: "100%",
                    minHeight: 70,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                    fontSize: 13,
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                  placeholder="e.g., Reviewed with Branch Admin, customer requested callback on Saturday"
                  value={enquiryStatusNote}
                  onChange={(e) => setEnquiryStatusNote(e.target.value)}
                />
              </div>

              <div className="status-options-grid">
                {[
                  { value: "NEW", label: "New", desc: "Awaiting initial contact" },
                  { value: "CONTACTED", label: "Contacted", desc: "Customer has been reached" },
                  { value: "FOLLOW_UP", label: "Follow Up", desc: "Follow-up discussion pending" },
                  { value: "CLOSED", label: "Closed", desc: "Deal closed or inquiry resolved" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    className={`status-option-card ${changeStatusEnquiry.status === opt.value ? "selected" : ""}`}
                    onClick={() => confirmEnquiryStatusChange(changeStatusEnquiry._id, opt.value)}
                    disabled={submittingStatus}
                  >
                    <strong>{opt.label}</strong>
                    <small>{opt.desc}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="enquiry-modal-actions">
              <button
                className="enquiry-btn-secondary"
                onClick={() => setChangeStatusEnquiry(null)}
                disabled={submittingStatus}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: CHANGE STATUS (Site Visit)
         ========================================================= */}
      {changeStatusSiteVisit && (
        <div className="enquiry-modal-overlay" onClick={() => setChangeStatusSiteVisit(null)}>
          <div className="enquiry-modal" onClick={(e) => e.stopPropagation()}>
            <div className="enquiry-modal-header">
              <h2>Change Site Visit Status</h2>
              <button
                className="enquiry-modal-close"
                onClick={() => setChangeStatusSiteVisit(null)}
              >
                <FaTimes />
              </button>
            </div>

            <div className="enquiry-modal-body">
              <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: 14 }}>
                Update inspection status for visitor <strong>{changeStatusSiteVisit.visitorName || "Customer"}</strong>.
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
                  Update Remarks (Optional)
                </label>
                <textarea
                  style={{
                    width: "100%",
                    minHeight: 70,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                    fontSize: 13,
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                  placeholder="e.g., Driver confirmed, scheduled visit for 11:30 AM"
                  value={siteVisitStatusNote}
                  onChange={(e) => setSiteVisitStatusNote(e.target.value)}
                />
              </div>

              <div className="status-options-grid">
                {[
                  { value: "SCHEDULED", label: "Scheduled", desc: "Awaiting confirmation" },
                  { value: "CONFIRMED", label: "Confirmed", desc: "Customer & branch confirmed visit" },
                  { value: "COMPLETED", label: "Completed", desc: "Site visit completed successfully" },
                  { value: "CANCELLED", label: "Cancelled", desc: "Visit rescheduled or cancelled" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    className={`status-option-card ${changeStatusSiteVisit.status === opt.value ? "selected" : ""}`}
                    onClick={() => confirmSiteVisitStatusChange(changeStatusSiteVisit._id, opt.value)}
                    disabled={submittingStatus}
                  >
                    <strong>{opt.label}</strong>
                    <small>{opt.desc}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="enquiry-modal-actions">
              <button
                className="enquiry-btn-secondary"
                onClick={() => setChangeStatusSiteVisit(null)}
                disabled={submittingStatus}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation / Alert Modal */}
      {alertModal && (
        <ConfirmationModal
          isOpen={!!alertModal}
          onClose={() => setAlertModal(null)}
          onConfirm={() => setAlertModal(null)}
          title={alertModal.title}
          message={alertModal.message}
          confirmText="OK"
          showCancel={false}
          type={alertModal.type || "warning"}
        />
      )}
    </div>
  );
};

export default GeneralEnquiries;
