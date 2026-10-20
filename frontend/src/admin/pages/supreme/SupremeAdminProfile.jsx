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
  FaShieldAlt,
} from "react-icons/fa";

import { useAuth } from "../../../context/AuthContext";
import { userApi } from "../../../services/api";
import CustomDropdown from "../../components/CustomDropdown";
import "../../styles/super-admin-profile.css";

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
  // Fallback: extract last 10 digits as number
  const allDigits = rawPhone.replace(/\D/g, "");
  return { countryCode: "+91", digits: allDigits.slice(-10) };
};

const SupremeAdminProfile = () => {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  const initialPhone = parsePhoneString(user?.phone || "");
  const [name, setName] = useState(user?.name || "Platform Owner");
  const [countryCode, setCountryCode] = useState(initialPhone.countryCode);
  const [mobile, setMobile] = useState(initialPhone.digits);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || "");

  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.phone !== undefined) {
      const parsed = parsePhoneString(user.phone || "");
      setCountryCode(parsed.countryCode);
      setMobile(parsed.digits);
    }
    if (user?.avatar !== undefined) setAvatarPreview(user.avatar || "");
  }, [user]);

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState({});
  const [profileSuccess, setProfileSuccess] = useState("");
  const [avatarError, setAvatarError] = useState("");

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
    window.setTimeout(() => setter(""), 4000);
  };

  const handleAvatarSelect = async (event) => {
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
    reader.onloadend = async () => {
      const dataUrl = reader.result;
      setAvatarPreview(dataUrl);
      try {
        const res = await userApi.updateProfile({ avatar: dataUrl });
        if (res?.success) {
          setUser((prev) => ({ ...prev, avatar: dataUrl }));
          flash(setProfileSuccess, "Avatar updated successfully.");
        }
      } catch (err) {
        setAvatarError(err.message || "Failed to save avatar image.");
      }
    };
    reader.onerror = () => {
      setAvatarError("Failed to read image file. Please try another.");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    try {
      const res = await userApi.updateProfile({ avatar: "" });
      if (res?.success) {
        setAvatarPreview("");
        setUser((prev) => ({ ...prev, avatar: "" }));
        flash(setProfileSuccess, "Avatar removed.");
      }
    } catch (err) {
      setAvatarError(err.message || "Failed to remove avatar.");
    }
  };

  const handleMobileChange = (e) => {
    // Keep only numbers and restrict to max 10 digits
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 10);
    setMobile(digitsOnly);
    setProfileErrors((prev) => ({ ...prev, mobile: undefined }));
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedMobile = mobile.trim();

    const nextErrors = {};
    if (!trimmedName) {
      nextErrors.name = "Platform Owner name is required.";
    }

    if (trimmedMobile && trimmedMobile.length !== 10) {
      nextErrors.mobile = "Mobile number must be exactly 10 digits.";
    }

    setProfileErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSavingProfile(true);
    try {
      const fullPhone = trimmedMobile ? `${countryCode} ${trimmedMobile}` : "";
      const res = await userApi.updateProfile({
        name: trimmedName,
        phone: fullPhone,
      });

      if (res?.success && res.data) {
        setUser((prev) => ({
          ...prev,
          name: res.data.name,
          phone: res.data.phone,
        }));
        flash(setProfileSuccess, "Supreme Administrator profile updated successfully.");
      } else {
        setProfileErrors({ form: res?.message || "Failed to update profile." });
      }
    } catch (err) {
      setProfileErrors({ form: err.message || "Failed to update profile." });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSavePassword = async (event) => {
    event.preventDefault();

    const nextErrors = {};
    if (!passwords.current) {
      nextErrors.current = "Current password is required.";
    }

    if (!passwords.next) {
      nextErrors.next = "New password is required.";
    } else if (passwords.next.length < 6) {
      nextErrors.next = "Password must be at least 6 characters.";
    }

    if (passwords.next !== passwords.confirm) {
      nextErrors.confirm = "New passwords do not match.";
    }

    setPasswordErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      const res = await userApi.changePassword({
        currentPassword: passwords.current,
        newPassword: passwords.next,
      });

      if (res?.success) {
        flash(setPasswordSuccess, "Password updated successfully.");
        setPasswords({ current: "", next: "", confirm: "" });
      } else {
        setPasswordErrors({ form: res?.message || "Failed to update password." });
      }
    } catch (err) {
      setPasswordErrors({ form: err.message || "Failed to update password." });
    }
  };

  return (
    <div className="super-admin-profile-page">
      {/* Header */}
      <div className="admin-profile-header">
        <button
          type="button"
          className="admin-profile-back"
          onClick={() => navigate("/supreme-admin")}
          aria-label="Back to dashboard"
        >
          <FaArrowLeft />
        </button>

        <div className="admin-profile-title-group">
          <span className="admin-profile-kicker">PLATFORM OWNER</span>
          <h1>Supreme Administrator Profile</h1>
          <p>Manage your master platform credentials and security settings.</p>
        </div>
      </div>

      {/* Main Profile Card */}
      <div className="admin-profile-card">
        {/* AVATAR HERO */}
        <div className="admin-avatar-hero">
          <div className="admin-avatar-wrapper">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Supreme Admin Avatar"
                className="admin-avatar-image"
              />
            ) : (
              <div className="admin-avatar-placeholder" aria-label="Default avatar">
                <FaUser />
              </div>
            )}

            <label
              htmlFor="supreme-avatar-input"
              className="admin-avatar-upload-btn"
              title="Upload new photo"
              aria-label="Upload new photo"
            >
              +
              <input
                id="supreme-avatar-input"
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(",")}
                onChange={handleAvatarSelect}
                className="admin-avatar-file-input"
              />
            </label>
          </div>

          <div className="admin-avatar-meta">
            <h2>{user?.name || "Platform Owner"}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "2px" }}>
              <span className="admin-role-badge">
                <FaShieldAlt style={{ marginRight: "4px" }} /> Supreme Administrator
              </span>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                (Master Platform Owner)
              </span>
            </div>

            {avatarPreview && (
              <button
                type="button"
                className="admin-avatar-remove-btn"
                onClick={handleRemoveAvatar}
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

        {/* FEEDBACK BANNERS */}
        {profileSuccess && (
          <div className="admin-alert admin-alert-success">
            <FaCheckCircle />
            {profileSuccess}
          </div>
        )}

        {profileErrors.form && (
          <div className="admin-alert admin-alert-error" role="alert">
            {profileErrors.form}
          </div>
        )}

        {/* PERSONAL & ACCOUNT INFORMATION */}
        <form className="admin-profile-form" onSubmit={handleSaveProfile} noValidate>
          <div className="admin-profile-section">
            <h3 className="admin-section-title">Account Details</h3>

            <div className="admin-profile-field">
              <label htmlFor="supreme-name" className="admin-field-label">
                Full Name <span className="required">*</span>
              </label>
              <input
                id="supreme-name"
                type="text"
                className={`admin-profile-input ${profileErrors.name ? "error" : ""}`}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setProfileErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder="Platform Owner"
              />
              {profileErrors.name && (
                <span className="admin-field-error">{profileErrors.name}</span>
              )}
            </div>

            <div className="admin-profile-field">
              <label htmlFor="supreme-email" className="admin-field-label">
                Email Address
              </label>
              <input
                id="supreme-email"
                type="email"
                className="admin-profile-input"
                value={user?.email || ""}
                readOnly
              />
              <span className="admin-field-hint">
                Email address identifies your master platform account and cannot be modified.
              </span>
            </div>

            <div className="admin-profile-field">
              <label htmlFor="supreme-mobile" className="admin-field-label">
                Mobile Number
              </label>
              <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                <div style={{ width: "130px" }}>
                  <CustomDropdown
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    placeholder="+91"
                  >
                    {COUNTRY_CODES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.flag} {item.code}
                      </option>
                    ))}
                  </CustomDropdown>
                </div>

                <div style={{ flex: 1, position: "relative" }}>
                  <input
                    id="supreme-mobile"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    className={`admin-profile-input ${profileErrors.mobile ? "error" : ""}`}
                    value={mobile}
                    onChange={handleMobileChange}
                    placeholder="10-digit number"
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
          </div>

          <div className="admin-profile-actions">
            <button
              type="button"
              className="admin-secondary-btn"
              onClick={() => navigate("/supreme-admin")}
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

        {/* PASSWORD & SECURITY SECTION */}
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

          {passwordErrors.form && (
            <div className="admin-alert admin-alert-error" role="alert">
              {passwordErrors.form}
            </div>
          )}

          <form className="admin-profile-form" onSubmit={handleSavePassword} noValidate>
            <div className="admin-profile-field">
              <label htmlFor="supreme-current-password" className="admin-field-label">
                Current Password <span className="required">*</span>
              </label>
              <div className="admin-password-input-wrapper">
                <input
                  id="supreme-current-password"
                  type={visible.current ? "text" : "password"}
                  className={`admin-profile-input ${passwordErrors.current ? "error" : ""}`}
                  value={passwords.current}
                  onChange={(e) =>
                    setPasswords((prev) => ({ ...prev, current: e.target.value }))
                  }
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() =>
                    setVisible((prev) => ({ ...prev, current: !prev.current }))
                  }
                  aria-label={visible.current ? "Hide password" : "Show password"}
                >
                  {visible.current ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              {passwordErrors.current && (
                <span className="admin-field-error">{passwordErrors.current}</span>
              )}
            </div>

            <div className="admin-profile-field">
              <label htmlFor="supreme-new-password" className="admin-field-label">
                New Password <span className="required">*</span>
              </label>
              <div className="admin-password-input-wrapper">
                <input
                  id="supreme-new-password"
                  type={visible.next ? "text" : "password"}
                  className={`admin-profile-input ${passwordErrors.next ? "error" : ""}`}
                  value={passwords.next}
                  onChange={(e) =>
                    setPasswords((prev) => ({ ...prev, next: e.target.value }))
                  }
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() =>
                    setVisible((prev) => ({ ...prev, next: !prev.next }))
                  }
                  aria-label={visible.next ? "Hide new password" : "Show new password"}
                >
                  {visible.next ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              {passwordErrors.next && (
                <span className="admin-field-error">{passwordErrors.next}</span>
              )}
            </div>

            <div className="admin-profile-field">
              <label htmlFor="supreme-confirm-password" className="admin-field-label">
                Confirm New Password <span className="required">*</span>
              </label>
              <div className="admin-password-input-wrapper">
                <input
                  id="supreme-confirm-password"
                  type={visible.confirm ? "text" : "password"}
                  className={`admin-profile-input ${passwordErrors.confirm ? "error" : ""}`}
                  value={passwords.confirm}
                  onChange={(e) =>
                    setPasswords((prev) => ({ ...prev, confirm: e.target.value }))
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
                  aria-label={visible.confirm ? "Hide confirmed password" : "Show confirmed password"}
                >
                  {visible.confirm ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              {passwordErrors.confirm && (
                <span className="admin-field-error">{passwordErrors.confirm}</span>
              )}
            </div>

            <div className="admin-profile-actions">
              <button
                type="button"
                className="admin-secondary-btn"
                onClick={() => navigate("/supreme-admin")}
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

export default SupremeAdminProfile;
