import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supremeAdminApi } from "../../../services/api";
import { FaEye, FaArrowLeft, FaInbox } from "react-icons/fa";
import "../../styles/super-admin.css";

/* =========================================================
   PLOTPRO — SUPREME ADMIN: PUBLISHED PROJECTS
   Drill-down level 2 — Branch Admins under ONE subscriber.
   Strictly read-only. Zero-count admins are included.
   A synthetic "Unknown / Legacy" row (only when > 0) lists
   published projects with no reliable creator attribution.
   ========================================================= */

const PublishedProjectsTenant = () => {
  const { subscriberId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await supremeAdminApi.getPublishedProjectsByTenantAdmins(
        subscriberId
      );
      if (res?.success) {
        setData(res.data || null);
      } else {
        setError(res?.message || "Failed to load subscriber details.");
      }
    } catch (err) {
      console.error("[PublishedProjectsTenant] Fetch error:", err);
      setError(err.message || "Failed to load subscriber details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriberId]);

  const openProjects = (row) => {
    navigate(
      `/supreme-admin/published-projects/tenant/${subscriberId}/admin/${row.adminId ?? "legacy"}`
    );
  };

  return (
    <div className="dashboard-page sa-page">
      {/* Breadcrumb Back Navigation */}
      <div className="sa-detail-breadcrumb" style={{ marginBottom: "16px" }}>
        <button
          type="button"
          className="sa-btn-back"
          onClick={() => navigate("/supreme-admin/published-projects")}
        >
          <FaArrowLeft style={{ marginRight: 8 }} /> Back to Published Projects
        </button>
      </div>

      {/* Header */}
      <div className="sa-page-header" style={{ marginBottom: "24px" }}>
        <div>
          <span className="sa-brand-tag">ORGANIZATION DRILL-DOWN</span>
          <h1 className="sa-page-title">
            {data?.subscriber?.name || "Super Admin"}
          </h1>
          <p className="sa-page-subtitle">
            {data?.subscriber?.email || ""}
            {data
              ? ` — ${data.tenantPublishedTotal} published project${
                  data.tenantPublishedTotal === 1 ? "" : "s"
                } in this organization.`
              : ""}
          </p>
        </div>
      </div>

      {/* Branch Admin-wise table */}
      <div className="sa-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "#0f172a" }}>
            Published Projects by Branch Admin
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <div className="spinner-border text-primary" role="status" />
          </div>
        ) : error ? (
          <div className="alert alert-danger m-3">{error}</div>
        ) : !data || data.admins.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "#64748b" }}>
            <FaInbox style={{ fontSize: "40px", color: "#cbd5e1", marginBottom: "12px" }} />
            <p>No Branch Admin accounts belong to this organization yet.</p>
          </div>
        ) : (
          <div className="table-responsive sa-table-scroll">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: "14px" }}>
              <thead style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <tr style={{ color: "#475569", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  <th style={{ padding: "14px 20px" }}>Branch Admin</th>
                  <th>Email</th>
                  <th>Total Published Projects</th>
                  <th className="text-end" style={{ paddingRight: "20px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.admins.map((row) => (
                  <tr key={row.adminId ?? "legacy"}>
                    <td style={{ padding: "14px 20px" }}>
                      <strong>{row.name}</strong>
                      {row.isLegacy && (
                        <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                          Creator not recorded on these projects
                        </div>
                      )}
                    </td>
                    <td style={{ color: row.isLegacy ? "#94a3b8" : "#64748b" }}>
                      {row.email}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: row.publishedCount > 0 ? "#fbf0ec" : "#f1f5f9",
                          color: row.publishedCount > 0 ? "#a63d2f" : "#94a3b8",
                          border: "1px solid #e2e8f0",
                          fontSize: "12px",
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: "6px",
                        }}
                      >
                        {row.publishedCount}
                      </span>
                    </td>
                    <td className="text-end" style={{ paddingRight: "20px" }}>
                      <button
                        type="button"
                        className="sa-btn-inspect"
                        onClick={() => openProjects(row)}
                      >
                        <FaEye style={{ marginRight: "6px" }} /> View Projects
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublishedProjectsTenant;
