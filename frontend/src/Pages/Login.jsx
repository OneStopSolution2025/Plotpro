import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    Mail,
    Lock,
    Eye,
    EyeOff,
    ShieldCheck,
    RefreshCw,
    AlertCircle,
    CheckCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { authApi, setAuthToken } from "../services/api";
import GoogleAuthButton from "../components/GoogleAuthButton";

import "../css/Login.css";
import loginImage from "../assets/bg-image.webp";

const Login = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [infoMsg, setInfoMsg] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login, loginWithGoogle, isAuthenticated, user, setUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // ─── Flow States ───
    // Steps: 'credentials' | 'deviceOtp' | 'pendingApproval'
    const [authStep, setAuthStep] = useState("credentials");
    const [pendingEmail, setPendingEmail] = useState("");
    const [maskedEmail, setMaskedEmail] = useState("");
    const [enrollmentOtp, setEnrollmentOtp] = useState("");
    const [resendCooldown, setResendCooldown] = useState(0);
    const [enrollmentChallengeId, setEnrollmentChallengeId] = useState("");
    const [isTransferFlow, setIsTransferFlow] = useState(false);
    const [deviceLabel, setDeviceLabel] = useState("");
    const [currentDeviceLabel, setCurrentDeviceLabel] = useState("");
    const [pollingToken, setPollingToken] = useState("");
    const [pollStatus, setPollStatus] = useState("PENDING_APPROVAL");

    // Cooldown countdown timer
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => setResendCooldown((prev) => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    // Polling effect for pending device approval screen
    useEffect(() => {
        if (authStep !== "pendingApproval" || !pollingToken) return;

        let isClaiming = false;
        const interval = setInterval(async () => {
            if (isClaiming) return;
            try {
                const res = await authApi.getDeviceRequestStatus(pollingToken);
                if (res?.success) {
                    setPollStatus(res.status);
                    if (res.status === "APPROVED_PENDING_CLAIM") {
                        isClaiming = true;
                        clearInterval(interval);
                        setInfoMsg("Transfer approved by Supreme Admin! Establishing secure session...");

                        // Secure one-time cryptographic claim using candidate credential cookie
                        try {
                            const claimRes = await authApi.claimApprovedSession(pollingToken);
                            if (claimRes?.success && claimRes.token) {
                                setAuthToken(claimRes.token);
                                if (setUser && claimRes.user) {
                                    setUser(claimRes.user);
                                }
                                handleRedirect(claimRes.user?.role);
                            } else {
                                throw new Error(claimRes?.message || "Failed to establish workstation session.");
                            }
                        } catch (claimErr) {
                            setError(claimErr.message || "Failed to claim approved session.");
                        }
                    } else if (res.status === "REJECTED") {
                        clearInterval(interval);
                        setError("Your device transfer request was rejected by Supreme Administration.");
                    } else if (res.status === "EXPIRED") {
                        clearInterval(interval);
                        setError("Your device transfer request has expired. Please log in again to request approval.");
                    }
                }
            } catch (err) {
                console.warn("[DevicePoll] Status check error:", err.message);
            }
        }, 3500);

        return () => clearInterval(interval);
    }, [authStep, pollingToken]);

    // If already authenticated, redirect to appropriate role dashboard
    useEffect(() => {
        if (isAuthenticated && user?.role) {
            handleRedirect(user.role);
        }
    }, [isAuthenticated, user]);

    const [formData, setFormData] = useState({
        email: "",
        password: "",
        remember: false,
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const handleRedirect = (userRole) => {
        const fromPath = location.state?.from?.pathname;
        let redirectPath = "/";
        if (userRole === "SUPREME_ADMIN") {
            redirectPath = fromPath && fromPath.startsWith("/supreme-admin") ? fromPath : "/supreme-admin";
        } else if (userRole === "SUPER_ADMIN") {
            redirectPath = fromPath && fromPath.startsWith("/super-admin") ? fromPath : "/super-admin";
        } else if (userRole === "ADMIN") {
            redirectPath = fromPath && fromPath.startsWith("/admin") ? fromPath : "/admin";
        } else {
            redirectPath =
                fromPath &&
                !fromPath.startsWith("/admin") &&
                !fromPath.startsWith("/super-admin") &&
                !fromPath.startsWith("/supreme-admin")
                    ? fromPath
                    : "/";
        }
        navigate(redirectPath, { replace: true });
    };

    const handleAuthResult = (result) => {
        if (result?.success && result?.token) {
            handleRedirect(result.user?.role);
            return;
        }

        if (result?.requiresDeviceOtp || result?.requiresFirstDeviceEnrollmentOtp) {
            setPendingEmail(result.email);
            setMaskedEmail(result.maskedEmail || result.email);
            setEnrollmentChallengeId(result.challengeId);
            setIsTransferFlow(Boolean(result.isTransfer));
            setResendCooldown(60);
            setAuthStep("deviceOtp");
            setError("");
            setIsSubmitting(false);
            return;
        }

        if (result?.requiresTransferApproval) {
            setPollingToken(result.statusPollingToken);
            setDeviceLabel(result.deviceLabel || "Candidate Workstation");
            setCurrentDeviceLabel(result.currentDeviceLabel || "Existing Approved Workstation");
            setPollStatus("PENDING_APPROVAL");
            setAuthStep("pendingApproval");
            setError("");
            setIsSubmitting(false);
            return;
        }

        if (result?.requiresDeviceRecovery) {
            setError(
                "Your previous workstation registration has been revoked. Please contact your Supreme Administrator to submit a device transfer request."
            );
            return;
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setInfoMsg("");
        setIsSubmitting(true);

        try {
            const result = await login(formData.email, formData.password);
            handleAuthResult(result);
        } catch (err) {
            setError(err.message || "Invalid email or password");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ─── Step B: Verify Device Email OTP (Enrollment or Transfer Staging) ───
    const handleVerifyDeviceOtp = async (e) => {
        e.preventDefault();
        setError("");
        setIsSubmitting(true);

        try {
            const res = await authApi.verifyDeviceOtp({
                email: pendingEmail,
                challengeId: enrollmentChallengeId,
                otp: enrollmentOtp.trim(),
            });

            if (res?.success) {
                if (res.token) {
                    // First-device bootstrap: direct login!
                    setAuthToken(res.token);
                    if (setUser && res.user) {
                        setUser(res.user);
                    }
                    handleRedirect(res.user?.role);
                } else if (res.requiresTransferApproval) {
                    // Device transfer: staged and awaiting Supreme Admin approval
                    setPollingToken(res.statusPollingToken);
                    setDeviceLabel(res.deviceLabel || "Candidate Workstation");
                    setCurrentDeviceLabel(res.currentDeviceLabel || "Existing Approved Workstation");
                    setPollStatus("PENDING_APPROVAL");
                    setAuthStep("pendingApproval");
                }
            } else {
                throw new Error(res?.message || "Invalid verification code.");
            }
        } catch (err) {
            setError(err.message || "Failed to verify security code.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResendOtp = async () => {
        if (resendCooldown > 0) return;
        setError("");
        try {
            const res = await authApi.resendEnrollmentOtp({
                email: pendingEmail,
                challengeId: enrollmentChallengeId,
            });
            if (res?.success) {
                setEnrollmentChallengeId(res.challengeId);
                setResendCooldown(60);
                setInfoMsg("A fresh enrollment code has been dispatched to your email address.");
            }
        } catch (err) {
            setError(err.message || "Failed to resend code.");
        }
    };

    const handleGoogleSuccess = async (credential) => {
        setError("");
        setIsSubmitting(true);
        try {
            const result = await loginWithGoogle(credential);
            handleAuthResult(result);
        } catch (err) {
            setError(err.message || "Google authentication failed.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="login-page">
            <div className="login-wrapper">
                <Link to="/" className="back-btn" title="Back to website">
                    <ArrowLeft size={18} />
                </Link>

                {/* LEFT — FORM */}
                <section className="login-form-section">
                    <div className="login-form-content">
                        <div className="login-heading">
                            <h1>
                                {authStep === "deviceOtp" ? (
                                    <>Verify <span>Device</span></>
                                ) : authStep === "pendingApproval" ? (
                                    <>Awaiting <span>Approval</span></>
                                ) : (
                                    <>Welcome <span>Back</span></>
                                )}
                            </h1>
                            <p>
                                {authStep === "deviceOtp"
                                    ? "Enter the verification code dispatched to your registered email."
                                    : authStep === "pendingApproval"
                                    ? "Your workstation transfer request is awaiting Supreme Administrator review."
                                    : "Enter your credentials to access your PlotPro dashboard."}
                            </p>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="login-alert error" role="alert">
                                <AlertCircle size={18} />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Info Message */}
                        {infoMsg && (
                            <div className="login-alert info" role="status" style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>
                                <CheckCircle size={18} />
                                <span>{infoMsg}</span>
                            </div>
                        )}

                        {/* ──────────────── STEP A: Normal Credentials Login ──────────────── */}
                        {authStep === "credentials" && (
                            <>
                                <GoogleAuthButton
                                    onSuccess={handleGoogleSuccess}
                                    onError={(msg) => setError(msg)}
                                    buttonText="Continue with Google"
                                    disabled={isSubmitting}
                                />

                                <div className="login-divider">
                                    <span>or sign in with email</span>
                                </div>

                                <form className="login-form" onSubmit={handleSubmit}>
                                    <div className="login-form-group">
                                        <label htmlFor="login-email">Email Address<span>*</span></label>
                                        <div className="login-input-wrapper">
                                            <Mail size={18} />
                                            <input
                                                id="login-email"
                                                type="email"
                                                name="email"
                                                placeholder="you@domain.com"
                                                autoComplete="email"
                                                value={formData.email}
                                                onChange={handleChange}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="login-form-group">
                                        <div className="login-password-label">
                                            <label htmlFor="login-password">Password<span>*</span></label>
                                            <Link to="/forgot-password">Forgot password?</Link>
                                        </div>
                                        <div className="login-input-wrapper">
                                            <Lock size={18} />
                                            <input
                                                id="login-password"
                                                type={showPassword ? "text" : "password"}
                                                name="password"
                                                placeholder="Enter your password"
                                                autoComplete="current-password"
                                                value={formData.password}
                                                onChange={handleChange}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="login-password-toggle"
                                                onClick={() => setShowPassword((prev) => !prev)}
                                            >
                                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>

                                    <label className="login-remember">
                                        <input
                                            type="checkbox"
                                            name="remember"
                                            checked={formData.remember}
                                            onChange={handleChange}
                                        />
                                        <span>Remember me</span>
                                    </label>

                                    <button type="submit" className="login-submit" disabled={isSubmitting}>
                                        <span>{isSubmitting ? "Validating..." : "Log In"}</span>
                                        <ArrowRight size={18} />
                                    </button>
                                </form>

                                <p className="signup-link-text">
                                    Don't have an account? <Link to="/signup">Sign up</Link>
                                </p>
                            </>
                        )}

                        {/* ──────────────── STEP B: Device Email OTP (Enrollment or Transfer) ──────────────── */}
                        {authStep === "deviceOtp" && (
                            <form className="login-form" onSubmit={handleVerifyDeviceOtp}>
                                <div className="login-step-card">
                                    <div className="login-step-icon-wrap">
                                        <ShieldCheck size={28} />
                                    </div>
                                    <h3>{isTransferFlow ? "Device Transfer Verification" : "Workstation Enrollment"}</h3>
                                    <p>
                                        {isTransferFlow
                                            ? <>Enter the 6-digit verification code sent to <strong>{maskedEmail}</strong> to request Supreme Admin transfer approval for this workstation.</>
                                            : <>Enter the 6-digit verification code sent to <strong>{maskedEmail}</strong> to link and approve this workstation.</>}
                                    </p>
                                </div>

                                <div className="login-form-group">
                                    <label htmlFor="enrollment-otp">6-Digit Security Code<span>*</span></label>
                                    <div className="login-input-wrapper">
                                        <input
                                            id="enrollment-otp"
                                            className="login-otp-input"
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]{6}"
                                            maxLength={6}
                                            placeholder="123456"
                                            value={enrollmentOtp}
                                            onChange={(e) => setEnrollmentOtp(e.target.value.replace(/\D/g, ""))}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="login-step-actions">
                                    <button
                                        type="button"
                                        className="login-resend-btn"
                                        onClick={handleResendOtp}
                                        disabled={resendCooldown > 0}
                                    >
                                        {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend Code"}
                                    </button>
                                    <button
                                        type="button"
                                        className="login-ghost-btn"
                                        onClick={() => { setAuthStep("credentials"); setError(""); }}
                                    >
                                        Change account
                                    </button>
                                </div>

                                <button type="submit" className="login-submit" disabled={isSubmitting || enrollmentOtp.length !== 6}>
                                    <span>
                                        {isSubmitting
                                            ? "Verifying..."
                                            : isTransferFlow
                                            ? "Verify & Submit Transfer"
                                            : "Verify & Enroll Workstation"}
                                    </span>
                                    <ArrowRight size={18} />
                                </button>
                            </form>
                        )}

                        {/* ──────────────── STEP C: Pending Device Approval Screen ──────────────── */}
                        {authStep === "pendingApproval" && (
                            <div className="login-form">
                                <div className="login-transfer-card">
                                    <div className="login-step-icon-wrap" style={{ background: "#fef3c7", borderColor: "#fde68a", color: "#d97706" }}>
                                        <RefreshCw size={26} className="spinner" />
                                    </div>
                                    <h3 style={{ color: "#92400e" }}>Workstation Transfer Pending</h3>
                                    <p style={{ color: "#78350f" }}>
                                        This workstation (<strong>{deviceLabel}</strong>) is unrecognized. A transfer request has been submitted to the <strong>Supreme Administrator</strong>. Access will be activated automatically once approved.
                                    </p>
                                    <span className="login-transfer-badge">
                                        Status: {pollStatus}
                                    </span>
                                </div>

                                <div style={{ textAlign: "center", marginTop: "6px" }}>
                                    <button
                                        type="button"
                                        className="login-ghost-btn"
                                        onClick={() => { setAuthStep("credentials"); setPollingToken(""); }}
                                    >
                                        Return to login
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* RIGHT — VISUAL */}
                <section className="login-visual-section">
                    <div className="login-visual">
                        <img src={loginImage} alt="PlotPro Real Estate Platform" />
                        <div className="login-visual-overlay"></div>
                        <div className="login-visual-content">
                            <h2>
                                Secure Administrative <span>Workspaces</span>
                            </h2>
                            <p>
                                Single active device per account policy with Supreme Admin-governed transfer security.
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
};

export default Login;