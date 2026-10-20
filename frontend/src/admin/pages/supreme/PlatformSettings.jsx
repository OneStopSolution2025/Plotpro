import { useState, useEffect, useCallback } from "react";
import { supremeAdminApi } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";
import { FaCog, FaSave, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import "../../styles/super-admin.css";

const PlatformSettings = () => {
  const { reloadSettings } = useAuth();
  const [settings, setSettings] = useState({
    platformName: "PlotPro",
    supportEmail: "support@plotpro.in",
    supportPhone: "+91 99999 00000",
    maintenanceMode: false,
    allowSelfRegistration: true,
    defaultTrialDays: 14,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (type, text) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await supremeAdminApi.getSettings();
      if (res?.success && res.data) {
        setSettings(res.data);
      }
    } catch (err) {
      console.error("[PlatformSettings] Fetch error:", err);
      showToast("error", "Failed to load platform settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await supremeAdminApi.updateSettings(settings);
      if (res?.success) {
        showToast("success", "Platform settings saved successfully.");
        if (reloadSettings) reloadSettings();
      }
    } catch (err) {
      showToast("error", err.message || "Failed to update settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-page sa-page">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 9999,
            padding: "12px 20px",
            borderRadius: "6px",
            color: "#fff",
            backgroundColor: toastMessage.type === "success" ? "#059669" : "#dc2626",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {toastMessage.text}
        </div>
      )}

      {/* Header */}
      <div className="sa-page-header">
        <div>
          <span className="sa-brand-tag">GLOBAL CONFIGURATION</span>
          <h1 className="sa-page-title">
            Platform <span>Settings</span>
          </h1>
          <p className="sa-page-subtitle">
            Configure system parameters, support routing, and subscription defaults.
          </p>
        </div>
      </div>

      <div className="sa-card sa-card-body" style={{ maxWidth: "680px" }}>
        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <div className="spinner-border text-primary" role="status" />
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label" style={{ fontWeight: 600, fontSize: "14px", color: "#334155" }}>Platform Brand Name</label>
              <input
                type="text"
                className="form-control"
                value={settings.platformName}
                onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
                required
              />
            </div>

            <div className="row mb-3">
              <div className="col-12 col-md-6 mb-3 mb-md-0">
                <label className="form-label" style={{ fontWeight: 600, fontSize: "14px", color: "#334155" }}>Support Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={settings.supportEmail}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                  required
                />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label" style={{ fontWeight: 600, fontSize: "14px", color: "#334155" }}>Support Phone</label>
                <input
                  type="text"
                  className="form-control"
                  value={settings.supportPhone}
                  onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label" style={{ fontWeight: 600, fontSize: "14px", color: "#334155" }}>Default Trial Duration (Days)</label>
              <input
                type="number"
                min="1"
                className="form-control"
                value={settings.defaultTrialDays}
                onChange={(e) => setSettings({ ...settings, defaultTrialDays: Number(e.target.value) })}
                required
              />
            </div>

            <div className="form-check form-switch mb-3">
              <input
                className="form-check-input"
                type="checkbox"
                id="allowSelfReg"
                checked={settings.allowSelfRegistration}
                onChange={(e) => setSettings({ ...settings, allowSelfRegistration: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="allowSelfReg" style={{ fontSize: "14px", fontWeight: 500, color: "#334155" }}>
                Allow Public Client Registration
              </label>
            </div>

            <div className="form-check form-switch mb-4">
              <input
                className="form-check-input"
                type="checkbox"
                id="maintenanceMode"
                checked={settings.maintenanceMode}
                onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="maintenanceMode" style={{ fontSize: "14px", fontWeight: 600, color: settings.maintenanceMode ? "#a63d2f" : "#334155" }}>
                Maintenance Mode
              </label>
            </div>

            <button type="submit" className="sa-btn-primary" disabled={saving}>
              <FaSave />
              {saving ? "Saving Changes..." : "Save Settings"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default PlatformSettings;
