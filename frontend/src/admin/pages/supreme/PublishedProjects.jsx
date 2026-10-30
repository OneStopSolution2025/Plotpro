import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supremeAdminApi } from "../../../services/api";
import {
  FaSync,
  FaSearch,
  FaEye,
  FaProjectDiagram,
  FaBuilding,
  FaUserTie,
  FaInbox,
} from "react-icons/fa";
import "../../styles/super-admin.css";

/* =========================================================
   PLOTPRO — SUPREME ADMIN: PUBLISHED PROJECTS
   Drill-down level 1 — Super Admin-wise published projects.
   Strictly read-only. Published = APPROVED + not archived.
   ========================================================= */

const PublishedProjects = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const loadAll = async (searchTerm = "") => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, rowsRes] = await Promise.all([
        supremeAdminApi.getPublishedProjectsSummary(),
        supremeAdminApi.getPublishedProjectsBySuperAdmin(
          searchTerm ? { search: searchTerm } : {}
        ),
      ]);

      setSummary(summaryRes?.data || null);
      setRows(rowsRes?.data?.superAdmins || []);
    } catch (err) {
      console.error("[PublishedProjects] Fetch error:", err);
      setError(err.message || "Failed to load published projects data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadAll(search);
  }, [search]);

  const cards = useMemo(
    () => [
      {
        icon: <FaProjectDiagram />,
        label: "Total Published Projects",
        value: summary ? summary.totalPublishedProjects : "—",
      },
      {
        icon: <FaBuilding />,
        label: "Total Super Admins",
        value: summary ? summary.totalSuperAdmins : "—",
      },
      {
        icon: <FaUserTie />,
        label: "Total Branch Admins",
        value: summary ? summary.totalBranchAdmins : "—",
      },
    ],
    [summary]
  );

  return (
    <div className="dashboard-page sa-page">
      {/* Header */}
      <div className="sa-page-header">
        <div>
          <span className="sa-brand-tag">PLATFORM OVERSIGHT</span>
          <h1 className="sa-page-title">
            Published <span>Projects</span>
          </h1>
          <p className="sa-page-subtitle">
            Platform-wide view of currently published projects by subscriber and Branch Admin. Read-only.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 260px", maxWidth: "300px" }}>
            <FaSearch
              style={{
                position: "absolute",
                left: "14px",
                top: "12px",
                color: "#94a3b8",
              }}
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or email…"
              className="form-control"
              style={{ paddingLeft: "38px" }}
            />
          </div>
          <button
            type="button"
            className="sa-btn-outline"
            onClick={() => loadAll(search)}
            style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            <FaSync className={loading ? "spinner" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {cards.map((card) => (
          <div className="sa-card" key={card.label} style={{ padding: "18px" }}>
            <div
              style={{
                fontSize: "12px",
                color: "#64748b",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.4px",
              }}
            >
              <span style={{ color: "#a63d2f", display: "inline-flex" }}>{card.icon}</span>
              {card.label}
            </div>
            <div
              style={{
                fontSize: "26px",
                fontWeight: 800,
                color: "#0f172a",
                marginTop: "6px",
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Super Admin-wise table */}
      <div className="sa-card" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "#0f172a" }}>
            Published Projects by Super Admin
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <div className="spinner-border text-primary" role="status" />
          </div>
        ) : error ? (
          <div className="alert alert-danger m-3">{error}</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "#64748b" }}>
            <FaInbox style={{ fontSize: "40px", color: "#cbd5e1", marginBottom: "12px" }} />
            <p>No Super Admin accounts match this search.</p>
          </div>
        ) : (
          <div className="table-responsive sa-table-scroll">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: "14px" }}>
              <thead style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <tr style={{ color: "#475569", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  <th style={{ padding: "14px 20px" }}>Super Admin</th>
                  <th>Email</th>
                  <th>Total Published Projects</th>
                  <th className="text-end" style={{ paddingRight: "20px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.subscriberId}>
                    <td style={{ padding: "14px 20px" }}>
                      <strong>{row.name}</strong>
                    </td>
                    <td style={{ color: "#64748b" }}>{row.email}</td>
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
                        onClick={() =>
                          navigate(
                            `/supreme-admin/published-projects/tenant/${row.subscriberId}`
                          )
                        }
                      >
                        <FaEye style={{ marginRight: "6px" }} /> View Details
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

export default PublishedProjects;
