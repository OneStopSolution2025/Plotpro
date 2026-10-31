import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    Mail,
    Lock,
    Eye,
    EyeOff,
    ShieldCheck,
    KeyRound,
    RefreshCw,
} from "lucide-react";
import { authApi } from "../services/api";

import "../css/Login.css";
import "../css/ForgotPassword.css";
import loginImage from "../assets/bg-image.webp";

// ─── Step indicators ─────────────────────────────────────────────────────────
const STEPS = ["Email", "Verify OTP", "New Password"];

const ForgotPassword = () => {
    const navigate = useNavigate();

    // Which step (0 = email, 1 = verify OTP, 2 = new password)
    const [step, setStep] = useState(0);

    // Shared state across steps
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [resendCountdown, setResendCountdown] = useState(0);

    // ── Step 1: Send OTP ──────────────────────────────────────────────────────
    const handleSendOtp = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setIsSubmitting(true);

        try {
            await authApi.forgotPassword(email.trim());
            setSuccess("OTP sent! Check your email");
            setStep(1);
            startResendTimer();
        } catch (err) {
            setError(err.message || "Failed to send OTP. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Step 2: Verify OTP ────────────────────────────────────────────────────
    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setIsSubmitting(true);

        try {
            await authApi.verifyOtp(email.trim(), otp.trim());
            setSuccess("OTP verified! Now set your new password.");
            setStep(2);
        } catch (err) {
            setError(err.message || "Invalid OTP. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Step 3: Reset Password ─────────────────────────────────────────────────
    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (newPassword !== confirmPassword) {
            setError("Passwords do not match. Please re-enter.");
            return;
        }
        if (newPassword.length < 6) {
            setError("Password must be at least 6 characters long.");
            return;
        }

        setIsSubmitting(true);
        try {
            await authApi.resetPassword(email.trim(), otp.trim(), newPassword);
            setSuccess("Password changed successfully! Redirecting to login…");
            setTimeout(() => navigate("/login", { replace: true }), 2000);
        } catch (err) {
            setError(err.message || "Failed to reset password. Please restart the process.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Resend OTP timer ──────────────────────────────────────────────────────
    const startResendTimer = () => {
        setResendCountdown(60);
        const interval = setInterval(() => {
            setResendCountdown((prev) => {
                if (prev <= 1) { clearInterval(interval); return 0; }
                return prev - 1;
            });
        }, 1000);
    };

    const handleResend = async () => {
        if (resendCountdown > 0) return;
        setError("");
        setSuccess("");
        setIsSubmitting(true);
        try {
            await authApi.forgotPassword(email.trim());
            setSuccess("OTP resent! Check your email.");
            startResendTimer();
        } catch (err) {
            setError(err.message || "Failed to resend OTP.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── OTP input auto-advance ────────────────────────────────────────────────
    const handleOtpChange = (e) => {
        const val = e.target.value.replace(/\D/g, "").slice(0, 6);
        setOtp(val);
    };

    return (
        <main className="login-page">
            <div className="login-wrapper">

                {/* ── LEFT: Form ───────────────────────────────────────────── */}
                <section className="login-form-section">
                    <div className="login-form-content">

                        <Link to="/login" className="back-btn">
                            <div className="back-btn1"><ArrowLeft size={30} /></div>
                        </Link>

                        {/* Step progress */}
                        <div className="fp-steps">
                            {STEPS.map((label, i) => (
                                <div
                                    key={label}
                                    className={`fp-step ${i < step ? "fp-step--done" : ""} ${i === step ? "fp-step--active" : ""}`}
                                >
                                    <div className="fp-step-dot">
                                        {i < step ? "✓" : i + 1}
                                    </div>
                                    <span className="fp-step-label">{label}</span>
                                    {i < STEPS.length - 1 && <div className="fp-step-line" />}
                                </div>
                            ))}
                        </div>

                        {/* Heading */}
                        <div className="login-heading" style={{ marginTop: 10 }}>
                            {step === 0 && (
                                <h1>Forgot <span>Password?</span></h1>
                            )}
                            {step === 1 && (
                                <h1>Enter <span>OTP</span></h1>
                            )}
                            {step === 2 && (
                                <h1>New <span>Password</span></h1>
                            )}
                        </div>

                        {/* Sub-description */}
                        <p className="fp-description">
                            {step === 0 && "Enter your registered email address. We'll send a 6-digit OTP to reset your password."}
                            {step === 1 && (
                                <>A 6-digit code was sent to <strong>{email}</strong></>
                            )}
                            {step === 2 && "Choose a strong new password for your account."}
                        </p>

                        {/* Error / Success alerts */}
                        {error && (
                            <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.9rem" }}>
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="alert alert-success py-2 mb-3" style={{ fontSize: "0.9rem" }}>
                                {success}
                            </div>
                        )}

                        {/* ── STEP 0: Email ────────────────────────────────── */}
                        {step === 0 && (
                            <form className="login-form" onSubmit={handleSendOtp}>
                                <div className="login-form-group">
                                    <label htmlFor="fp-email">
                                        Email Address<span>*</span>
                                    </label>
                                    <div className="login-input-wrapper">
                                        <Mail size={18} />
                                        <input
                                            id="fp-email"
                                            type="email"
                                            placeholder="Enter your registered email"
                                            autoComplete="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="login-submit"
                                    disabled={isSubmitting}
                                >
                                    <span>{isSubmitting ? "Sending OTP…" : "Send OTP"}</span>
                                    <ShieldCheck size={18} />
                                </button>
                            </form>
                        )}

                        {/* ── STEP 1: OTP ──────────────────────────────────── */}
                        {step === 1 && (
                            <form className="login-form" onSubmit={handleVerifyOtp}>
                                <div className="login-form-group">
                                    <label htmlFor="fp-otp">
                                        6-Digit OTP<span>*</span>
                                    </label>
                                    <div className="login-input-wrapper fp-otp-wrapper">
                                        <KeyRound size={18} />
                                        <input
                                            id="fp-otp"
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="Enter 6-digit code"
                                            maxLength={6}
                                            value={otp}
                                            onChange={handleOtpChange}
                                            required
                                            className="fp-otp-input"
                                        />
                                    </div>
                                
                                </div>

                                <button
                                    type="submit"
                                    className="login-submit"
                                    disabled={isSubmitting || otp.length !== 6}
                                >
                                    <span>{isSubmitting ? "Verifying…" : "Verify OTP"}</span>
                                    <ArrowRight size={18} />
                                </button>

                                {/* Resend */}
                                <button
                                    type="button"
                                    className={`fp-resend-btn ${resendCountdown > 0 ? "fp-resend-btn--disabled" : ""}`}
                                    onClick={handleResend}
                                    disabled={resendCountdown > 0 || isSubmitting}
                                >
                                    <RefreshCw size={14} />
                                    {resendCountdown > 0
                                        ? `Resend OTP in ${resendCountdown}s`
                                        : "Resend OTP"}
                                </button>
                            </form>
                        )}

                        {/* ── STEP 2: New Password ──────────────────────────── */}
                        {step === 2 && (
                            <form className="login-form" onSubmit={handleResetPassword}>
                                {/* New Password */}
                                <div className="login-form-group">
                                    <label htmlFor="fp-new-password">
                                        New Password<span>*</span>
                                    </label>
                                    <div className="login-input-wrapper">
                                        <Lock size={18} />
                                        <input
                                            id="fp-new-password"
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Min 6 characters"
                                            autoComplete="new-password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="login-password-toggle"
                                            onClick={() => setShowPassword((p) => !p)}
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Confirm Password */}
                                <div className="login-form-group">
                                    <label htmlFor="fp-confirm-password">
                                        Confirm Password<span>*</span>
                                    </label>
                                    <div className="login-input-wrapper">
                                        <Lock size={18} />
                                        <input
                                            id="fp-confirm-password"
                                            type={showConfirm ? "text" : "password"}
                                            placeholder="Re-enter new password"
                                            autoComplete="new-password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="login-password-toggle"
                                            onClick={() => setShowConfirm((p) => !p)}
                                        >
                                            {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Password strength hint */}
                                {newPassword.length > 0 && (
                                    <div className="fp-strength">
                                        <div className={`fp-strength-bar ${newPassword.length >= 10 ? "fp-strength-bar--strong" : newPassword.length >= 6 ? "fp-strength-bar--medium" : "fp-strength-bar--weak"}`} />
                                        <span>
                                            {newPassword.length >= 10 ? "Strong password" : newPassword.length >= 6 ? "Good password" : "Too short"}
                                        </span>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="login-submit"
                                    disabled={isSubmitting}
                                >
                                    <span>{isSubmitting ? "Resetting…" : "Reset Password"}</span>
                                    <ArrowRight size={18} />
                                </button>
                            </form>
                        )}

                        <p className="signup-link-text">
                            Remembered it?
                            <Link to="/login"> Log In</Link>
                        </p>

                    </div>
                </section>

                {/* ── RIGHT: Visual ─────────────────────────────────────────── */}
                <section className="login-visual-section">
                    <div className="login-visual">
                        <img src={loginImage} alt="DreamCity plotted development" />
                        <div className="login-visual-overlay" />
                        <div className="login-visual-content">
                            <h2>
                                Secure your<br />
                                <span>Account</span>
                            </h2>
                        </div>
                    </div>
                </section>

            </div>
        </main>
    );
};

export default ForgotPassword;
