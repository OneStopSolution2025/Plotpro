import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaTimes } from "react-icons/fa";

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info", duration = 7000) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Listen for global custom events
  useEffect(() => {
    const handleGlobalEvent = (e) => {
      if (e.detail?.message) {
        showToast(e.detail.message, e.detail.type || "info", e.detail.duration || 7000);
      }
    };
    window.addEventListener("plotpro:show-toast", handleGlobalEvent);
    return () => window.removeEventListener("plotpro:show-toast", handleGlobalEvent);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Notification Container */}
      <div
        style={{
          position: "fixed",
          top: "24px",
          right: "24px",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          pointerEvents: "none",
          maxWidth: "420px",
          width: "calc(100% - 48px)",
        }}
      >
        {toasts.map((toast) => {
          const isError = toast.type === "error" || toast.type === "danger";
          const isSuccess = toast.type === "success";
          const bgColor = isError ? "#b91c1c" : isSuccess ? "#047857" : "#1e293b";
          const icon = isError ? (
            <FaExclamationCircle style={{ fontSize: "18px", minWidth: "18px" }} />
          ) : isSuccess ? (
            <FaCheckCircle style={{ fontSize: "18px", minWidth: "18px" }} />
          ) : (
            <FaInfoCircle style={{ fontSize: "18px", minWidth: "18px" }} />
          );

          return (
            <div
              key={toast.id}
              style={{
                pointerEvents: "auto",
                backgroundColor: bgColor,
                color: "#ffffff",
                padding: "14px 18px",
                borderRadius: "8px",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                fontSize: "14px",
                fontWeight: 500,
                lineHeight: "1.4",
                animation: "toastSlideIn 0.25s ease-out forwards",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {icon}
                <span>{toast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255, 255, 255, 0.7)",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                }}
                aria-label="Close notification"
              >
                <FaTimes style={{ fontSize: "13px" }} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: (msg) => console.log("[Toast fallback]:", msg),
    };
  }
  return context;
};

// Global helper to trigger toast from outside React tree (e.g. from event handlers or api.js)
export const triggerGlobalToast = (message, type = "info") => {
  window.dispatchEvent(
    new CustomEvent("plotpro:show-toast", {
      detail: { message, type },
    })
  );
};
