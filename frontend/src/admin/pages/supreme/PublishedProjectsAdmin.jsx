import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supremeAdminApi } from "../../../services/api";
import { FaExternalLinkAlt, FaArrowLeft, FaInbox } from "react-icons/fa";
import "../../styles/super-admin.css";


const UNKNOWN_LEGACY = "legacy";

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const PublishedProjectsAdmin = () => {
  const { subscriberId, adminId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [fromInput, setFromInput] = useState(searchParams.get("from") || "");
  const [toInput, setToInput] = useState(searchParams.get("to") || "");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");

  const [superAdmins, setSuperAdmins] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [superAdminsLoading, setSuperAdminsLoading] = useState(true);
  const [error, setError] = useState(null);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const updateParams = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (!("page" in patch)) next.delete("page"); // reset page on filter change
    setSearchParams(next);
  };

  // Effective filter values driven by the URL
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const search = searchParams.get("search") || "";

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: String(page),
        limit: "10",
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(search ? { search } : {}),
      };
      const res = await supremeAdminApi.getPublishedProjectsByBranchAdmin(
        subscriberId,
        adminId,
        params
      );
      if (res?.success) {
        setDetail(res.data || null);
      } else {
        setError(res?.message || "Failed to load published projects.");
      }
    } catch (err) {
      console.error("[PublishedProjectsAdmin] Fetch error:", err);
      setError(err.message || "Failed to load published projects.");
    } finally {
      setLoading(false);
    }
  };

  // Filter dropdown sources (Super Admin picker + Branch Admin picker)
  useEffect(() => {
    let cancelled = false;
    setSuperAdminsLoading(true);
    supremeAdminApi
      .getPublishedProjectsBySuperAdmin()
      .then((res) => {
        if (!cancelled) setSuperAdmins(res?.data?.superAdmins || []);
      })
      .catch((err) => console.error("[PublishedProjectsAdmin] Super Admin list error:", err))
      .finally(() => {
        if (!cancelled) setSuperAdminsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    supremeAdminApi
      .getPublishedProjectsByTenantAdmins(subscriberId)
      .then((res) => {
        if (!cancelled && res?.success) setAdmins(res?.data?.admins || []);
      })
      .catch((err) => console.error("[PublishedProjectsAdmin] Admin list error:", err));
    return () => {
      cancelled = true;
    };
  }, [subscriberId]);

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriberId, adminId, page, from, to, search]);

  const dateInvalid =
    fromInput && toInput && new Date(fromInput) > new Date(toInput);

  const applyFilters = () => {
    if (dateInvalid) {
      setError("'From' date cannot be after 'To' date.");
      return;
    }
    setError(null);
    updateParams({ from: fromInput, to: toInput, search: searchInput.trim() });
  };

  const resetFilters = () => {
    setFromInput("");
    setToInput("");
    setSearchInput("");
    setError(null);
    setSearchParams(new URLSearchParams());
  };

  // Keep inputs in sync when the URL changes (browser back / forward)
  useEffect(() => {
    setFromInput(from);
    setToInput(to);
    setSearchInput(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, search, subscriberId, adminId]);

  const selectField = (label, value, onChange, options, disabled) => (
    <div style={{ flex: "1 1 190px", minWidth: "190px", maxWidth: "260px" }}>
      <label className="form-label" style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
        {label}
      </label>
      <select
        className="form-select"
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        {options}
      </select>
    </div>
  );

  const creatorName = detail?.creator?.name || "…";

  return (
    <div className="dashboard-page sa-page">
      {/* Breadcrumb Back Navigation */}
      <div className="sa-detail-breadcrumb" style={{ marginBottom: "16px" }}>
        <button
          type="button"
          className="sa-btn-back"
          onClick={() =>
            navigate(`/supreme-admin/published-projects/tenant/${subscriberId}`)
          }
        >
          <FaArrowLeft style={{ marginRight: 8 }} /> Back to Branch Admins
        </button>
      </div>

      {/* Header */}
      <div className="sa-page-header" style={{ marginBottom: "20px" }}>
        <div>
          <span className="sa-brand-tag">PUBLISHED PROJECTS</span>
          <h1 className="sa-page-title">{creatorName}</h1>
          <p className="sa-page-subtitle">
            {detail?.subscriber?.name ? `${detail.subscriber.name} · ` : ""}
            Read-only listing of currently published projects.
            {detail?.creator?.isLegacy ? " Creator attribution is missing on these records." : ""}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="sa-card sa-filter-bar" style={{ marginBottom: "24px" }}>
        <div className="sa-filter-controls">
          

          <div style={{ flex: "1 1 155px", minWidth: "155px", maxWidth: "190px" }}>
            <label className="form-label" style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
              Published From
            </label>
            <input
              type="date"
              className="form-control"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
            />
          </div>

          <div style={{ flex: "1 1 155px", minWidth: "155px", maxWidth: "190px" }}>
            <label className="form-label" style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
              Published To
            </label>
            <input
              type="date"
              className="form-control"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
            />
          </div>

          <div style={{ flex: "2 1 200px", minWidth: "200px" }}>
            <label className="form-label" style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
              Project Name
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="Search project name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
            <button
              type="button"
              className="sa-btn-primary"
              onClick={applyFilters}
              disabled={dateInvalid}
            >
              Apply Filters
            </button>
            <button type="button" className="sa-btn-outline" onClick={resetFilters}>
              Reset
            </button>
          </div>
        </div>
        {dateInvalid && (
          <p className="sa-form-error" style={{ margin: "10px 0 0", fontSize: "12px", color: "#dc2626" }}>
            'From' date cannot be after 'To' date.
          </p>
        )}
      </div>

      {/* Project list */}
      <div className="sa-card" style={{ overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <div className="spinner-border text-primary" role="status" />
          </div>
        ) : error && !detail ? (
          <div className="alert alert-danger m-3">{error}</div>
        ) : !detail || detail.items.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "#64748b" }}>
            <FaInbox style={{ fontSize: "40px", color: "#cbd5e1", marginBottom: "12px" }} />
            <p>
              No published projects found for this selection
              {search || from || to ? " with the applied filters." : "."}
            </p>
          </div>
        ) : (
          <>
            <div className="table-responsive sa-table-scroll">
              <table className="table table-hover align-middle mb-0" style={{ fontSize: "14px" }}>
                <thead style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <tr style={{ color: "#475569", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    <th style={{ padding: "14px 20px" }}>Project</th>
                    <th>Location</th>
                    <th>Super Admin (Tenant)</th>
                    <th>Branch Admin</th>
                    <th>Published Date</th>
                    <th className="text-end" style={{ paddingRight: "20px" }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((project) => {
                    const projectId = project.customId || project._id;
                    return (
                      <tr key={project._id}>
                        <td style={{ padding: "14px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            {project.image ? (
                              <img
                                src={project.image}
                                alt={project.title}
                                loading="lazy"
                                style={{
                                  width: "46px",
                                  height: "46px",
                                  objectFit: "cover",
                                  borderRadius: "8px",
                                  border: "1px solid #e2e8f0",
                                  backgroundColor: "#f1f5f9",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "46px",
                                  height: "46px",
                                  borderRadius: "8px",
                                  background: "#f1f5f9",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "10px",
                                  color: "#94a3b8",
                                  textAlign: "center",
                                  flexShrink: 0,
                                }}
                              >
                                No image
                              </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <strong style={{ display: "block", wordBreak: "break-word" }}>
                                {project.title}
                              </strong>
                              <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                                #{project.customId || "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ color: "#475569" }}>
                          {project.location || "—"}
                          {project.city ? (
                            <div style={{ fontSize: "12px", color: "#94a3b8" }}>{project.city}</div>
                          ) : null}
                        </td>
                        <td style={{ color: "#475569" }}>{detail.subscriber?.name || "—"}</td>
                        <td style={{ color: "#475569" }}>
                          {detail.creator?.isLegacy ? "Unknown / Legacy" : detail.creator?.name}
                        </td>
                        <td style={{ color: "#475569" }}>{formatDate(project.approvedAt)}</td>
                        <td className="text-end" style={{ paddingRight: "20px" }}>
                          <button
                            type="button"
                            className="sa-btn-inspect"
                            onClick={() =>
                              window.open(
                                `/project-details/${projectId}`,
                                "_blank",
                                "noopener,noreferrer"
                              )
                            }
                          >
                            <FaExternalLinkAlt style={{ marginRight: "6px", fontSize: "11px" }} />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 20px",
                borderTop: "1px solid #e2e8f0",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <span style={{ fontSize: "13px", color: "#64748b" }}>
                Page {detail.pagination.page} of {detail.pagination.totalPages || 1} —{" "}
                {detail.pagination.total} project{detail.pagination.total === 1 ? "" : "s"}
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="sa-btn-outline"
                  disabled={page <= 1 || loading}
                  onClick={() => updateParams({ page: String(page - 1) })}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="sa-btn-outline"
                  disabled={loading || page >= (detail.pagination.totalPages || 1)}
                  onClick={() => updateParams({ page: String(page + 1) })}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PublishedProjectsAdmin;
