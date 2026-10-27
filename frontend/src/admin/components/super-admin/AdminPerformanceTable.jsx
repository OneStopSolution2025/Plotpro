import { useNavigate } from "react-router-dom";

/* =========================================================
   ADMIN PERFORMANCE & RESPONSIBILITY REPORT
   ---------------------------------------------------------
   Admin-wise workload, project ownership and plot status.
   Administrators are managed via the Branches page.
   ========================================================= */

const initials = (name = "") =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const AdminPerformanceTable = ({ rows = [] }) => {
  const navigate = useNavigate();

  return (
    <section className="dashboard-section sa-section">
      <div className="dashboard-section-header">
        <div>
          <h2>Branch Admin Performance</h2>
          <p>Project responsibility and plot inventory breakdown across branch administrators.</p>
        </div>

        <button
          className="dashboard-view-all"
          type="button"
          onClick={() => navigate("/super-admin/branches")}
          title="Create Branch Admin accounts and manage them from the Branches page"
        >
          Manage Branches
        </button>
      </div>

      <div className="sa-table-scroll">
        <table className="sa-table">
          <caption className="sr-only">
            Branch Admin performance, showing projects handled and plot inventory
            (available, reserved, sold, total) by each branch administrator.
          </caption>

          <thead>
            <tr>
              <th scope="col">Branch Admin</th>
              <th scope="col">Projects</th>
              <th scope="col">Available</th>
              <th scope="col">Reserved</th>
              <th scope="col">Sold</th>
              <th scope="col">Total Plots</th>
              <th scope="col">Status</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
                  No branch administrators found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <span className="sa-avatar" aria-hidden="true">
                      {initials(row.name)}
                    </span>
                    <span className="sa-person">
                      <strong>{row.name}</strong>
                      <small>{row.email}</small>
                    </span>
                  </th>

                  <td><strong>{row.projectsCount}</strong></td>
                  <td>{row.availablePlots}</td>
                  <td>{row.reservedPlots}</td>
                  <td>{row.soldPlots}</td>
                  <td><strong>{row.totalPlots}</strong></td>
                  <td>
                    <span className={`sa-badge sa-badge-${row.status.toLowerCase()}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AdminPerformanceTable;
