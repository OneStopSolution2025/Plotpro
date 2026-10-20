import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    Mail,
    Lock,
    Eye,
    EyeOff,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

import "../css/Login.css";
import loginImage from "../assets/bg-image.jpg";



const Login = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login, isAuthenticated, user, isMaintenanceMode } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // If already authenticated, redirect to appropriate role dashboard
    useEffect(() => {
        if (isAuthenticated && user?.role) {
            if (user.role === "SUPREME_ADMIN") {
                navigate("/supreme-admin", { replace: true });
            } else if (user.role === "SUPER_ADMIN") {
                navigate("/super-admin", { replace: true });
            } else if (user.role === "ADMIN") {
                navigate("/admin", { replace: true });
            } else if (!isMaintenanceMode) {
                navigate("/", { replace: true });
            }
        }
    }, [isAuthenticated, user, isMaintenanceMode, navigate]);

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setIsSubmitting(true);

        try {
            const result = await login(formData.email, formData.password);
            const userRole = result?.user?.role;
            const fromPath = location.state?.from?.pathname;

            let redirectPath = "/";
            if (userRole === "SUPREME_ADMIN") {
                redirectPath = (fromPath && fromPath.startsWith("/supreme-admin")) ? fromPath : "/supreme-admin";
            } else if (userRole === "SUPER_ADMIN") {
                redirectPath = (fromPath && fromPath.startsWith("/super-admin")) ? fromPath : "/super-admin";
            } else if (userRole === "ADMIN") {
                redirectPath = (fromPath && fromPath.startsWith("/admin")) ? fromPath : "/admin";
            } else {
                if (isMaintenanceMode) {
                    setError("Public access is paused during scheduled maintenance. Only administrative accounts are permitted.");
                    return;
                }
                redirectPath = (fromPath && !fromPath.startsWith("/admin") && !fromPath.startsWith("/super-admin") && !fromPath.startsWith("/supreme-admin")) ? fromPath : "/";
            }

            navigate(redirectPath, { replace: true });
        } catch (err) {
            setError(err.message || "Invalid email or password");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="login-page">

            <div className="login-wrapper">


                <section className="login-form-section">

                    <Link to="/" className="back-btn" title="Back to home">
                        <div className="back-btn1"><ArrowLeft size={24} /></div>
                    </Link>

                    <div className="login-form-content">

                        <div className="login-heading">
                            <h1>
                                Welcome <span>back</span>
                            </h1>
                            {isMaintenanceMode ? (
                                <p style={{ color: "#a63d2f", fontWeight: 600, fontSize: "13px" }}>
                                    Scheduled Maintenance active — Administrative login only
                                </p>
                            ) : (
                                <p style={{ color: "#64748b", fontSize: "14px" }}>
                                    Sign in to your PlotPro workspace
                                </p>
                            )}
                        </div>


                        <button
                            type="button"
                            className="login-google-btn"
                        >
                            <span className="login-google-icon">G</span>
                            <span>Continue with Google</span>
                        </button>

                        {/* Divider */}
                        <div className="login-divider">
                            <span></span>
                            <p>or</p>
                            <span></span>
                        </div>

                        {/* Error Alert */}
                        {error && (
                            <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.9rem" }}>
                                {error}
                            </div>
                        )}

                        {/* Form */}
                        <form
                            className="login-form"
                            onSubmit={handleSubmit}
                        >

                            {/* Email */}
                            <div className="login-form-group">

                                <label htmlFor="login-email">
                                    Email<span>*</span>
                                </label>

                                <div className="login-input-wrapper">

                                    <Mail size={18} />

                                    <input
                                        id="login-email"
                                        type="email"
                                        name="email"
                                        placeholder="Enter your email"
                                        autoComplete="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        required
                                    />

                                </div>

                            </div>

                            {/* Password */}
                            <div className="login-form-group">

                                <div className="login-password-label">
                                    <label htmlFor="login-password">
                                        Password<span>*</span>
                                    </label>

                                    <Link to="/forgot-password">
                                        Forgot password?
                                    </Link>
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
                                        onClick={() =>
                                            setShowPassword((prev) => !prev)
                                        }
                                    >
                                        {showPassword ? (
                                            <EyeOff size={18} />
                                        ) : (
                                            <Eye size={18} />
                                        )}
                                    </button>

                                </div>

                            </div>

                            {/* Remember */}
                            <label className="login-remember">

                                <input
                                    type="checkbox"
                                    name="remember"
                                    checked={formData.remember}
                                    onChange={handleChange}
                                />

                                <span>Remember me</span>

                            </label>

                            <button
                                type="submit"
                                className="login-submit"
                                disabled={isSubmitting}
                            >
                                <span>{isSubmitting ? "Logging in..." : "Log In"}</span>
                                <ArrowRight size={18} />
                            </button>

                        </form>

                        {/* Signup */}
                        <p className="signup-link-text">
                            Don't have an account?
                            <Link to="/signup">
                                Sign up
                            </Link>
                        </p>

                    </div>
                </section>


                {/* =================================
            RIGHT — VISUAL
        ================================= */}
                <section className="login-visual-section">

                    <div className="login-visual">

                        <img
                            src={loginImage}
                            alt="DreamCity plotted development"
                        />

                        <div className="login-visual-overlay"></div>


                        {/* Main Content */}
                        <div className="login-visual-content">

                            <h2>
                                Find the Right Plot
                                <br />
                                <span>for Your Future</span>
                            </h2>

                        </div>

                    </div>

                </section>

            </div>
        </main>
    );
};

export default Login;