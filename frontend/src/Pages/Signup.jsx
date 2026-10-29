import { Link, useNavigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    User,
    Mail,
    Lock,
    Eye,
    EyeOff,
    Building2,
    Phone,
    Briefcase,
    CheckCircle2,
    Clock,
    Users,
    FileText,
    ShieldCheck,
    Building,
    ChevronDown,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import GoogleAuthButton from "../components/GoogleAuthButton";
import PhoneInputField from "../components/PhoneInputField";
import { formatFullPhone } from "../utils/phoneUtils";
import { authApi } from "../services/api";

import "../css/Signup.css";
import signupImage from "../assets/bg-image.jpg";

const BUSINESS_TYPE_OPTIONS = [
    { value: "SOLE_PROPRIETOR", label: "Individual / Sole Proprietor" },
    { value: "PARTNERSHIP", label: "Partnership" },
    { value: "LLP", label: "Limited Liability Partnership (LLP)" },
    { value: "PVT_LTD", label: "Private Limited Company" },
    { value: "PUBLIC_LTD", label: "Public Limited Company" },
    { value: "OTHER", label: "Other" },
];

const APPLICANT_ROLE_OPTIONS = [
    { value: "OWNER_PROPRIETOR", label: "Owner / Proprietor" },
    { value: "PARTNER", label: "Partner" },
    { value: "DIRECTOR", label: "Director" },
    { value: "AUTHORIZED_REPRESENTATIVE", label: "Authorized Representative" },
];

const formatDuration = (days) => {
    if (!days || days < 30) return days ? `${days} days` : "—";
    if (days % 365 === 0) return days === 365 ? "1 year" : `${days / 365} years`;
    if (days % 30 === 0) return days === 30 ? "1 month" : `${days / 30} months`;
    return `${days} days`;
};

const formatPrice = (plan) =>
    plan?.price !== undefined
        ? `${plan.currency || "INR"} ${Number(plan.price).toLocaleString("en-IN")}`
        : "—";

const Signup = ({ initialType = null }) => {
    const { signup, loginWithGoogle } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();
    const [searchParams] = useSearchParams();

    // ── Derive accountType directly from URL path or query params ──
    const resolveAccountType = () => {
        const path = (location.pathname || "").toLowerCase();
        if (
            path === "/signup-customer" ||
            path.endsWith("/customer") ||
            params.type === "customer" ||
            searchParams.get("type") === "customer"
        ) {
            return "customer";
        }
        if (
            path === "/signup-retailer" ||
            path.endsWith("/retailer") ||
            params.type === "retailer" ||
            searchParams.get("type") === "retailer"
        ) {
            return "retailer";
        }
        if (initialType === "customer" || initialType === "retailer") {
            return initialType;
        }
        return null;
    };

    const accountType = resolveAccountType();
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ── Customer form ──────────────────────────────────────────────
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        terms: false,
    });

    // ── Retailer (Super Admin) signup request form ─────────────────
    const [retailerPhoneCountryCode, setRetailerPhoneCountryCode] = useState("+91");
    const [retailerData, setRetailerData] = useState({
        businessName: "",
        name: "",
        phone: "",
        email: "",
        password: "",
        planId: "",

        // Business Verification Details
        businessType: "SOLE_PROPRIETOR",
        applicantRole: "OWNER_PROPRIETOR",
        applicantLegalName: "",
        panNumber: "",

        hasGst: false,
        gstin: "",

        registrationNumber: "",

        retailerTerms: false,
    });

    // ── Packages (live from Supreme Admin Plan collection) ─────────
    const [plans, setPlans] = useState([]);
    const [plansLoading, setPlansLoading] = useState(false);
    const [plansError, setPlansError] = useState("");
    const [billingCycle, setBillingCycle] = useState("MONTHLY");

    // In MONTHLY mode, show monthly plans.
    // In ANNUAL mode, show annual plans if available, or compute annual from monthly.
    const filteredPlans = useMemo(() => {
        const isAnnual = billingCycle === "ANNUAL";
        if (isAnnual) {
            const explicitAnnual = plans.filter((p) => p.billingInterval === "ANNUAL");
            if (explicitAnnual.length > 0) return explicitAnnual;
            return plans.filter((p) => p.billingInterval === "MONTHLY" || !p.billingInterval);
        }
        return plans.filter((p) => p.billingInterval === "MONTHLY" || !p.billingInterval);
    }, [plans, billingCycle]);

    // ── Submission outcome ─────────────────────────────────────────
    const [submitted, setSubmitted] = useState(false);

    const loadPlans = useCallback(async () => {
        setPlansLoading(true);
        setPlansError("");
        try {
            const res = await authApi.getRetailerPlans();
            if (res?.success) {
                setPlans(res.data || []);
                if (!res.data?.length) {
                    setPlansError("No packages are currently available. Please try again later.");
                }
            }
        } catch (err) {
            setPlansError(err.message || "Failed to load packages.");
        } finally {
            setPlansLoading(false);
        }
    }, []);

    // Fetch active packages when the retailer section opens
    useEffect(() => {
        if (accountType === "retailer" && !plans.length && !plansLoading) {
            loadPlans();
        }
    }, [accountType, plans.length, plansLoading, loadPlans]);

    // Auto-select first plan in current filtered list if none selected
    useEffect(() => {
        if (filteredPlans.length > 0) {
            const hasSelectedInCurrent = filteredPlans.some((p) => String(p._id) === retailerData.planId);
            if (!hasSelectedInCurrent) {
                setRetailerData((prev) => ({
                    ...prev,
                    planId: String(filteredPlans[0]._id),
                }));
            }
        }
    }, [filteredPlans, retailerData.planId]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const handleRetailerChange = (e) => {
        const { name, value, type, checked } = e.target;
        setRetailerData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const selectPlan = (plan) => {
        setRetailerData((prev) => ({
            ...prev,
            planId: plan._id,
        }));
    };

    const validateRetailer = () => {
        const d = retailerData;
        if (!d.businessName.trim()) return "Business name is required.";
        if (!d.name.trim()) return "Owner/Applicant name is required.";
        if (!d.email.trim()) return "Email is required.";
        if (d.password.length < 6) return "Password must be at least 6 characters long.";
        if (!d.planId) return "Please select a package.";

        // Business Verification Details
        if (!d.businessType) return "Please select your business type.";
        if (!d.applicantRole) return "Please select your applicant role in the business.";

        const legalName = (d.applicantLegalName || d.name).trim();
        if (!legalName) return "Applicant's full legal name is required.";

        // PAN validation
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        const cleanPan = d.panNumber.trim().toUpperCase();
        if (!cleanPan || !panRegex.test(cleanPan)) {
            return "Please provide a valid 10-character PAN number (e.g. ABCDE1234F).";
        }

        // Conditional Company / LLP verification
        const isCompanyOrLlp = ["LLP", "PVT_LTD", "PUBLIC_LTD"].includes(d.businessType);
        if (isCompanyOrLlp) {
            if (!d.registrationNumber.trim()) {
                return d.businessType === "LLP"
                    ? "LLPIN (LLP Identification Number) is required."
                    : "CIN (Corporate Identification Number) is required.";
            }
        }

        // Conditional GST verification
        if (d.hasGst) {
            const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
            const cleanGst = d.gstin.trim().toUpperCase();
            if (!cleanGst || !gstRegex.test(cleanGst)) {
                return "Please enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5) or uncheck GST.";
            }
        }

        if (!d.retailerTerms) return "Please accept the Terms of Service to continue.";
        return "";
    };

    const handleRetailerSubmit = async (e) => {
        e.preventDefault();
        const validation = validateRetailer();
        if (validation) {
            setError(validation);
            return;
        }

        setError("");
        setIsSubmitting(true);

        try {
            const d = retailerData;
            const formattedPhone = d.phone.trim() ? formatFullPhone(retailerPhoneCountryCode, d.phone.trim()) : "";
            const isCompanyOrLlp = ["LLP", "PVT_LTD", "PUBLIC_LTD"].includes(d.businessType);

            await authApi.submitRetailerRequest({
                name: d.name.trim(),
                email: d.email.trim(),
                password: d.password,
                phone: formattedPhone,
                businessName: d.businessName.trim(),
                planId: d.planId,
                billingCycle: billingCycle,

                // Business Verification Details
                businessType: d.businessType,
                applicantRole: d.applicantRole,
                applicantLegalName: (d.applicantLegalName || d.name).trim(),
                panNumber: d.panNumber.trim().toUpperCase(),

                hasGst: d.hasGst,
                gstin: d.hasGst ? d.gstin.trim().toUpperCase() : "",

                registrationNumber: isCompanyOrLlp ? d.registrationNumber.trim().toUpperCase() : "",
            });
            setSubmitted(true);
        } catch (err) {
            setError(err.message || "Failed to submit your request. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Customer handlers (UNCHANGED flow) ─────────────────────────
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

    // ── Success screen (retailer request submitted) ────────────────
    if (accountType === "retailer" && submitted) {
        return (
            <main className="auth-page">
                <div className="auth-wrapper">
                    <Link to="/signup" className="back-btn" onClick={() => setSubmitted(false)}>
                        <div className="back-btn1"><ArrowLeft size={20} /></div>
                    </Link>

                    <section className="auth-form-section">
                        <div className="auth-form-content retailer-success">
                            <div className="retailer-success-icon">
                                <CheckCircle2 size={56} />
                            </div>
                            <h2 className="retailer-success-title">Request Submitted</h2>
                            <p className="retailer-success-text">
                                Your Super Admin (Retailer) account request for{" "}
                                <strong>{retailerData.businessName}</strong> is now awaiting
                                Supreme Administrator approval. Our team will review your
                                package selection and ID details shortly.
                            </p>
                            <div className="retailer-success-note">
                                <Clock size={18} />
                                <span>
                                    You will be able to log in as soon as the request is approved.
                                    A confirmation email will be sent to <strong>{retailerData.email}</strong>.
                                </span>
                            </div>
                            <Link to="/login" className="signup-submit retailer-success-btn">
                                <span>Back to Login</span>
                                <ArrowRight size={18} />
                            </Link>
                        </div>
                    </section>

                    <section className="auth-visual-section">
                        <div className="auth-visual">
                            <img src={signupImage} alt="DreamCity plotted development" />
                            <div className="auth-visual-overlay"></div>
                            <div className="visual-content">
                                <h2>
                                    Find a Better Place
                                    <br />
                                    <span>for Your Future</span>
                                </h2>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        );
    }

    // ── Account type selector screen ───────────────────────────────
    if (!accountType) {
        return (
            <main className="auth-page">
                <div className="auth-wrapper">
                    <Link to="/" className="back-btn">
                        <div className="back-btn1"><ArrowLeft size={20} /></div>
                    </Link>

                    <section className="auth-form-section">
                        <div className="auth-form-content">
                            <div className="auth-heading">
                                <h1>
                                    Join <span>PlotPro</span>
                                </h1>
                                <p className="auth-subheading">
                                    Choose the account type that fits you best.
                                </p>
                            </div>

                            <div className="prestige-duo-cards">
                              <button
                                type="button"
                                className="prestige-card prestige-card-dark"
                                onClick={() => navigate("/signup-customer")}
                              >
                                <div className="prestige-left">
                                  <div className="prestige-icon-disc disc-forest">
                                    <User size={22} />
                                  </div>
                                  <div>
                                    <div className="prestige-title">Join as Customer</div>
                                    <p className="prestige-desc">Free access to plots, maps & visits</p>
                                  </div>
                                </div>
                                <div className="prestige-action-btn btn-white">
                                  <span>Start</span>
                                  <ArrowRight size={14} />
                                </div>
                              </button>

                              <button
                                type="button"
                                className="prestige-card prestige-card-light"
                                onClick={() => navigate("/signup-retailer")}
                              >
                                <div className="prestige-left">
                                  <div className="prestige-icon-disc disc-rust">
                                    <Building2 size={22} />
                                  </div>
                                  <div>
                                    <div className="prestige-title" style={{ color: "#17240f" }}>Retailer / Business</div>
                                    <p className="prestige-desc">Publish plots & grow revenue</p>
                                  </div>
                                </div>
                                <div className="prestige-action-btn btn-rust">
                                  <span>Apply</span>
                                  <ArrowRight size={14} />
                                </div>
                              </button>
                            </div>

                            <p className="login-link-text">
                                Already have an account?
                                <Link to="/login">Log in</Link>
                            </p>
                        </div>
                    </section>

                    <section className="auth-visual-section">
                        <div className="auth-visual">
                            <img src={signupImage} alt="DreamCity plotted development" />
                            <div className="auth-visual-overlay"></div>
                            <div className="visual-content">
                                <h2>
                                    Find a Better Place
                                    <br />
                                    <span>for Your Future</span>
                                </h2>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        );
    }

    // ── Customer signup (existing flow, visually unchanged) ────────
    if (accountType === "customer") {
        return (
            <main className="auth-page">
                <div className="auth-wrapper">
                    <section className="auth-form-section">
                        <div className="auth-form-content">
                            <div className="auth-header-top">
                                <Link to="/signup" className="auth-inline-back-btn" title="Back to account selection">
                                    <ArrowLeft size={18} />
                                    <span>Back</span>
                                </Link>
                            </div>

                            <div className="auth-heading">
                                <h1>
                                    Create your <span>account</span>
                                </h1>
                                <button
                                    type="button"
                                    className="account-switch-link"
                                    onClick={() => navigate("/signup-retailer")}
                                >
                                    Retailer / Business? Apply for a Super Admin account →
                                </button>
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

                            {error && (
                                <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.9rem" }}>
                                    {error}
                                </div>
                            )}

                            <form className="signup-form" onSubmit={handleSubmit}>
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
                                            onClick={() => setShowPassword((prev) => !prev)}
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>

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
                                        <Link to="/terms">Terms of Service</Link> and{" "}
                                        <Link to="/privacy">Privacy Policy</Link>
                                    </span>
                                </label>

                                <button type="submit" className="signup-submit" disabled={isSubmitting}>
                                    <span>{isSubmitting ? "Signing up..." : "Sign Up"}</span>
                                    <ArrowRight size={18} />
                                </button>
                            </form>

                            <p className="login-link-text">
                                Already have an account?
                                <Link to="/login">Log in</Link>
                            </p>
                        </div>
                    </section>

                    <section className="auth-visual-section">
                        <div className="auth-visual">
                            <img src={signupImage} alt="DreamCity plotted development" />
                            <div className="auth-visual-overlay"></div>
                            <div className="visual-content">
                                <h2>
                                    Find a Better Place
                                    <br />
                                    <span>for Your Future</span>
                                </h2>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        );
    }

    // ── Retailer (Super Admin) signup request form ─────────────────
    return (
        <main className="auth-page">
            <div className="auth-wrapper">
                <section className="auth-form-section auth-form-section-wide">
                    <div className="auth-form-content">
                        <div className="auth-header-top">
                            <Link to="/signup" className="auth-inline-back-btn" title="Back to account selection">
                                <ArrowLeft size={18} />
                                <span>Back</span>
                            </Link>
                        </div>

                        <div className="auth-heading">
                            <h1>
                                Apply for a <span>Retailer Account</span>
                            </h1>
                            <button
                                type="button"
                                className="account-switch-link"
                                onClick={() => navigate("/signup-customer")}
                            >
                                Looking to buy a plot? Create a Customer account →
                            </button>
                        </div>

                        {error && (
                            <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.9rem" }}>
                                {error}
                            </div>
                        )}

                        <form className="signup-form" onSubmit={handleRetailerSubmit}>
                            <div className="retailer-section-note">
                                <Users size={16} />
                                <span>
                                    Super Admin (Retailer) accounts are activated only after the
                                    Supreme Administrator reviews your package and ID details.
                                </span>
                            </div>

                            {/* ── Business details ── */}
                            <h4 className="retailer-sec-title">
                                <Briefcase size={16} /> Business Details
                            </h4>
                            <div className="retailer-form-row">
                                <div className="form-group">
                                    <label htmlFor="businessName">
                                        Business Name<span>*</span>
                                    </label>
                                    <div className="input-wrapper">
                                        <Building2 size={18} />
                                        <input
                                            id="businessName"
                                            type="text"
                                            name="businessName"
                                            placeholder="Your company / venture name"
                                            value={retailerData.businessName}
                                            onChange={handleRetailerChange}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="ownerName">
                                        Owner Name<span>*</span>
                                    </label>
                                    <div className="input-wrapper">
                                        <User size={18} />
                                        <input
                                            id="ownerName"
                                            type="text"
                                            name="name"
                                            placeholder="Full name"
                                            autoComplete="name"
                                            value={retailerData.name}
                                            onChange={handleRetailerChange}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="retailer-form-row">
                                <div className="form-group">
                                    <label htmlFor="rEmail">
                                        Email<span>*</span>
                                    </label>
                                    <div className="input-wrapper">
                                        <Mail size={18} />
                                        <input
                                            id="rEmail"
                                            type="email"
                                            name="email"
                                            placeholder="Business email address"
                                            autoComplete="email"
                                            value={retailerData.email}
                                            onChange={handleRetailerChange}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="rPhone">
                                        Phone
                                    </label>
                                    <div className="phone-input-group-unified">
                                        <div className="phone-country-wrapper-unified">
                                            <select
                                                id="rPhoneCountry"
                                                className="phone-country-select-unified"
                                                value={retailerPhoneCountryCode}
                                                onChange={(e) => setRetailerPhoneCountryCode(e.target.value)}
                                                aria-label="Country phone code"
                                            >
                                                <option value="+91">🇮🇳 +91</option>
                                                <option value="+1">🇺🇸 +1</option>
                                                <option value="+44">🇬🇧 +44</option>
                                                <option value="+60">🇲🇾 +60</option>
                                                <option value="+65">🇸🇬 +65</option>
                                                <option value="+971">🇦🇪 +971</option>
                                                <option value="+966">🇸🇦 +966</option>
                                                <option value="+61">🇦🇺 +61</option>
                                                <option value="+49">🇩🇪 +49</option>
                                                <option value="+33">🇫🇷 +33</option>
                                            </select>
                                            <ChevronDown size={14} className="phone-country-chevron-unified" />
                                        </div>
                                        <Phone size={18} style={{ color: "#788598", marginRight: 8, flexShrink: 0 }} />
                                        <input
                                            id="rPhone"
                                            type="tel"
                                            className="phone-number-input-unified"
                                            placeholder="10-digit number"
                                            maxLength={10}
                                            value={retailerData.phone}
                                            onChange={(e) => {
                                                const cleaned = e.target.value.replace(/\D/g, "").slice(0, 10);
                                                setRetailerData((prev) => ({ ...prev, phone: cleaned }));
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="rPassword">
                                    Password<span>*</span>
                                </label>
                                <div className="input-wrapper">
                                    <Lock size={18} />
                                    <input
                                        id="rPassword"
                                        type={showPassword ? "text" : "password"}
                                        name="password"
                                        placeholder="Create a password (min 6 characters)"
                                        autoComplete="new-password"
                                        value={retailerData.password}
                                        onChange={handleRetailerChange}
                                        required
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowPassword((prev) => !prev)}
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            {/* ── Package selection (live from platform) ── */}
                            <div className="sub-plan-section">
                                <div className="sub-plan-header">
                                    <span className="sub-plan-label">Subscription Plan</span>
                                    <div className="sub-plan-toggle">
                                        <div className={`sub-plan-pill ${billingCycle === "ANNUAL" ? "annual" : ""}`} />
                                        <button
                                            type="button"
                                            className={`sub-plan-tab ${billingCycle === "MONTHLY" ? "active" : ""}`}
                                            onClick={() => setBillingCycle("MONTHLY")}
                                        >
                                            Monthly
                                        </button>
                                        <button
                                            type="button"
                                            className={`sub-plan-tab ${billingCycle === "ANNUAL" ? "active" : ""}`}
                                            onClick={() => setBillingCycle("ANNUAL")}
                                        >
                                            Annually
                                        </button>
                                    </div>
                                </div>

                                {plansLoading ? (
                                    <div className="plans-loading">Loading packages…</div>
                                ) : plansError ? (
                                    <div className="plans-error">
                                        {plansError}
                                        <button
                                            type="button"
                                            onClick={() => loadPlans()}
                                        >
                                            Retry
                                        </button>
                                    </div>
                                ) : filteredPlans.length === 0 ? (
                                    <div className="plans-empty-cycle">
                                        <p>No {billingCycle === "ANNUAL" ? "annual" : "monthly"} packages currently available.</p>
                                        <button
                                            type="button"
                                            onClick={() => setBillingCycle(billingCycle === "MONTHLY" ? "ANNUAL" : "MONTHLY")}
                                        >
                                            View {billingCycle === "MONTHLY" ? "Annual" : "Monthly"} Packages
                                        </button>
                                    </div>
                                ) : (
                                    <div className="sub-plan-list">
                                        {filteredPlans.map((plan) => {
                                            const isUnlimited = plan.isUnlimitedSeats || plan.maxAdminSeats >= 999999;
                                            const active = String(plan._id) === retailerData.planId;
                                            const isAnnual = billingCycle === "ANNUAL";
                                            const durationLabel = isAnnual ? "1 year" : formatDuration(plan.durationDays);
                                            const seatsLabel = isUnlimited
                                                ? "Unlimited branch admin seats"
                                                : `${plan.maxAdminSeats} branch admin seat${plan.maxAdminSeats === 1 ? "" : "s"}`;
                                            const projectsLabel = plan.isUnlimitedProjects || plan.maxProjects >= 999999
                                                ? "Unlimited projects"
                                                : `${plan.maxProjects ?? 10} projects max`;

                                            const originalAnnualPrice = plan.billingInterval === "ANNUAL"
                                                ? Math.round(Number(plan.price) / 0.8)
                                                : Number(plan.price) * 12;
                                            const discountedAnnualPrice = plan.billingInterval === "ANNUAL"
                                                ? Number(plan.price)
                                                : Math.round(originalAnnualPrice * 0.8);
                                            const displayPrice = isAnnual ? discountedAnnualPrice : Number(plan.price);

                                            return (
                                                <button
                                                    type="button"
                                                    key={plan._id}
                                                    className={`sub-plan-card ${active ? "selected" : ""}`}
                                                    onClick={() => selectPlan(plan)}
                                                >
                                                    {active && <span className="sub-plan-card-tag">Selected</span>}
                                                    <div className="sub-plan-left">
                                                        <div className="sub-plan-title-row">
                                                            <span className="sub-plan-name">{plan.name}</span>
                                                            <span className="sub-plan-meta">
                                                                {durationLabel} · {projectsLabel} · {seatsLabel}
                                                            </span>
                                                        </div>
                                                        <div className="sub-plan-subtext">
                                                            {isAnnual
                                                                ? "Annual plan"
                                                                : plan.billingInterval === "CUSTOM"
                                                                ? `Billed every ${durationLabel}`
                                                                : "Monthly billing"}
                                                        </div>
                                                    </div>

                                                    <div className="sub-plan-right">
                                                        {isAnnual && (
                                                            <span className="sub-plan-original-price">
                                                                {plan.currency || "INR"} {originalAnnualPrice.toLocaleString("en-IN")}
                                                            </span>
                                                        )}
                                                        <div className="sub-plan-price-row">
                                                            <span className="sub-plan-currency">{plan.currency || "INR"}</span>
                                                            <span className="sub-plan-price">
                                                                {displayPrice.toLocaleString("en-IN")}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* ── Business Verification Details ── */}
                            <h4 className="retailer-sec-title">
                                <ShieldCheck size={16} /> Business Verification Details
                            </h4>
                            <p className="retailer-sec-hint">
                                Provide your business entity classification, applicant legal authority, and verification documents.
                            </p>

                            {/* Row A: Business Type & Applicant Role */}
                            <div className="retailer-form-row">
                                <div className="form-group">
                                    <label htmlFor="businessType">
                                        Business Type<span>*</span>
                                    </label>
                                    <div className="input-wrapper">
                                        <Building size={18} />
                                        <select
                                            id="businessType"
                                            name="businessType"
                                            value={retailerData.businessType}
                                            onChange={handleRetailerChange}
                                            required
                                        >
                                            {BUSINESS_TYPE_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="applicantRole">
                                        Applicant Role in Business<span>*</span>
                                    </label>
                                    <div className="input-wrapper">
                                        <Briefcase size={18} />
                                        <select
                                            id="applicantRole"
                                            name="applicantRole"
                                            value={retailerData.applicantRole}
                                            onChange={handleRetailerChange}
                                            required
                                        >
                                            {APPLICANT_ROLE_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Applicant Legal Name */}
                            <div className="form-group">
                                <label htmlFor="applicantLegalName">
                                    Applicant Legal Full Name<span>*</span>
                                    <span className="label-hint">(as per PAN / government records)</span>
                                </label>
                                <div className="input-wrapper">
                                    <User size={18} />
                                    <input
                                        id="applicantLegalName"
                                        type="text"
                                        name="applicantLegalName"
                                        placeholder="Full legal name"
                                        value={retailerData.applicantLegalName || retailerData.name}
                                        onChange={handleRetailerChange}
                                        required
                                    />
                                </div>
                            </div>

                            {/* PAN Number */}
                            <div className="form-group">
                                <label htmlFor="panNumber">
                                    PAN (Permanent Account Number)<span>*</span>
                                </label>
                                <div className="input-wrapper">
                                    <FileText size={18} />
                                    <input
                                        id="panNumber"
                                        type="text"
                                        name="panNumber"
                                        placeholder="10-character PAN (e.g. ABCDE1234F)"
                                        maxLength={10}
                                        value={retailerData.panNumber}
                                        onChange={(e) =>
                                            setRetailerData((prev) => ({
                                                ...prev,
                                                panNumber: e.target.value.toUpperCase(),
                                            }))
                                        }
                                        required
                                    />
                                </div>
                            </div>

                            {/* Row C: Conditional Company / LLP Registration */}
                            {["LLP", "PVT_LTD", "PUBLIC_LTD"].includes(retailerData.businessType) && (
                                <div className="retailer-form-row">
                                    <div className="form-group">
                                        <label htmlFor="registrationNumber">
                                            {retailerData.businessType === "LLP" ? "LLPIN (LLP Identification Number)" : "CIN (Corporate Identification Number)"}
                                            <span>*</span>
                                        </label>
                                        <div className="input-wrapper">
                                            <Building2 size={18} />
                                            <input
                                                id="registrationNumber"
                                                type="text"
                                                name="registrationNumber"
                                                placeholder={retailerData.businessType === "LLP" ? "e.g. AAA-1234" : "e.g. U72200MH2020PTC123456"}
                                                value={retailerData.registrationNumber}
                                                onChange={(e) =>
                                                    setRetailerData((prev) => ({
                                                        ...prev,
                                                        registrationNumber: e.target.value.toUpperCase(),
                                                    }))
                                                }
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Conditional GST Registration */}
                            <div style={{ margin: "4px 0 12px" }}>
                                <label className="bdoc-gst-toggle">
                                    <input
                                        type="checkbox"
                                        name="hasGst"
                                        checked={retailerData.hasGst}
                                        onChange={(e) =>
                                            setRetailerData((prev) => ({
                                                ...prev,
                                                hasGst: e.target.checked,
                                            }))
                                        }
                                    />
                                    <span>Business is registered for GST</span>
                                    <span className="bdoc-badge-optional">Optional</span>
                                </label>

                                {retailerData.hasGst && (
                                    <div className="form-group" style={{ marginTop: 8 }}>
                                        <label htmlFor="gstin">
                                            GSTIN (GST Identification Number)<span>*</span>
                                        </label>
                                        <div className="input-wrapper">
                                            <FileText size={18} />
                                            <input
                                                id="gstin"
                                                type="text"
                                                name="gstin"
                                                placeholder="15-character GSTIN (e.g. 22AAAAA0000A1Z5)"
                                                maxLength={15}
                                                value={retailerData.gstin}
                                                onChange={(e) =>
                                                    setRetailerData((prev) => ({
                                                        ...prev,
                                                        gstin: e.target.value.toUpperCase(),
                                                    }))
                                                }
                                                required
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── Terms ── */}
                            <label className="terms-row">
                                <input
                                    type="checkbox"
                                    name="retailerTerms"
                                    checked={retailerData.retailerTerms}
                                    onChange={handleRetailerChange}
                                    required
                                />
                                <span>
                                    I agree to the <Link to="/terms">Terms of Service</Link> and{" "}
                                    <Link to="/privacy">Privacy Policy</Link>, and confirm that the
                                    package selection and identity details submitted are true.
                                </span>
                            </label>

                            <button type="submit" className="signup-submit" disabled={isSubmitting}>
                                <span>{isSubmitting ? "Submitting request..." : "Submit for Approval"}</span>
                                <ArrowRight size={18} />
                            </button>
                        </form>

                        <p className="login-link-text">
                            Already have an account?
                            <Link to="/login">Log in</Link>
                        </p>
                    </div>
                </section>

                <section className="auth-visual-section">
                    <div className="auth-visual">
                        <img src={signupImage} alt="PlotPro plotted development" />
                        <div className="auth-visual-overlay"></div>
                        <div className="visual-content">
                            <h2>
                                Grow Your Real Estate
                                <br />
                                <span>Business with PlotPro</span>
                            </h2>
                            <p>
                                Showcase plotted layouts, manage inventory in real time, and connect directly with verified buyers.
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
};

export default Signup;
