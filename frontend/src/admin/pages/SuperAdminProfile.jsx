import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaUser,
  FaTrashAlt,
  FaSave,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaArrowLeft,
  FaCheckCircle,
} from "react-icons/fa";

import { useSuperAdminProfile } from "../context/SuperAdminProfileContext";
import "../styles/super-admin-profile.css";

const MAX_AVATAR_BYTES = 1024 * 1024; // 1 MB

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const COUNTRY_CODES = [
  { code: "+91", label: "India (+91)", flag: "🇮🇳" },
  { code: "+1", label: "USA / Canada (+1)", flag: "🇺🇸" },
  { code: "+44", label: "UK (+44)", flag: "🇬🇧" },
  { code: "+60", label: "Malaysia (+60)", flag: "🇲🇾" },
  { code: "+65", label: "Singapore (+65)", flag: "🇸🇬" },
  { code: "+971", label: "UAE (+971)", flag: "🇦🇪" },
  { code: "+966", label: "Saudi Arabia (+966)", flag: "🇸🇦" },
  { code: "+61", label: "Australia (+61)", flag: "🇦🇺" },
  { code: "+49", label: "Germany (+49)", flag: "🇩🇪" },
  { code: "+33", label: "France (+33)", flag: "🇫🇷" },
];

const parsePhoneString = (rawPhone = "") => {
  if (!rawPhone) return { countryCode: "+91", digits: "" };
  const matched = COUNTRY_CODES.find((c) => rawPhone.startsWith(c.code));
  if (matched) {
    const remaining = rawPhone.slice(matched.code.length).replace(/\D/g, "").slice(0, 10);
    return { countryCode: matched.code, digits: remaining };
  }
  const allDigits = rawPhone.replace(/\D/g, "");
  return { countryCode: "+91", digits: allDigits.slice(-10) };
};

const SuperAdminProfile = () => {
  const navigate = useNavigate();

  const {
    profile,
    updateProfile,
    updateAvatar,
    removeAvatar,
    updatePassword,
    hasPassword,
  } = useSuperAdminProfile();

  const initialPhone = parsePhoneString(profile.mobile || "");
  const [name, setName] = useState(profile.name);
  const [countryCode, setCountryCode] = useState(initialPhone.countryCode);
  const [mobile, setMobile] = useState(initialPhone.digits);
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar || "");
  const [avatarError, setAvatarError] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState({});
  const [profileSuccess, setProfileSuccess] = useState("");

  useEffect(() => {
    if (profile.name) setName(profile.name);
    if (profile.mobile !== undefined) {
      const parsed = parsePhoneString(profile.mobile || "");
      setCountryCode(parsed.countryCode);
      setMobile(parsed.digits);
    }
    if (profile.avatar !== undefined) setAvatarPreview(profile.avatar || "");
  }, [profile.name, profile.mobile, profile.avatar]);

  const [passwords, setPasswords] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const [visible, setVisible] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const flash = (setter, message) => {
    setter(message);
    window.setTimeout(() => setter(""), 3000);
  };

  const handleAvatarSelect = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setAvatarError("Please select a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Avatar image must be under 1 MB.");
      return;
    }

    setAvatarError("");

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      setAvatarPreview(dataUrl);
      updateAvatar(dataUrl);
      flash(setProfileSuccess, "Avatar updated successfully.");
    };
    reader.onerror = () => {
      setAvatarError("Failed to read image file. Please try another.");
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarRemove = () => {
    setAvatarPreview("");
    setAvatarError("");
    removeAvatar();
    flash(setProfileSuccess, "Avatar removed.");
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();

    const errors = {};
    if (!name.trim()) {
      errors.name = "Full name is required.";
    }

    const trimmedMobile = mobile.trim();
    if (trimmedMobile && trimmedMobile.length !== 10) {
      errors.mobile = "Mobile number must be exactly 10 digits.";
    }

    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      return;
    }

    setProfileErrors({});
    setIsSavingProfile(true);
    try {
      const fullPhone = trimmedMobile ? `${countryCode} ${trimmedMobile}` : "";
      await updateProfile({ name: name.trim(), mobile: fullPhone });
      flash(setProfileSuccess, "Super Admin profile saved successfully.");
    } catch (err) {
      setProfileErrors({ general: err.message || "Failed to update profile." });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    const result = await updatePassword(
      passwords.current,
      passwords.next,
      passwords.confirm
    );

    if (!result.success) {
      setPasswordErrors({ general: result.error });
      return;
    }

    setPasswordErrors({});
    setPasswords({ current: "", next: "", confirm: "" });
    flash(setPasswordSuccess, "Password updated successfully. Please use your new password next time you log in.");
  };

  return (
    <div className="super-admin-profile-page">
      <div className="admin-profile-header">
        <button
          type="button"
          className="admin-profile-back"
          onClick={() => navigate("/super-admin")}
          aria-label="Back to Super Admin dashboard"
        >
          <FaArrowLeft />
        </button>

        <div className="admin-profile-title-group">
          <span className="admin-profile-kicker">ACCOUNT SETTINGS</span>
          <h1>Super Admin Profile</h1>
        </div>
      </div>

      <div className="admin-profile-card">
        {/* AVATAR HERO */}
        <div className="admin-avatar-hero">
          <div className="admin-avatar-wrapper">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Super Admin avatar"
                className="admin-avatar-image"
              />
            ) : (
              <div className="admin-avatar-placeholder" aria-label="Default avatar">
                <FaUser />
              </div>
            )}

            <label
              htmlFor="superadmin-avatar-input"
              className="admin-avatar-upload-btn"
              title="Upload new photo"
              aria-label="Upload new photo"
            >+
              <input
                id="superadmin-avatar-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarSelect}
                className="admin-avatar-file-input"
              />
            </label>
          </div>

          <div className="admin-avatar-meta">
            <h2>{profile.name}</h2>
            <span className="admin-role-badge">{profile.role || "Super Administrator"}</span>
            
            {avatarPreview && (
              <button
                type="button"
                className="admin-avatar-remove-btn"
                onClick={handleAvatarRemove}
              >
                <FaTrashAlt />
                Remove Photo
              </button>
            )}

            {avatarError && (
              <span className="admin-avatar-error" role="alert">
                {avatarError}
              </span>
            )}
          </div>
        </div>

        {profileSuccess && (
          <div className="admin-alert admin-alert-success">
            <FaCheckCircle />
            {profileSuccess}
          </div>
        )}

        {/* PERSONAL INFORMATION */}
        <form
          className="admin-profile-form"
          onSubmit={handleProfileSubmit}
          noValidate
        >
          <div className="admin-profile-section">
            <h3 className="admin-section-title">Personal Information</h3>

            <div className="admin-profile-field">
              <label htmlFor="superadmin-name" className="admin-field-label">
                Full Name <span className="required">*</span>
              </label>

              <input
                id="superadmin-name"
                type="text"
                className={
                  profileErrors.name
                    ? "admin-profile-input error"
                    : "admin-profile-input"
                }
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setProfileErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder="Enter your full name"
                autoComplete="name"
              />

              {profileErrors.name && (
                <span className="admin-field-error">{profileErrors.name}</span>
              )}
            </div>

            <div className="admin-profile-field">
              <label htmlFor="superadmin-mobile" className="admin-field-label">
                Mobile Number
              </label>

              <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  style={{
                    height: "42px",
                    padding: "0 10px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    background: "#f8fafc",
                    color: "#0f172a",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                    minWidth: "125px",
                  }}
                  aria-label="Country phone code"
                >
                  {COUNTRY_CODES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.flag} {item.code}
                    </option>
                  ))}
                </select>

                <div style={{ flex: 1, position: "relative" }}>
                  <input
                    id="superadmin-mobile"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    className={`admin-profile-input ${profileErrors.mobile ? "error" : ""}`}
                    value={mobile}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setMobile(digitsOnly);
                      setProfileErrors((prev) => ({ ...prev, mobile: undefined }));
                    }}
                    placeholder="10-digit number"
                    autoComplete="tel"
                  />
                </div>
              </div>
              <span className="admin-field-hint">
                Select your country code and enter a 10-digit mobile number.
              </span>
              {profileErrors.mobile && (
                <span className="admin-field-error">{profileErrors.mobile}</span>
              )}
            </div>

            <div className="admin-profile-field">
              <label htmlFor="superadmin-email" className="admin-field-label">
                Email
              </label>

              <input
                id="superadmin-email"
                type="email"
                className="admin-profile-input"
                value={profile.email}
                readOnly
              />
            </div>
          </div>

          <div className="admin-profile-actions">
            <button
              type="button"
              className="admin-secondary-btn"
              onClick={() => navigate("/super-admin")}
            >
              <FaArrowLeft />
              Back
            </button>

            <button type="submit" className="admin-primary-btn" disabled={isSavingProfile}>
              <FaSave />
              {isSavingProfile ? "Saving Profile..." : "Save Profile"}
            </button>
          </div>
        </form>

        {/* PASSWORD & SECURITY */}
        <div className="admin-profile-section admin-profile-section-divided">
          <h3 className="admin-section-title">
            <FaLock />
            Password &amp; Security
          </h3>

          {passwordSuccess && (
            <div className="admin-alert admin-alert-success">
              <FaCheckCircle />
              {passwordSuccess}
            </div>
          )}

          {passwordErrors.general && (
            <div className="admin-alert admin-alert-error" role="alert">
              {passwordErrors.general}
            </div>
          )}

          <form
            className="admin-profile-form"
            onSubmit={handlePasswordSubmit}
            noValidate
          >
            <div className="admin-profile-field">
              <label
                htmlFor="superadmin-current-password"
                className="admin-field-label"
              >
                Current Password <span className="required">*</span>
              </label>

              <div className="admin-password-input-wrapper">
                <input
                  id="superadmin-current-password"
                  type={visible.current ? "text" : "password"}
                  className="admin-profile-input"
                  value={passwords.current}
                  onChange={(e) =>
                    setPasswords((prev) => ({ ...prev, current: e.target.value }))
                  }
                  placeholder={
                    hasPassword
                      ? "Enter your current password"
                      : "choose any current password"
                  }
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() =>
                    setVisible((prev) => ({ ...prev, current: !prev.current }))
                  }
                  aria-label={
                    visible.current
                      ? "Hide current password"
                      : "Show current password"
                  }
                >
                  {visible.current ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className="admin-profile-field">
              <label
                htmlFor="superadmin-new-password"
                className="admin-field-label"
              >
                New Password <span className="required">*</span>
              </label>

              <div className="admin-password-input-wrapper">
                <input
                  id="superadmin-new-password"
                  type={visible.next ? "text" : "password"}
                  className="admin-profile-input"
                  value={passwords.next}
                  onChange={(e) =>
                    setPasswords((prev) => ({ ...prev, next: e.target.value }))
                  }
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() =>
                    setVisible((prev) => ({ ...prev, next: !prev.next }))
                  }
                  aria-label={
                    visible.next ? "Hide new password" : "Show new password"
                  }
                >
                  {visible.next ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className="admin-profile-field">
              <label
                htmlFor="superadmin-confirm-password"
                className="admin-field-label"
              >
                Confirm New Password <span className="required">*</span>
              </label>

              <div className="admin-password-input-wrapper">
                <input
                  id="superadmin-confirm-password"
                  type={visible.confirm ? "text" : "password"}
                  className="admin-profile-input"
                  value={passwords.confirm}
                  onChange={(e) =>
                    setPasswords((prev) => ({
                      ...prev,
                      confirm: e.target.value,
                    }))
                  }
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() =>
                    setVisible((prev) => ({ ...prev, confirm: !prev.confirm }))
                  }
                  aria-label={
                    visible.confirm
                      ? "Hide confirmed password"
                      : "Show confirmed password"
                  }
                >
                  {visible.confirm ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className="admin-profile-actions">
              <button
                type="button"
                className="admin-secondary-btn"
                onClick={() => navigate("/super-admin")}
              >
                <FaArrowLeft />
                Back
              </button>

              <button type="submit" className="admin-primary-btn">
                <FaLock />
                Update Password
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminProfile;
