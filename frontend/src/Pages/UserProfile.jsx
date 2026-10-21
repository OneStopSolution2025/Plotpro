import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  User as UserIcon,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  Heart,
  MapPin,
  Trash2,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  LogOut,
  ChevronRight,
  Shield,
  Layers,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ConfirmationModal from "../admin/components/ConfirmationModal";
import UserAvatar from "../components/UserAvatar";
import { useAuth } from "../context/AuthContext";
import { useProjects, getProjectRouteSlug, findProjectByIdentifier } from "../context/ProjectContext";
import { userApi } from "../services/api";
import "../css/UserProfile.css";

export default function UserProfile() {
  const { user: authUser, setUser: setAuthUser, logout } = useAuth();
  const { projects } = useProjects();
  const navigate = useNavigate();

  // Active Main Tab: "profile" | "wishlist"
  const [activeTab, setActiveTab] = useState("profile");
  // Active Wishlist Subtab: "projects" | "plots"
  const [wishlistSubtab, setWishlistSubtab] = useState("projects");

  // Profile Form State
  const [profileData, setProfileData] = useState({
    name: authUser?.name || "",
    email: authUser?.email || "",
    phone: authUser?.phone || "",
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");

  // Password Form State
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Wishlist State
  const [savedProjects, setSavedProjects] = useState([]);
  const [savedPlots, setSavedPlots] = useState([]);
  const [wishlistLoading, setWishlistLoading] = useState(true);
  const [itemToRemove, setItemToRemove] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Load latest profile & wishlist
  useEffect(() => {
    let isMounted = true;
    const fetchUserData = async () => {
      try {
        const [profileRes, wishlistRes] = await Promise.all([
          userApi.getProfile(),
          userApi.getWishlist(),
        ]);

        if (!isMounted) return;

        if (profileRes?.success && profileRes.data) {
          const u = profileRes.data;
          setProfileData({
            name: u.name || "",
            email: u.email || "",
            phone: u.phone || "",
          });
        }

        if (wishlistRes?.success && wishlistRes.data) {
          setSavedProjects(wishlistRes.data.projects || []);
          setSavedPlots(wishlistRes.data.plots || []);
        }
      } catch (err) {
        console.error("Failed to load user profile or wishlist:", err);
      } finally {
        if (isMounted) setWishlistLoading(false);
      }
    };

    fetchUserData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Update Profile Details
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSuccess("");
    setProfileError("");

    if (!profileData.name.trim()) {
      setProfileError("Full Name is required.");
      return;
    }

    if (!profileData.email.trim()) {
      setProfileError("Email address is required.");
      return;
    }

    setProfileLoading(true);
    try {
      const res = await userApi.updateProfile({
        name: profileData.name,
        email: profileData.email,
        phone: profileData.phone,
      });

      if (res?.success) {
        setProfileSuccess("Profile updated successfully!");
        if (res.data) {
          setAuthUser(res.data);
        }
        setTimeout(() => setProfileSuccess(""), 4000);
      } else {
        setProfileError(res?.message || "Failed to update profile.");
      }
    } catch (err) {
      setProfileError(err.message || "Failed to update profile.");
    } finally {
      setProfileLoading(false);
    }
  };

  // Change Password
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordSuccess("");
    setPasswordError("");

    if (!passwordData.currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }

    if (!passwordData.newPassword) {
      setPasswordError("Please enter your new password.");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await userApi.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });

      if (res?.success) {
        setPasswordSuccess("Password updated successfully!");
        setPasswordData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setTimeout(() => setPasswordSuccess(""), 4000);
      } else {
        setPasswordError(res?.message || "Failed to update password.");
      }
    } catch (err) {
      setPasswordError(err.message || "Failed to change password.");
    } finally {
      setPasswordLoading(false);
    }
  };

  // Remove Project from Wishlist
  const handleRemoveProject = (project) => {
    setItemToRemove({
      type: "project",
      id: project._id || project.customId,
      name: project.title || "Project",
    });
  };

  // Remove Plot from Wishlist
  const handleRemovePlot = (plot) => {
    setItemToRemove({
      type: "plot",
      id: plot._id || plot.customId,
      name: `Plot ${plot.plotNumber || ""}`,
    });
  };

  const confirmRemoveWishlistItem = async () => {
    if (!itemToRemove) return;
    setIsRemoving(true);
    try {
      if (itemToRemove.type === "project") {
        const res = await userApi.toggleSaveProject(itemToRemove.id);
        if (res?.success && !res.saved) {
          setSavedProjects((prev) =>
            prev.filter((p) => p._id !== itemToRemove.id && p.customId !== itemToRemove.id)
          );
        }
      } else {
        const res = await userApi.toggleSavePlot(itemToRemove.id);
        if (res?.success && !res.saved) {
          setSavedPlots((prev) =>
            prev.filter((p) => p._id !== itemToRemove.id && p.customId !== itemToRemove.id)
          );
        }
      }
      setItemToRemove(null);
    } catch (err) {
      console.error("Failed to remove item from wishlist:", err);
    } finally {
      setIsRemoving(false);
    }
  };

  // Logout Handler
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const totalWishlistCount = savedProjects.length + savedPlots.length;

  return (
    <div className="user-profile-page">
      <Navbar />

      <main className="user-profile-container">
        {/* Breadcrumb */}
        <nav className="user-profile-breadcrumb" aria-label="breadcrumb">
          <Link to="/">Home</Link>
          <ChevronRight size={14} />
          <span className="current">My Profile</span>
        </nav>

        {/* Hero Card */}
        <div className="user-profile-header-card">
          <div className="user-profile-info-left">
            <div className="user-profile-avatar-circle">
              <UserAvatar
                src={authUser?.avatar}
                name={authUser?.name}
                alt={authUser?.name || "User profile photo"}
              />
            </div>

            <div className="user-profile-meta">
              <h1>{authUser?.name || "DreamCity User"}</h1>
              <p>{authUser?.email || "No email registered"}</p>
              <div className="user-profile-badges">
                <span className="user-badge role">
                  <Shield size={12} />
                  {authUser?.role || "USER"}
                </span>
                <span className="user-badge status">
                  <CheckCircle size={12} />
                  Active Account
                </span>
              </div>
            </div>
          </div>

          <div className="user-profile-header-actions">
            <button
              type="button"
              className="user-profile-logout-btn"
              onClick={handleLogout}
              title="Sign out of DreamCity"
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="user-profile-tabs">
          <button
            type="button"
            className={`user-tab-btn ${activeTab === "profile" ? "active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            <UserIcon size={18} />
            <span>Profile & Security</span>
          </button>

          <button
            type="button"
            className={`user-tab-btn ${activeTab === "wishlist" ? "active" : ""}`}
            onClick={() => setActiveTab("wishlist")}
          >
            <Heart size={18} />
            <span>My Wishlist</span>
            {totalWishlistCount > 0 && (
              <span className="user-tab-count">{totalWishlistCount}</span>
            )}
          </button>
        </div>

        {/* Tab 1: Profile & Security */}
        {activeTab === "profile" && (
          <div className="profile-security-grid">
            {/* Edit Personal Details */}
            <div className="user-section-card">
              <div className="user-section-title">
                <UserIcon size={20} />
                <h2>Personal Information</h2>
              </div>

              {profileSuccess && (
                <div className="user-alert success">
                  <CheckCircle size={16} />
                  <span>{profileSuccess}</span>
                </div>
              )}

              {profileError && (
                <div className="user-alert error">
                  <AlertCircle size={16} />
                  <span>{profileError}</span>
                </div>
              )}

              <form onSubmit={handleProfileSubmit}>
                <div className="user-form-group">
                  <label htmlFor="user-name">Full Name</label>
                  <div className="user-input-wrapper">
                    <UserIcon size={16} className="user-input-icon" />
                    <input
                      id="user-name"
                      type="text"
                      className="user-form-input"
                      placeholder="Enter your full name"
                      value={profileData.name}
                      onChange={(e) =>
                        setProfileData((prev) => ({ ...prev, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>

                <div className="user-form-group">
                  <label htmlFor="user-email">Email Address</label>
                  <div className="user-input-wrapper">
                    <Mail size={16} className="user-input-icon" />
                    <input
                      id="user-email"
                      type="email"
                      className="user-form-input"
                      placeholder="Enter your email"
                      value={profileData.email}
                      onChange={(e) =>
                        setProfileData((prev) => ({ ...prev, email: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>

                <div className="user-form-group">
                  <label htmlFor="user-phone">Phone Number</label>
                  <div className="user-input-wrapper">
                    <Phone size={16} className="user-input-icon" />
                    <input
                      id="user-phone"
                      type="tel"
                      className="user-form-input"
                      placeholder="Enter 10-digit phone number"
                      value={profileData.phone}
                      onChange={(e) =>
                        setProfileData((prev) => ({ ...prev, phone: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="user-btn-primary"
                  disabled={profileLoading}
                >
                  {profileLoading ? "Updating Profile..." : "Save Changes"}
                </button>
              </form>
            </div>

            {/* Change Password */}
            <div className="user-section-card">
              <div className="user-section-title">
                <Lock size={20} />
                <h2>Security & Password</h2>
              </div>

              {passwordSuccess && (
                <div className="user-alert success">
                  <CheckCircle size={16} />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              {passwordError && (
                <div className="user-alert error">
                  <AlertCircle size={16} />
                  <span>{passwordError}</span>
                </div>
              )}

              <form onSubmit={handlePasswordSubmit}>
                <div className="user-form-group">
                  <label htmlFor="current-password">Current Password</label>
                  <div className="user-input-wrapper">
                    <Lock size={16} className="user-input-icon" />
                    <input
                      id="current-password"
                      type={showPassword.current ? "text" : "password"}
                      className="user-form-input"
                      placeholder="Enter current password"
                      value={passwordData.currentPassword}
                      onChange={(e) =>
                        setPasswordData((prev) => ({
                          ...prev,
                          currentPassword: e.target.value,
                        }))
                      }
                      required
                    />
                    <button
                      type="button"
                      className="user-password-toggle"
                      onClick={() =>
                        setShowPassword((prev) => ({
                          ...prev,
                          current: !prev.current,
                        }))
                      }
                      aria-label="Toggle current password visibility"
                    >
                      {showPassword.current ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="user-form-group">
                  <label htmlFor="new-password">New Password</label>
                  <div className="user-input-wrapper">
                    <Lock size={16} className="user-input-icon" />
                    <input
                      id="new-password"
                      type={showPassword.new ? "text" : "password"}
                      className="user-form-input"
                      placeholder="Min. 6 characters"
                      value={passwordData.newPassword}
                      onChange={(e) =>
                        setPasswordData((prev) => ({
                          ...prev,
                          newPassword: e.target.value,
                        }))
                      }
                      required
                    />
                    <button
                      type="button"
                      className="user-password-toggle"
                      onClick={() =>
                        setShowPassword((prev) => ({ ...prev, new: !prev.new }))
                      }
                      aria-label="Toggle new password visibility"
                    >
                      {showPassword.new ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="user-form-group">
                  <label htmlFor="confirm-password">Confirm New Password</label>
                  <div className="user-input-wrapper">
                    <Lock size={16} className="user-input-icon" />
                    <input
                      id="confirm-password"
                      type={showPassword.confirm ? "text" : "password"}
                      className="user-form-input"
                      placeholder="Confirm new password"
                      value={passwordData.confirmPassword}
                      onChange={(e) =>
                        setPasswordData((prev) => ({
                          ...prev,
                          confirmPassword: e.target.value,
                        }))
                      }
                      required
                    />
                    <button
                      type="button"
                      className="user-password-toggle"
                      onClick={() =>
                        setShowPassword((prev) => ({
                          ...prev,
                          confirm: !prev.confirm,
                        }))
                      }
                      aria-label="Toggle confirm password visibility"
                    >
                      {showPassword.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="user-btn-primary"
                  disabled={passwordLoading}
                >
                  {passwordLoading ? "Updating Password..." : "Update Password"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Tab 2: My Wishlist */}
        {activeTab === "wishlist" && (
          <div className="user-section-card">
            {/* Sub-tabs: Projects vs Plots */}
            <div className="wishlist-subtabs">
              <button
                type="button"
                className={`wishlist-subtab-btn ${
                  wishlistSubtab === "projects" ? "active" : ""
                }`}
                onClick={() => setWishlistSubtab("projects")}
              >
                Saved Projects ({savedProjects.length})
              </button>

              <button
                type="button"
                className={`wishlist-subtab-btn ${
                  wishlistSubtab === "plots" ? "active" : ""
                }`}
                onClick={() => setWishlistSubtab("plots")}
              >
                Saved Plots ({savedPlots.length})
              </button>
            </div>

            {/* Saved Projects View */}
            {wishlistSubtab === "projects" && (
              <div>
                {savedProjects.length === 0 ? (
                  <div className="wishlist-empty">
                    <div className="wishlist-empty-icon">
                      <Heart size={28} />
                    </div>
                    <h3>No Saved Projects Yet</h3>
                    <p>
                      Explore our premium layout projects and click the heart icon to save
                      them for later review.
                    </p>
                    <Link to="/projects" className="wishlist-empty-btn">
                      Explore Projects
                    </Link>
                  </div>
                ) : (
                  <div className="wishlist-grid">
                    {savedProjects.map((project) => {
                      const image =
                        project.images?.[0] ||
                        project.image ||
                        "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&auto=format&fit=crop";

                      return (
                        <div key={project._id || project.customId} className="wishlist-card">
                          <div className="wishlist-card-img-wrap">
                            <img
                              src={image}
                              alt={project.title}
                              className="wishlist-card-img"
                              onError={(e) => {
                                e.currentTarget.src =
                                  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&auto=format&fit=crop";
                              }}
                            />
                            <span className="wishlist-card-badge">
                              {project.availablePlots ?? 0} Plots Available
                            </span>
                          </div>

                          <div className="wishlist-card-body">
                            <h3 className="wishlist-card-title">{project.title}</h3>
                            <div className="wishlist-card-location">
                              <MapPin size={14} />
                              <span>{project.location}</span>
                            </div>

                            <div className="wishlist-card-features">
                              <span>Total: {project.totalPlots || "N/A"} Plots</span>
                              <span>Available: {project.availablePlots || "N/A"}</span>
                            </div>

                            <div className="wishlist-card-price">
                              {project.plotPrice ||
                                (project.priceLakhs ? `₹ ${project.priceLakhs} L` : "Price on request")}
                            </div>

                            <div className="wishlist-card-actions">
                              <Link
                                to={`/project-details/${getProjectRouteSlug(project, projects) || project.slug || project.customId || project._id}`}
                                className="wishlist-view-btn"
                              >
                                <span>View Project</span>
                                <ExternalLink size={14} />
                              </Link>
                              <button
                                type="button"
                                className="wishlist-remove-btn"
                                onClick={() => handleRemoveProject(project)}
                                title="Remove from wishlist"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Saved Plots View */}
            {wishlistSubtab === "plots" && (
              <div>
                {savedPlots.length === 0 ? (
                  <div className="wishlist-empty">
                    <div className="wishlist-empty-icon">
                      <Layers size={28} />
                    </div>
                    <h3>No Saved Plots Yet</h3>
                    <p>
                      Check out individual plot details on project pages and click "Add to
                      Wishlist" to bookmark your favorite plots.
                    </p>
                    <Link to="/projects" className="wishlist-empty-btn">
                      Explore Projects
                    </Link>
                  </div>
                ) : (
                  <div className="wishlist-grid">
                    {savedPlots.map((plot) => {
                      const image =
                        plot.images?.[0] ||
                        plot.image ||
                        "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&auto=format&fit=crop";

                      const projectTitle = plot.projectId?.title || "DreamCity Project";
                      const projectLocation = plot.projectId?.location || "Prime Location";

                      return (
                        <div key={plot._id || plot.customId} className="wishlist-card">
                          <div className="wishlist-card-img-wrap">
                            <img
                              src={image}
                              alt={`Plot #${plot.plotNumber}`}
                              className="wishlist-card-img"
                              onError={(e) => {
                                e.currentTarget.src =
                                  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&auto=format&fit=crop";
                              }}
                            />
                            <span className="wishlist-card-badge">
                              Plot #{plot.plotNumber}
                            </span>
                          </div>

                          <div className="wishlist-card-body">
                            <h3 className="wishlist-card-title">{projectTitle}</h3>
                            <div className="wishlist-card-location">
                              <MapPin size={14} />
                              <span>{projectLocation}</span>
                            </div>

                            <div className="wishlist-card-features">
                              <span>Size: {plot.size || "1200"} sq.ft</span>
                              <span>Facing: {plot.facing || "East"}</span>
                            </div>

                            <div className="wishlist-card-price">
                              {plot.price ? ` ${plot.price}` : "Price on request"}
                            </div>

                            <div className="wishlist-card-actions">
                              {(() => {
                                const parentProj = findProjectByIdentifier(projects, plot.projectId || plot.projectCustomId || plot.projectMongoId);
                                const parentSlug = parentProj ? (getProjectRouteSlug(parentProj, projects) || parentProj.slug || parentProj.id) : null;
                                const plotSlug = plot.plotNumber ? encodeURIComponent(plot.plotNumber) : (plot.customId || plot._id);
                                const plotUrl = parentSlug ? `/plot-details/${parentSlug}/${plotSlug}` : `/plot-details/${plot.customId || plot._id}`;
                                return (
                                  <Link
                                    to={plotUrl}
                                    className="wishlist-view-btn"
                                  >
                                    <span>View Plot</span>
                                    <ExternalLink size={14} />
                                  </Link>
                                );
                              })()}
                              <button
                                type="button"
                                className="wishlist-remove-btn"
                                onClick={() => handleRemovePlot(plot)}
                                title="Remove from wishlist"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />

      {/* CONFIRM REMOVE WISHLIST ITEM */}
      <ConfirmationModal
        isOpen={Boolean(itemToRemove)}
        title={itemToRemove?.type === "project" ? "Remove Project from Wishlist?" : "Remove Plot from Wishlist?"}
        message={`Are you sure you want to remove "${itemToRemove?.name}" from your wishlist?`}
        confirmText="Remove"
        type="danger"
        isLoading={isRemoving}
        onCancel={() => setItemToRemove(null)}
        onConfirm={confirmRemoveWishlistItem}
      />
    </div>
  );
}
