import { Link } from "react-router-dom";
import { FaTools, FaUserShield } from "react-icons/fa";

const MaintenancePage = ({ platformName = "PlotPro", supportEmail = "support@plotpro.in" }) => {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f7f8fa",
        fontFamily: "'Poppins', sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "540px",
          width: "100%",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e9edf2",
          boxShadow: "0 10px 30px rgba(20, 40, 70, 0.08)",
          padding: "48px 36px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            backgroundColor: "#fbf0ec",
            color: "#a63d2f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            fontSize: "36px",
          }}
        >
          <FaTools />
        </div>

        <h1
          style={{
            fontSize: "26px",
            fontWeight: 800,
            color: "#111827",
            marginBottom: "12px",
            letterSpacing: "-0.5px",
          }}
        >
          Under Scheduled Maintenance
        </h1>

        <p
          style={{
            fontSize: "15px",
            color: "#686868",
            lineHeight: 1.6,
            marginBottom: "28px",
          }}
        >
          <strong>{platformName}</strong> is currently performing scheduled system updates and optimizations.
          Public exploration and lead submissions are temporarily paused.
        </p>

        <div
          style={{
            backgroundColor: "#fbf0ec",
            border: "1px solid #f5d5c7",
            borderRadius: "10px",
            padding: "16px",
            marginBottom: "32px",
            fontSize: "13px",
            color: "#872e22",
          }}
        >
          Expected downtime is brief. If you require urgent assistance, please contact our support team at{" "}
          <a
            href={`mailto:${supportEmail}`}
            style={{ color: "#a63d2f", fontWeight: 700, textDecoration: "underline" }}
          >
            {supportEmail}
          </a>.
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
          <Link
            to="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              backgroundColor: "#a63d2f",
              color: "#ffffff",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "14px",
              textDecoration: "none",
              transition: "background 0.2s ease",
            }}
          >
            <FaUserShield /> Staff & Owner Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;
