import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../context/ToastContext";
import { useAdmins } from "../context/AdminContext";
import { superAdminApi } from "../../services/api";
import ConfirmationModal from "../components/ConfirmationModal";
import CustomDropdown from "../components/CustomDropdown";
import PhoneInputField from "../../components/PhoneInputField";
import { formatFullPhone } from "../../utils/phoneUtils";
import { TAMIL_NADU_DISTRICTS } from "../data/tamilNaduDistricts";
import {
  FaBuilding,
  FaMapMarkerAlt,
  FaUserTie,
  FaLayerGroup,
  FaArrowRight,
  FaEdit,
  FaEye,
  FaEnvelope,
  FaExclamationTriangle,
  FaCheckCircle,
  FaPaperPlane,
} from "react-icons/fa";
import "../styles/super-admin.css";

const initials = (name = "") =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const EMPTY_BRANCH_FORM = {
  district: "",
  address: "",
  notes: "",
};

const EMPTY_ADMIN_FORM = {
  adminName: "",
  adminEmail: "",
  adminMobile: "",
  adminPassword: "",
};

const BranchManagement = () => {
  const { showToast } = useToast();
  const { subscriptionInfo: contextSubscription, fetchSubscriptionInfo } = useAdmins();

  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subscriptionInfo, setSubscriptionInfo] = useState(contextSubscription || null);
  const [isSubLoading, setIsSubLoading] = useState(!contextSubscription);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH_FORM);
  const [adminPhoneCountryCode, setAdminPhoneCountryCode] = useState("+91");
  const [adminForm, setAdminForm] = useState(EMPTY_ADMIN_FORM);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [detailBranch, setDetailBranch] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [confirmStatusBranch, setConfirmStatusBranch] = useState(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [confirmDeleteBranch, setConfirmDeleteBranch] = useState(null);
  const [isDeletingBranch, setIsDeletingBranch] = useState(false);

  // Sync whenever contextSubscription updates
  useEffect(() => {
    if (contextSubscription) {
      setSubscriptionInfo(contextSubscription);
      setIsSubLoading(false);
    }
  }, [contextSubscription]);

  const seatInfo = useMemo(() => {
    const sub = subscriptionInfo || contextSubscription;
    if (!sub) {
      // If subscription is still loading, look at currently loaded branches as quick protection
      const activeBranchCount = branches.filter((b) => b.status === "ACTIVE" || b.status === "Active").length;
      return {
        isUnlimited: false,
        text: `${activeBranchCount} active`,
        remaining: activeBranchCount >= 3 ? 0 : Math.max(0, 3 - activeBranchCount),
      };
    }

    const { assignedSeats, usedSeats, remainingSeats, lifetimeAssignedSeats } = sub;
    const isUnlimited = assignedSeats >= 999999;
    const effectiveUsed = Math.max(usedSeats || 0, lifetimeAssignedSeats || 0);
    const calculatedRemaining = Math.max(0, assignedSeats - effectiveUsed);
    const remaining = isUnlimited
      ? Infinity
      : typeof remainingSeats === "number"
      ? remainingSeats
      : calculatedRemaining;

    return {
      isUnlimited,
      text: isUnlimited
        ? `${usedSeats} active (Unlimited)`
        : `${usedSeats} / ${assignedSeats}`,
      remaining,
    };
  }, [subscriptionInfo, contextSubscription, branches]);

  const loadBranches = async () => {
    setIsLoading(true);
    try {
      const res = await superAdminApi.getBranches();
      if (res?.success) {
        setBranches(res.data || []);
      } else {
        showToast(res?.message || "Failed to load branches.", "error");
      }
    } catch (err) {
      showToast(err.message || "Failed to load branches.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const loadSubscriptionInfo = async () => {
    try {
      setIsSubLoading(true);
      const res = await superAdminApi.getSubscriptionInfo();
      if (res?.success) {
        setSubscriptionInfo(res.data);
      }
    } catch {
      /* non-fatal — seat chip is informational */
    } finally {
      setIsSubLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
    loadSubscriptionInfo();
    if (fetchSubscriptionInfo) fetchSubscriptionInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateModal = () => {
    if (seatInfo && !seatInfo.isUnlimited && seatInfo.remaining <= 0) {
      showToast(
        `Branch Admin seat limit reached (${subscriptionInfo?.assignedSeats} max). You have reached your Branch Admin seat limit. Contact Supreme Admin to request additional seats.`,
        "error"
      );
      return;
    }
    setEditingBranch(null);
    setBranchForm(EMPTY_BRANCH_FORM);
    setAdminForm(EMPTY_ADMIN_FORM);
    setFormError("");
    setCreateOpen(true);
  };

  const openEditModal = (branch) => {
    setEditingBranch(branch);
    // Prefill the district when the stored city (or legacy name) matches one;
    // legacy locality branches start unselected and must pick a district.
    const knownDistrict = TAMIL_NADU_DISTRICTS.find(
      (d) =>
        d === branch.city ||
        d === branch.name ||
        `${d} Branch` === branch.name
    );
    setBranchForm({
      district: knownDistrict || "",
      address: branch.address || "",
      notes: branch.notes || "",
    });
    setAdminForm(EMPTY_ADMIN_FORM);
    setFormError("");
    setCreateOpen(true);
  };

  const closeCreateModal = () => {
    setCreateOpen(false);
    setEditingBranch(null);
    setFormError("");
  };

  const openDetail = async (branch) => {
    setDetailBranch(branch);
    setDetailData(null);
    setIsLoadingDetail(true);
    try {
      const res = await superAdminApi.getBranchDetail(branch.id);
      if (res?.success) {
        setDetailData(res.data);
      } else {
        showToast(res?.message || "Failed to load branch details.", "error");
      }
    } catch (err) {
      showToast(err.message || "Failed to load branch details.", "error");
      closeDetail();
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeDetail = () => {
    setDetailBranch(null);
    setDetailData(null);
  };

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();

    if (!branchForm.district.trim()) {
      setFormError("Please select a district for the branch.");
      return;
    }

    if (!editingBranch) {
      if (!adminForm.adminName.trim() || !adminForm.adminEmail.trim()) {
        setFormError("Branch Admin name and email are required.");
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(adminForm.adminEmail.trim())) {
        setFormError("Branch Admin email must be a valid email address.");
        return;
      }
    }

    setIsSaving(true);
    try {
      let res;
      const district = branchForm.district.trim();
      const branchName = `${district} Branch`;
      if (editingBranch) {
        res = await superAdminApi.updateBranch(editingBranch.id, {
          name: editingBranch.name,
          city: editingBranch.city,
          region: branchForm.region,
          address: branchForm.address,
          notes: branchForm.notes,
        });
      } else {
        const formattedMobile = adminForm.adminMobile.trim()
          ? formatFullPhone(adminPhoneCountryCode, adminForm.adminMobile.trim())
          : "";
        res = await superAdminApi.createBranch({
          name: branchName,
          city: district,
          region: branchForm.region,
          address: branchForm.address,
          notes: branchForm.notes,
          ...adminForm,
          adminMobile: formattedMobile,
        });
      }

      if (res?.success) {
        showToast(
          editingBranch ? "Branch updated successfully." : res.message || "Branch created successfully.",
          "success"
        );
        closeCreateModal();
        loadBranches();
        loadSubscriptionInfo();
      } else {
        setFormError(res?.message || "Failed to save branch.");
      }
    } catch (err) {
      setFormError(err.message || "Failed to save branch. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!confirmStatusBranch) return;
    setIsTogglingStatus(true);
    try {
      const targetStatus =
        confirmStatusBranch.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      const res = await superAdminApi.toggleBranchStatus(
        confirmStatusBranch.id,
        targetStatus
      );
      if (res?.success) {
        showToast(
          res.message ||
            `Branch ${targetStatus === "ACTIVE" ? "reactivated" : "deactivated"} successfully.`,
          "success"
        );
        loadBranches();
        loadSubscriptionInfo();
      } else {
        showToast(res?.message || "Failed to update branch status.", "error");
      }
      setConfirmStatusBranch(null);
    } catch (err) {
      showToast(err.message || "Failed to update branch status.", "error");
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleDeleteBranch = async () => {
    if (!confirmDeleteBranch) return;
    setIsDeletingBranch(true);
    try {
      const res = await superAdminApi.deleteBranch(confirmDeleteBranch.id);
      if (res?.success) {
        showToast(
          res.message || `Branch "${confirmDeleteBranch.name}" deleted successfully.`,
          "success"
        );
        loadBranches();
        loadSubscriptionInfo();
      } else {
        showToast(res?.message || "Failed to delete branch.", "error");
      }
      setConfirmDeleteBranch(null);
    } catch (err) {
      showToast(err.message || "Failed to delete branch.", "error");
    } finally {
      setIsDeletingBranch(false);
    }
  };

  return (
    <div className="dashboard-page sa-page">
      <div className="sa-page-header">
        <div>
          <span className="dashboard-kicker">BRANCH MANAGEMENT</span>
          <h1 className="sa-page-title">Branches</h1>
          <p className="sa-page-subtitle">
            Create regional branches, provision their Branch Admin accounts, and control branch-level project access.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          {seatInfo && (
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                color: "#334155",
              }}
              title="Each branch consumes one Branch Admin seat under your subscription"
            >
              <span style={{ color: "#64748b" }}>Package:</span>{" "}
              <strong>{subscriptionInfo?.planName || "Active"}</strong> •{" "}
              <strong>Branch Admin Seats:</strong>{" "}
              <span
                style={{
                  color:
                    !seatInfo.isUnlimited && seatInfo.remaining === 0
                      ? "#dc2626"
                      : "#059669",
                  fontWeight: 700,
                }}
              >
                {seatInfo.text}
              </span>
              {!seatInfo.isUnlimited && (
                <> ({seatInfo.remaining} remaining)</>
              )}
            </div>
          )}

          <button
            type="button"
            className="sa-btn-primary"
            disabled={Boolean(seatInfo && !seatInfo.isUnlimited && seatInfo.remaining === 0)}
            onClick={openCreateModal}
            style={{
              opacity: seatInfo && !seatInfo.isUnlimited && seatInfo.remaining === 0 ? 0.6 : 1,
              cursor: seatInfo && !seatInfo.isUnlimited && seatInfo.remaining === 0 ? "not-allowed" : "pointer",
            }}
            title={
              seatInfo && !seatInfo.isUnlimited && seatInfo.remaining === 0
                ? "Branch Admin seat limit reached. You cannot add more branches."
                : "Create new branch with a Branch Admin account"
            }
          >
            + Add New Branch
          </button>
        </div>
      </div>

      <section className="branch-grid-section-v3">
        <div className="v3-grid">
          {branches.map((b) => (
            <div key={b.id} className="v3-square-card">
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, color: "#a63d2f" }}>
                      REGIONAL BRANCH
                    </span>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: "#17240f", margin: "2px 0 0 0" }}>{b.name}</h3>
                  </div>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(166, 61, 47, 0.1)", color: "#a63d2f", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15 }}>
                    <FaBuilding />
                  </div>
                </div>

                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16, display: "flex", alignItems: "center", gap: 5 }}>
                  <FaMapMarkerAlt style={{ color: "#a63d2f" }} /> {b.city || "District Office"}
                </div>

                <div style={{ padding: 14, borderRadius: 14, background: "rgba(248, 250, 252, 0.8)", border: "1px solid #e2e8f0", marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
                    <FaUserTie style={{ color: "#2563eb" }} /> Admin: <strong style={{ color: "#1e293b" }}>{b.branchAdmin?.name || "—"}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                    <FaEnvelope style={{ fontSize: 10 }} /> {b.branchAdmin?.email || "No contact info"}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 12, background: "#ffffff", border: "1px solid #edf2f7", marginBottom: 18 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "flex", alignItems: "center", gap: 6 }}>
                    <FaLayerGroup style={{ color: "#a63d2f" }} /> Total Projects
                  </span>
                  <strong style={{ fontSize: 16, color: "#a63d2f" }}>{b.projectCount ?? 0}</strong>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={{ flex: 1, padding: "10px 14px", borderRadius: 50, background: "#17240f", color: "#ffffff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => openDetail(b)}>
                  <FaEye /> View Details
                </button>
                <button type="button" style={{ padding: "10px 14px", borderRadius: 50, background: "#f8fafc", color: "#475569", border: "1px solid #cbd5e1", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }} onClick={() => openEditModal(b)}>
                  <FaEdit /> Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CREATE / EDIT MODAL */}
      {createOpen && (
        <div className="sa-modal-overlay" onClick={closeCreateModal}>
          <div className="sa-modal sa-modal--lg" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <h3>{editingBranch ? "Edit Branch" : "Add New Branch"}</h3>
              <button
                type="button"
                className="sa-modal-close"
                onClick={closeCreateModal}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            <form
              id="branch-modal-form"
              onSubmit={handleCreateOrUpdate}
              className="sa-modal-body"
              style={{ padding: "20px" }}
              noValidate
            >
              <div className="sa-form-divider">Branch Details</div>

              <div className="sa-form-field">
                <label htmlFor="branch-district">
                  Branch District {editingBranch ? "(Locked)" : "*"}
                </label>
                <CustomDropdown
                  value={branchForm.district}
                  disabled={Boolean(editingBranch)}
                  onChange={(e) =>
                    setBranchForm({ ...branchForm, district: e.target.value })
                  }
                  options={TAMIL_NADU_DISTRICTS.map((d) => ({
                    value: d,
                    label: d,
                  }))}
                  placeholder="— Select District —"
                  searchPlaceholder="Search district…"
                  searchable
                  id="branch-district"
                />
                {editingBranch ? (
                  <p className="sa-form-hint" style={{ marginTop: "-2px", color: "#64748b" }}>
                    Branch location/district is permanently locked once established and cannot be modified.
                  </p>
                ) : branchForm.district ? (
                  <p className="sa-form-hint" style={{ marginTop: "-2px" }}>
                    Branch will be saved as <strong>"{branchForm.district} Branch"</strong>.
                  </p>
                ) : null}
              </div>

              <div className="sa-form-field">
                <label htmlFor="branch-region">Region</label>
                <input
                  id="branch-region"
                  type="text"
                  placeholder="e.g. Palani / South Chennai"
                  value={branchForm.region}
                  onChange={(e) => setBranchForm({ ...branchForm, region: e.target.value })}
                />
                <p className="sa-form-hint" style={{ marginTop: "-2px" }}>
                  Broad area this branch covers — e.g. Palani, South Chennai, South or West.
                </p>
              </div>

              <div className="sa-form-field">
                <label htmlFor="branch-address">Address</label>
                <input
                  id="branch-address"
                  type="text"
                  placeholder="Office address (optional)"
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                />
              </div>

              <div className="sa-form-field">
                <label htmlFor="branch-notes">Notes</label>
                <input
                  id="branch-notes"
                  type="text"
                  placeholder="Internal notes (optional)"
                  value={branchForm.notes}
                  onChange={(e) => setBranchForm({ ...branchForm, notes: e.target.value })}
                />
              </div>

              {!editingBranch && (
                <>
                  <div className="sa-form-divider">Branch Admin Account</div>

                  <p className="sa-form-note">
                    <span aria-hidden="true">👤</span>
                    A dedicated Branch Admin account is provisioned with this branch and consumes
                    <strong>&nbsp;one subscription seat</strong>.
                  </p>

                  <div className="sa-form-field" style={{ marginTop: "14px" }}>
                    <label htmlFor="branch-admin-name">Branch Admin Name *</label>
                    <input
                      id="branch-admin-name"
                      type="text"
                      placeholder="e.g. Priya Sharma"
                      value={adminForm.adminName}
                      onChange={(e) => setAdminForm({ ...adminForm, adminName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="sa-form-field">
                    <label htmlFor="branch-admin-email">Branch Admin Email *</label>
                    <input
                      id="branch-admin-email"
                      type="email"
                      placeholder="e.g. priya@dreamcity.in"
                      value={adminForm.adminEmail}
                      onChange={(e) => setAdminForm({ ...adminForm, adminEmail: e.target.value })}
                      required
                    />
                  </div>

                  <div className="sa-form-grid-2">
                    <div className="sa-form-field">
                      <label htmlFor="branch-admin-mobile">Mobile Number</label>
                      <PhoneInputField
                        id="branch-admin-mobile"
                        name="adminMobile"
                        countryCode={adminPhoneCountryCode}
                        onCountryCodeChange={(code) => setAdminPhoneCountryCode(code)}
                        value={adminForm.adminMobile}
                        onChange={(digits) =>
                          setAdminForm({ ...adminForm, adminMobile: digits })
                        }
                        placeholder="10-digit number"
                        maxLength={10}
                      />
                    </div>

                    <div className="sa-form-field">
                      <label htmlFor="branch-admin-password">Password</label>
                      <input
                        id="branch-admin-password"
                        type="text"
                        placeholder="Default: Admin@123"
                        value={adminForm.adminPassword}
                        onChange={(e) => setAdminForm({ ...adminForm, adminPassword: e.target.value })}
                      />
                    </div>
                  </div>

                  <p className="sa-form-hint">
                    Leave the password empty to use the default <strong>Admin@123</strong>. The Branch
                    Admin logs in with this email and gains access only to their branch's projects.
                  </p>
                </>
              )}
            </form>

            <div className="sa-modal-footer-stack">
              {formError && (
                <div className="sa-form-error" role="alert">
                  {formError}
                </div>
              )}
              <div className="sa-modal-actions">
                <button
                  type="button"
                  className="sa-btn-secondary"
                  onClick={closeCreateModal}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="branch-modal-form"
                  className="sa-btn-primary"
                  disabled={isSaving}
                >
                  {isSaving
                    ? "Saving…"
                    : editingBranch
                    ? "Save Changes"
                    : "Create Branch"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailBranch && (
        <div className="sa-modal-overlay" onClick={closeDetail}>
          <div className="sa-modal sa-modal--lg" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <h3>Branch Details — {detailBranch.name}</h3>
              <button
                type="button"
                className="sa-modal-close"
                onClick={closeDetail}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            {isLoadingDetail || !detailData ? (
              <p style={{ padding: "1rem", color: "#94a3b8" }}>Loading branch details…</p>
            ) : (
              <div className="sa-modal-body" style={{ padding: "20px" }}>
                <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", fontSize: "13px", color: "#334155", marginBottom: "14px" }}>
                  <div>
                    <strong>Location:</strong> {detailData.city}
                    {detailData.region ? ` • ${detailData.region}` : ""}
                  </div>
                  <div>
                    <strong>Status:</strong>{" "}
                    {detailData.status === "ACTIVE" ? "Active" : "Inactive"}
                  </div>
                  {detailData.address && (
                    <div><strong>Address:</strong> {detailData.address}</div>
                  )}
                  {detailData.notes && (
                    <div><strong>Notes:</strong> {detailData.notes}</div>
                  )}
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    marginBottom: "14px",
                    fontSize: "13px",
                  }}
                >
                  <strong>Branch Administrator:</strong>{" "}
                  {detailData.branchAdmin ? (
                    <>
                      {detailData.branchAdmin.name} ({detailData.branchAdmin.email})
                      {detailData.branchAdmin.phone ? ` • ${detailData.branchAdmin.phone}` : ""} —{" "}
                      <span
                        style={{
                          color: detailData.branchAdmin.status === "ACTIVE" ? "#059669" : "#dc2626",
                          fontWeight: 600,
                        }}
                      >
                        {detailData.branchAdmin.status === "ACTIVE" ? "Active" : "Paused"}
                      </span>
                    </>
                  ) : (
                    "Not provisioned"
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 10px" }}>
                  <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b", margin: 0 }}>
                    Associated Projects ({detailData.totalProjects ?? 0})
                  </h4>
                  {detailData.summary && (
                    <div style={{ fontSize: "12px", color: "#64748b", display: "flex", gap: "10px" }}>
                      <span>Plots Total: <strong>{detailData.summary.totalPlots || 0}</strong></span>
                      <span style={{ color: "#059669" }}>Available: <strong>{detailData.summary.availablePlots || 0}</strong></span>
                      <span style={{ color: "#d97706" }}>Reserved: <strong>{detailData.summary.reservedPlots || 0}</strong></span>
                      <span style={{ color: "#dc2626" }}>Booked: <strong>{detailData.summary.soldPlots || 0}</strong></span>
                    </div>
                  )}
                </div>
                <div className="sa-table-scroll">
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th scope="col">Project</th>
                        <th scope="col">Assigned Admin</th>
                        <th scope="col" style={{ textAlign: "center" }}>Available Plots</th>
                        <th scope="col" style={{ textAlign: "center" }}>Reserved Plots</th>
                        <th scope="col" style={{ textAlign: "center" }}>Booked Plots</th>
                        <th scope="col" style={{ textAlign: "center" }}>Total Plots</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailData.projects || []).length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: "center", padding: "1.5rem", color: "#94a3b8" }}>
                            No projects associated with this branch yet.
                          </td>
                        </tr>
                      ) : (
                        (detailData.projects || []).map((project) => {
                          const stats = project.plotStats || { total: 0, available: 0, reserved: 0, sold: 0 };
                          return (
                            <tr key={project._id}>
                              <td>
                                <span className="sa-person">
                                  <strong>{project.title}</strong>
                                  <small>{project.location}</small>
                                </span>
                              </td>
                              <td>
                                {project.assignedAdmin ? (
                                  <span style={{ fontWeight: 600, color: "#1e293b" }}>
                                    {project.assignedAdmin.name}
                                  </span>
                                ) : (
                                  <span style={{ color: "#94a3b8" }}>—</span>
                                )}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "3px 10px",
                                    borderRadius: "12px",
                                    backgroundColor: "#ecfdf5",
                                    color: "#059669",
                                    fontWeight: 700,
                                    fontSize: "12px",
                                  }}
                                >
                                  {stats.available}
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "3px 10px",
                                    borderRadius: "12px",
                                    backgroundColor: "#fffbeb",
                                    color: "#d97706",
                                    fontWeight: 700,
                                    fontSize: "12px",
                                  }}
                                >
                                  {stats.reserved}
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "3px 10px",
                                    borderRadius: "12px",
                                    backgroundColor: "#fef2f2",
                                    color: "#dc2626",
                                    fontWeight: 700,
                                    fontSize: "12px",
                                  }}
                                >
                                  {stats.sold}
                                </span>
                              </td>
                              <td style={{ textAlign: "center", fontWeight: 700, color: "#1e293b" }}>
                                {stats.total}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL FOR ACTIVATE / DEACTIVATE */}
      <ConfirmationModal
        isOpen={Boolean(confirmStatusBranch)}
        title={
          confirmStatusBranch?.status === "ACTIVE"
            ? "Deactivate Branch?"
            : "Reactivate Branch?"
        }
        message={
          confirmStatusBranch?.status === "ACTIVE"
            ? `Are you sure you want to deactivate "${confirmStatusBranch?.name}"?`
            : `Are you sure you want to reactivate "${confirmStatusBranch?.name}"?`
        }
        subMessage={
          confirmStatusBranch?.status === "ACTIVE"
            ? "The branch's projects stay in your workspace, but the Branch Admin account will be paused and immediately lose operational access. One Branch Admin seat will be released."
            : "The Branch Admin account will regain access and one Branch Admin seat will be consumed again."
        }
        confirmText={
          confirmStatusBranch?.status === "ACTIVE"
            ? "Deactivate Branch"
            : "Reactivate Branch"
        }
        type={confirmStatusBranch?.status === "ACTIVE" ? "danger" : "success"}
        isLoading={isTogglingStatus}
        onCancel={() => setConfirmStatusBranch(null)}
        onConfirm={handleToggleStatus}
      />

      {/* CONFIRMATION MODAL FOR DELETE BRANCH */}
      <ConfirmationModal
        isOpen={Boolean(confirmDeleteBranch)}
        title="Delete Branch?"
        message={`Are you sure you want to permanently delete "${confirmDeleteBranch?.name}"?`}
        subMessage="Associated projects will be unlinked and remain safely in your workspace. The branch administrator account will be removed and their seat will be released. This action cannot be undone."
        confirmText="Delete Branch"
        type="danger"
        isLoading={isDeletingBranch}
        onCancel={() => setConfirmDeleteBranch(null)}
        onConfirm={handleDeleteBranch}
      />
    </div>
  );
};

export default BranchManagement;
