import SuperAdminIcon from "./SuperAdminIcon";

/* =========================================================
   SUPER ADMIN KPI CARDS
   ---------------------------------------------------------
   Clean display for dynamic Total Admins and Active Admins.
   ========================================================= */

const SuperAdminStats = ({ stats }) => (
  <section className="dashboard-stats" aria-label="Admin key figures">
    {stats.map((stat) => {
      const isClickable = Boolean(stat.onClick);
      return (
        <div
          className={`dashboard-stat-card ${isClickable ? "clickable" : ""}`}
          key={stat.id}
          onClick={stat.onClick}
          style={isClickable ? { cursor: "pointer" } : undefined}
          role={isClickable ? "button" : undefined}
          tabIndex={isClickable ? 0 : undefined}
          onKeyDown={
            isClickable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    stat.onClick();
                  }
                }
              : undefined
          }
        >
          <div className={`stat-icon ${stat.tone}`}>
            <SuperAdminIcon name={stat.icon} />
          </div>

          <div className="stat-content">
            <span className="stat-title">{stat.title}</span>
            <h2>{stat.value}</h2>
            <p>{stat.subtitle}</p>
          </div>
        </div>
      );
    })}
  </section>
);

export default SuperAdminStats;
