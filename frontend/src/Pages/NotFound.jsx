import { useNavigate, useLocation } from "react-router-dom";
import { Compass, Home, FolderKanban, Mail, ArrowLeft } from "lucide-react";
import "../css/NotFound.css";

/**
 * Preset content for common error codes. Any custom `code` falls back to the
 * generic "Something went wrong" presentation.
 */
const ERROR_PRESETS = {
  400: {
    title: "Bad Request",
    message: "The request could not be understood. Please check the link and try again.",
  },
  401: {
    title: "Sign In Required",
    message: "You need to be signed in to view this page.",
  },
  403: {
    title: "Access Denied",
    message: "You don't have permission to view this page. If you believe this is a mistake, contact your administrator.",
  },
  404: {
    title: "Page Not Found",
    message: "The page you're looking for doesn't exist, was moved, or the link may be broken.",
  },
  408: {
    title: "Request Timed Out",
    message: "The server took too long to respond. Please try again in a moment.",
  },
  500: {
    title: "Something Went Wrong",
    message: "An unexpected error occurred on our side. Our team has been notified — please try again shortly.",
  },
  503: {
    title: "Temporarily Unavailable",
    message: "We're undergoing maintenance and will be back online soon. Thank you for your patience.",
  },
};

/**
 * Reusable full-page error screen (404 by default).
 *
 * Props:
 *  - code:    HTTP-style status code to display (default 404)
 *  - title:   Optional heading override
 *  - message: Optional description override
 *
 * Can be used directly as a route element (catch-all 404) or inside an
 * error boundary for 403/500-style failures.
 */
const NotFound = ({ code = 404, title, message }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const preset = ERROR_PRESETS[code] || {
    title: "Something Went Wrong",
    message: "An unexpected error occurred. Please try again or head back to safety.",
  };

  const displayCode = String(code);
  const displayTitle = title || preset.title;
  const displayMessage = message || preset.message;

  return (
    <main className="nf-page">
        {/* Ambient background accents */}
        <div className="nf-ambient nf-ambient--one" aria-hidden="true" />
        <div className="nf-ambient nf-ambient--two" aria-hidden="true" />

        <section className="nf-card" role="alert">
          <div className="nf-badge" aria-hidden="true">
            <Compass size={30} strokeWidth={1.8} />
          </div>

          <p className="nf-code" aria-hidden="true">
            {displayCode.split("").map((digit, i) => (
              <span key={i} className="nf-code-digit" style={{ animationDelay: `${i * 0.08}s` }}>
                {digit}
              </span>
            ))}
          </p>

          <h1 className="nf-title">{displayTitle}</h1>
          <p className="nf-message">{displayMessage}</p>

          {code === 404 && location?.pathname && location.pathname !== "/" && (
            <p className="nf-path">
              Requested path: <code>{location.pathname}</code>
            </p>
          )}

          <div className="nf-actions">
            <button type="button" className="nf-btn nf-btn--primary" onClick={() => navigate("/")}>
              <Home size={17} strokeWidth={2} />
              Back to Home
            </button>
            <button type="button" className="nf-btn nf-btn--ghost" onClick={() => navigate("/projects")}>
              <FolderKanban size={17} strokeWidth={2} />
              Browse Projects
            </button>
            <button type="button" className="nf-btn nf-btn--ghost" onClick={() => navigate("/contact")}>
              <Mail size={17} strokeWidth={2} />
              Contact Support
            </button>
          </div>

          <button type="button" className="nf-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} strokeWidth={2.2} />
            Go back to the previous page
          </button>
        </section>
      </main>
  );
};

export default NotFound;
