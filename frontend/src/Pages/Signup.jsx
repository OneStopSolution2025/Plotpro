import { Link, useNavigate } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    User,
    Mail,
    Lock,
    Eye,
    EyeOff,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import GoogleAuthButton from "../components/GoogleAuthButton";

import "../css/Signup.css";
import signupImage from "../assets/bg-image.jpg";

const Signup = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { signup, loginWithGoogle } = useAuth();
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        terms: false,
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
        if (!formData.terms) {
            setError("Please accept the Terms of Service to continue.");
            return;
        }

        setError("");
        setIsSubmitting(true);

        try {
            await signup(formData.name, formData.email, formData.password);
            navigate("/", { replace: true });
        } catch (err) {
            setError(err.message || "Registration failed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGoogleSuccess = async (credential) => {
        setError("");
        setIsSubmitting(true);
        try {
            const result = await loginWithGoogle(credential);
            const userRole = result?.user?.role;
            if (userRole === "SUPREME_ADMIN") {
                navigate("/supreme-admin", { replace: true });
            } else if (userRole === "SUPER_ADMIN") {
                navigate("/super-admin", { replace: true });
            } else if (userRole === "ADMIN") {
                navigate("/admin", { replace: true });
            } else {
                navigate("/", { replace: true });
            }
        } catch (err) {
            setError(err.message || "Google registration failed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="auth-page">



            <div className="auth-wrapper">
                <Link to="/" className="back-btn">
                    <div className="back-btn1"><ArrowLeft size={30} /></div>
                </Link>

                <section className="auth-form-section">

                    <div className="auth-form-content">

                        <div className="auth-heading">
                            <h1>
                                Create your <span>account</span>
                            </h1>
                        </div>

                        <GoogleAuthButton
                            onSuccess={handleGoogleSuccess}
                            onError={(msg) => setError(msg)}
                            isSubmitting={isSubmitting}
                        />

                        <div className="auth-divider">
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

                        <form
                            className="signup-form"
                            onSubmit={handleSubmit}
                        >
                            <div className="form-group">
                                <label htmlFor="name">
                                    Name<span>*</span>
                                </label>

                                <div className="input-wrapper">
                                    <User size={18} />

                                    <input
                                        id="name"
                                        type="text"
                                        name="name"
                                        placeholder="Enter your name"
                                        autoComplete="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div className="form-group">
                                <label htmlFor="email">
                                    Email<span>*</span>
                                </label>

                                <div className="input-wrapper">
                                    <Mail size={18} />

                                    <input
                                        id="email"
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
                            <div className="form-group">
                                <label htmlFor="password">
                                    Password<span>*</span>
                                </label>

                                <div className="input-wrapper">
                                    <Lock size={18} />

                                    <input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        name="password"
                                        placeholder="Create a password"
                                        autoComplete="new-password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        required
                                        minLength={6}
                                    />

                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() =>
                                            setShowPassword((prev) => !prev)
                                        }
                                        aria-label={
                                            showPassword
                                                ? "Hide password"
                                                : "Show password"
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

                            {/* Terms */}
                            <label className="terms-row">
                                <input
                                    type="checkbox"
                                    name="terms"
                                    checked={formData.terms}
                                    onChange={handleChange}
                                    required
                                />

                                <span>
                                    I agree to the{" "}
                                    <Link to="/terms">
                                        Terms of Service
                                    </Link>{" "}
                                    and{" "}
                                    <Link to="/privacy">
                                        Privacy Policy
                                    </Link>
                                </span>
                            </label>

                            {/* Submit */}
                            <button
                                type="submit"
                                className="signup-submit"
                                disabled={isSubmitting}
                            >
                                <span>{isSubmitting ? "Signing up..." : "Sign Up"}</span>
                                <ArrowRight size={18} />
                            </button>

                        </form>

                        {/* Login */}
                        <p className="login-link-text">
                            Already have an account?
                            <Link to="/login">Log in</Link>
                        </p>

                    </div>
                </section>

                {/* =====================================
            RIGHT — VISUAL PANEL
        ====================================== */}
                <section className="auth-visual-section">

                    <div className="auth-visual">

                        <img
                            src={signupImage}
                            alt="DreamCity plotted development"
                        />

                        <div className="auth-visual-overlay"></div>

                        <div className="visual-content">

                            <h2>
                                Find a Better Place
                                <br />
                                <span>
                                    for Your Future
                                </span>

                            </h2>

                        </div>

                    </div>

                </section>

            </div>
        </main>
    );
};

export default Signup;