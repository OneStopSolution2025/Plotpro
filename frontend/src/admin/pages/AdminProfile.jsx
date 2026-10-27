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

import { useAdminProfile } from "../context/AdminProfileContext";
import PhoneInputField from "../../components/PhoneInputField";
import { parsePhoneString, formatFullPhone } from "../../utils/phoneUtils";
import "../styles/admin-profile.css";

const MAX_AVATAR_BYTES = 1024 * 1024; // 1 MB

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const AdminProfile = () => {
  const navigate = useNavigate();

  const {
    profile,
    updateProfile,
    updateAvatar,
    removeAvatar,
    updatePassword,
    hasPassword,
  } = useAdminProfile();

  const initialPhoneParsed = parsePhoneString(profile.mobile || "");
  const [countryCode, setCountryCode] = useState(initialPhoneParsed.countryCode);
  const [name, setName] = useState(profile.name);
  const [mobile, setMobile] = useState(initialPhoneParsed.digits);
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
    const trimmedName = name.trim();
    const trimmedMobile = mobile.trim();

    if (!trimmedName) {
      errors.name = "Full name is required.";
    }

    if (!trimmedMobile) {
      errors.mobile = "Mobile number is required.";
    } else if (trimmedMobile.length < 7 || trimmedMobile.length > 12) {
      errors.mobile = "Enter a valid mobile number (e.g. 10 digits).";
    }

    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      return;
    }

    setProfileErrors({});
    setIsSavingProfile(true);
    try {
      const fullMobile = formatFullPhone(countryCode, trimmedMobile);
      await updateProfile({ name: trimmedName, mobile: fullMobile });
      setName(trimmedName);
      setMobile(trimmedMobile);
      flash(setProfileSuccess, "Branch Admin profile saved successfully.");
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

  const updatePasswordField = (field, value) => {
    setPasswords((prev) => ({ ...prev, [field]: value }));
    if (passwordErrors.general || passwordErrors.current) {
      setPasswordErrors({});
    }
  };

  const toggleVisibility = (field) => {
    setVisible((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  return (
    <div className="admin-profile-page">
      <div className="admin-profile-header">
        <button
          type="button"
          className="admin-profile-back"
          onClick={() => navigate("/admin")}
          aria-label="Back to Branch Admin dashboard"
        >
          <FaArrowLeft />
        </button>

        <div className="admin-profile-title-group">
          <span className="admin-profile-kicker">ACCOUNT SETTINGS</span>
          <h1>Branch Admin Profile</h1>
        </div>
      </div>

      <div className="admin-profile-card">
        {/* AVATAR HERO */}
        <div className="admin-avatar-hero">
          <div className="admin-avatar-wrapper">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Branch Admin avatar"
                className="admin-avatar-image"
              />
            ) : (
              <div className="admin-avatar-placeholder" aria-label="Default avatar">
                <FaUser />
              </div>
            )}

            <label
              htmlFor="admin-avatar-input"
              className="admin-avatar-upload-btn"
              title="Upload new photo"
              aria-label="Upload new photo"
            >+
              <input
                id="admin-avatar-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarSelect}
                className="admin-avatar-file-input"
              />
            </label>
          </div>

          <div className="admin-avatar-meta">
            <h2>{name || profile.name}</h2>
            <span className="admin-role-badge">{profile.role || "Branch Administrator"}</span>

            {profile.branch && (
              <span
                className="admin-role-badge"
                style={{
                  background: profile.branch.status === "ACTIVE" ? "#ecfdf5" : "#fef2f2",
                  color: profile.branch.status === "ACTIVE" ? "#047857" : "#b91c1c",
                  border: "1px solid",
                  borderColor: profile.branch.status === "ACTIVE" ? "#a7f3d0" : "#fecaca",
                  marginTop: "6px",
                  fontSize: "12px",
                }}
                title={
                  profile.branch.status === "ACTIVE"
                    ? "You are the Branch Admin of this branch"
                    : "This branch is deactivated — your operational access is paused"
                }
              >
                Branch: {profile.branch.name}
                {profile.branch.city ? ` (${profile.branch.city})` : ""}
                {profile.branch.status === "ACTIVE" ? "" : " — Inactive"}
              </span>
            )}

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
              <label htmlFor="admin-name" className="admin-field-label">
                Full Name <span className="required">*</span>
              </label>

              <input
                id="admin-name"
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
              <label htmlFor="admin-mobile" className="admin-field-label">
                Mobile Number <span className="required">*</span>
              </label>

              <PhoneInputField
                id="admin-mobile"
                name="mobile"
                countryCode={countryCode}
                onCountryCodeChange={(code) => setCountryCode(code)}
                value={mobile}
                onChange={(digits) => {
                  setMobile(digits);
                  setProfileErrors((prev) => ({ ...prev, mobile: undefined }));
                }}
                placeholder="10-digit number"
                maxLength={10}
                error={Boolean(profileErrors.mobile)}
              />

              {profileErrors.mobile && (
                <span className="admin-field-error">{profileErrors.mobile}</span>
              )}
            </div>

            {profile.email && (
              <div className="admin-profile-field">
                <label htmlFor="admin-email" className="admin-field-label">
                  Email
                </label>

                <input
                  id="admin-email"
                  type="email"
                  className="admin-profile-input"
                  value={profile.email}
                  readOnly
                />

                <span className="admin-field-hint">
                  Email is managed by your account settings.
                </span>
              </div>
            )}
          </div>

          <div className="admin-profile-actions">
            <button
              type="button"
              className="admin-secondary-btn"
              onClick={() => navigate("/admin")}
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
                htmlFor="admin-current-password"
                className="admin-field-label"
              >
                Current Password <span className="required">*</span>
              </label>

              <div className="admin-password-input-wrapper">
                <input
                  id="admin-current-password"
                  type={visible.current ? "text" : "password"}
                  className="admin-profile-input"
                  value={passwords.current}
                  onChange={(e) =>
                    updatePasswordField("current", e.target.value)
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
                  onClick={() => toggleVisibility("current")}
                  aria-label={
                    visible.current ? "Hide current password" : "Show current password"
                  }
                >
                  {visible.current ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className="admin-profile-field">
              <label
                htmlFor="admin-new-password"
                className="admin-field-label"
              >
                New Password <span className="required">*</span>
              </label>

              <div className="admin-password-input-wrapper">
                <input
                  id="admin-new-password"
                  type={visible.next ? "text" : "password"}
                  className="admin-profile-input"
                  value={passwords.next}
                  onChange={(e) =>
                    updatePasswordField("next", e.target.value)
                  }
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() => toggleVisibility("next")}
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
                htmlFor="admin-confirm-password"
                className="admin-field-label"
              >
                Confirm New Password <span className="required">*</span>
              </label>

              <div className="admin-password-input-wrapper">
                <input
                  id="admin-confirm-password"
                  type={visible.confirm ? "text" : "password"}
                  className="admin-profile-input"
                  value={passwords.confirm}
                  onChange={(e) =>
                    updatePasswordField("confirm", e.target.value)
                  }
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() => toggleVisibility("confirm")}
                  aria-label={
                    visible.confirm ? "Hide confirmed password" : "Show confirmed password"
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
                onClick={() => navigate("/admin")}
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

export default AdminProfile;
