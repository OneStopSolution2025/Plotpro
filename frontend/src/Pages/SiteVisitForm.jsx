import { useState, useEffect } from "react";
import "../css/SiteVisitForm.css";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import PhoneInputField from "../components/PhoneInputField";
import { formatFullPhone } from "../utils/phoneUtils";
import { ArrowRight, Calendar, Clock, MapPin, User, Phone, Mail, AlertCircle, CheckCircle } from "lucide-react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useProjects, findProjectByIdentifier, getProjectRouteSlug } from "../context/ProjectContext";
import { usePlots } from "../context/PlotContext";
import { useAuth } from "../context/AuthContext";
import { parsePhoneString } from "../utils/phoneUtils";
import { publicApi } from "../services/api";

export default function SiteVisitForm() {
    const { projectId } = useParams();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { projects } = useProjects();
    const { plots } = usePlots();
    const { user: authUser } = useAuth();

    const preSelectedPlot = searchParams.get("plot") || "";

    const project = findProjectByIdentifier(projects, projectId);
    const projectPlots = plots.filter((plot) =>
        String(plot.projectId) === String(project?.id) ||
        String(plot.projectCustomId) === String(project?.customId) ||
        String(plot.projectMongoId) === String(project?._id)
    );

    const handleBackNavigation = () => {
        if (location.state?.from && typeof location.state.from === "string") {
            navigate(location.state.from);
            return;
        }

        const projectSlug = project ? (getProjectRouteSlug(project, projects) || project.slug || project.id) : null;

        if (preSelectedPlot && projectPlots.length > 0) {
            const matchedPlot = projectPlots.find(
                (plot) => String(plot.plotNumber) === String(preSelectedPlot)
            );

            if (matchedPlot) {
                const plotSlug = matchedPlot.plotNumber ? encodeURIComponent(matchedPlot.plotNumber) : matchedPlot.id;
                navigate(projectSlug ? `/plot-details/${projectSlug}/${plotSlug}` : `/plot-details/${matchedPlot.id}`);
                return;
            }
        }

        if (project?.id) {
            navigate(`/project-details/${projectSlug || project.id}`);
            return;
        }

        navigate("/projects");
    };

    const [countryCode, setCountryCode] = useState("+91");
    const [form, setForm] = useState({
        fullName: "",
        mobile: "",
        email: "",
        plot: preSelectedPlot,
        preferredDate: "",
        preferredTime: "",
        message: "",
    });

    // Prefill user details if logged in
    useEffect(() => {
        if (authUser) {
            const parsedPhone = parsePhoneString(authUser.phone || "");
            if (parsedPhone.countryCode) {
                setCountryCode(parsedPhone.countryCode);
            }
            setForm((prev) => ({
                ...prev,
                fullName: authUser.name || prev.fullName,
                email: authUser.email || prev.email,
                mobile: parsedPhone.digits || prev.mobile,
            }));
        }
    }, [authUser]);

    const [errors, setErrors] = useState({});
    const [status, setStatus] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!project) {
            navigate("/projects");
        }
    }, [project, navigate]);

    const updateForm = (key) => (event) => {
        const value = event.target.value;
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: undefined }));
    };

    const validateMobile = (mobile) => {
        const cleaned = mobile.replace(/\D/g, "");
        return cleaned.length >= 7 && cleaned.length <= 12;
    };

    const validateEmail = (email) => {
        if (!email.trim()) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
    };

    const validateDate = (dateStr) => {
        if (!dateStr) return false;
        const selectedDate = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return selectedDate >= today;
    };

    const validate = () => {
        const newErrors = {};

        if (!form.fullName.trim()) {
            newErrors.fullName = "Full name is required";
        }

        if (!form.mobile.trim()) {
            newErrors.mobile = "Mobile number is required";
        } else if (!validateMobile(form.mobile)) {
            newErrors.mobile = "Please enter a valid mobile number (e.g. 10 digits)";
        }

        if (!validateEmail(form.email)) {
            newErrors.email = "Enter a valid email address";
        }

        if (!form.preferredDate) {
            newErrors.preferredDate = "Preferred date is required";
        } else if (!validateDate(form.preferredDate)) {
            newErrors.preferredDate = "Date must be today or in the future";
        }

        if (!form.preferredTime) {
            newErrors.preferredTime = "Preferred time is required";
        }

        return newErrors;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        const validationErrors = validate();
        setErrors(validationErrors);

        if (Object.keys(validationErrors).length) {
            return;
        }

        setIsSubmitting(true);
        setStatus("sending");

        try {
            await publicApi.submitSiteVisit({
                fullName: form.fullName,
                mobile: formatFullPhone(countryCode, form.mobile),
                email: form.email,
                plot: form.plot,
                preferredDate: form.preferredDate,
                preferredTime: form.preferredTime,
                message: form.message,
                projectId: project?._id || project?.id || projectId,
            });

            setStatus("ok");
            setForm({
                fullName: "",
                mobile: "",
                email: "",
                plot: "",
                preferredDate: "",
                preferredTime: "",
                message: "",
            });
        } catch (err) {
            console.error("Site visit submission failed:", err);
            setStatus("error");
            setErrors({ submit: err.message || "Failed to schedule site visit. Please try again." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const getMinDate = () => {
        const today = new Date();
        return today.toISOString().split("T")[0];
    };

    if (!project) {
        return (
            <>
                <Navbar />
                <div className="form-page">
                    <div className="form-container">
                        <div className="not-found">
                            <AlertCircle size={48} />
                            <h2>Project Not Found</h2>
                            <p>The project you're looking for doesn't exist.</p>
                            <button className="back-btn" onClick={() => navigate("/projects")}>
                                <ArrowRight size={16} /> Back to Projects
                            </button>
                        </div>
                    </div>
                </div>
                <Footer />
            </>
        );
    }

    return (
        <main className="site-visit-form-page">
            <Navbar />

            <div className="form-page">
                <div className="form-container">
                    <div className="form-header">
                        <div className="project-info">
                            <MapPin size={20} />
                            <div>
                                <h1>Book a Site Visit</h1>
                                <p className="project-name">{project.title}</p>
                            </div>
                        </div>
                    </div>

                    <form className="site-visit-form" onSubmit={handleSubmit} noValidate>
                        <div className="form-section">
                            <h3 className="section-title">Personal Details</h3>

                            <div className="field">
                                <label htmlFor="fullName">Full Name <span className="required">*</span></label>
                                <div className={`input-wrapper ${authUser ? "read-only" : ""}`}>
                                    <User size={18} />
                                    <input
                                        id="fullName"
                                        type="text"
                                        className={`input ${authUser ? "read-only-input" : ""} ${errors.fullName ? "error" : ""}`}
                                        placeholder="Enter your full name"
                                        value={form.fullName}
                                        onChange={updateForm("fullName")}
                                        disabled={isSubmitting || Boolean(authUser)}
                                        readOnly={Boolean(authUser)}
                                    />
                                </div>
                                {errors.fullName && <span className="error-text">{errors.fullName}</span>}
                            </div>

                            <div className="field">
                                <label htmlFor="mobile">Mobile Number <span className="required">*</span></label>
                                <PhoneInputField
                                    id="mobile"
                                    name="mobile"
                                    countryCode={countryCode}
                                    onCountryCodeChange={(code) => setCountryCode(code)}
                                    value={form.mobile}
                                    onChange={(digits) => {
                                        setForm((prev) => ({ ...prev, mobile: digits }));
                                        setErrors((prev) => ({ ...prev, mobile: undefined }));
                                    }}
                                    placeholder="10-digit number"
                                    maxLength={10}
                                    disabled={isSubmitting}
                                    error={Boolean(errors.mobile)}
                                    icon={Phone}
                                />
                                {errors.mobile && <span className="error-text">{errors.mobile}</span>}
                            </div>

                            <div className="field">
                                <label htmlFor="email">Email</label>
                                <div className={`input-wrapper ${authUser ? "read-only" : ""}`}>
                                    <Mail size={18} />
                                    <input
                                        id="email"
                                        type="email"
                                        className={`input ${authUser ? "read-only-input" : ""} ${errors.email ? "error" : ""}`}
                                        placeholder="Enter your email (optional)"
                                        value={form.email}
                                        onChange={updateForm("email")}
                                        disabled={isSubmitting || Boolean(authUser)}
                                        readOnly={Boolean(authUser)}
                                    />
                                </div>
                                {errors.email && <span className="error-text">{errors.email}</span>}
                            </div>
                        </div>

                        <div className="form-section">
                            <h3 className="section-title">Project Details</h3>

                            <div className="field">
                                <label htmlFor="project">Project <span className="required">*</span></label>
                                <div className="input-wrapper read-only">
                                    <MapPin size={18} />
                                    <input
                                        id="project"
                                        type="text"
                                        className="input read-only-input"
                                        value={project.title}
                                        readOnly
                                        disabled={isSubmitting}
                                    />
                                </div>
                                <span className="hint-text">Automatically filled from the project you selected</span>
                            </div>

                            <div className="field">
                                <label htmlFor="plot">Plot (Optional)</label>
                                <div className="input-wrapper">
                                    <MapPin size={18} />
                                    <select
                                        id="plot"
                                        className={`input ${errors.plot ? "error" : ""}`}
                                        value={form.plot}
                                        onChange={updateForm("plot")}
                                        disabled={isSubmitting}
                                    >
                                        <option value="">Select a plot (optional)</option>
                                        {projectPlots.map((plot) => (
                                            <option key={plot.id} value={plot.plotNumber}>
                                                Plot {plot.plotNumber} - {plot.size} - {plot.facing} Facing - {plot.price} - {plot.status}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="form-section">
                            <h3 className="section-title">Visit Schedule</h3>

                            <div className="schedule-row">
                                <div className="field">
                                    <label htmlFor="preferredDate">Preferred Date <span className="required">*</span></label>
                                    <div className="input-wrapper">
                                        <Calendar size={18} />
                                        <input
                                            id="preferredDate"
                                            type="date"
                                            className={`input ${errors.preferredDate ? "error" : ""}`}
                                            min={getMinDate()}
                                            value={form.preferredDate}
                                            onChange={updateForm("preferredDate")}
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                    {errors.preferredDate && <span className="error-text">{errors.preferredDate}</span>}
                                </div>

                                <div className="field">
                                    <label htmlFor="preferredTime">Preferred Time <span className="required">*</span></label>
                                    <div className="input-wrapper">
                                        <Clock size={18} />
                                        <select
                                            id="preferredTime"
                                            className={`input ${errors.preferredTime ? "error" : ""}`}
                                            value={form.preferredTime}
                                            onChange={updateForm("preferredTime")}
                                            disabled={isSubmitting}
                                        >
                                            <option value="">Select time</option>
                                            <option value="09:00">9:00 AM</option>
                                            <option value="10:00">10:00 AM</option>
                                            <option value="11:00">11:00 AM</option>
                                            <option value="12:00">12:00 PM</option>
                                            <option value="14:00">2:00 PM</option>
                                            <option value="15:00">3:00 PM</option>
                                            <option value="16:00">4:00 PM</option>
                                            <option value="17:00">5:00 PM</option>
                                        </select>
                                    </div>
                                    {errors.preferredTime && <span className="error-text">{errors.preferredTime}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="form-section">
                            <h3 className="section-title">Additional Information</h3>

                            <div className="field">
                                <label htmlFor="message">Message</label>
                                <div className="input-wrapper textarea-wrapper">
                                    <textarea
                                        id="message"
                                        className={`input ${errors.message ? "error" : ""}`}
                                        placeholder="Any specific requirements or questions for your site visit..."
                                        rows={4}
                                        value={form.message}
                                        onChange={updateForm("message")}
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="submit-row">
                            <button
                                type="submit"
                                className="submit-btn"
                                disabled={isSubmitting}
                            >
                                <span>{isSubmitting ? "Submitting..." : "Submit Request"}</span>
                                <span className="submit-icon">
                                    <ArrowRight size={18} />
                                </span>
                            </button>

                            {status === "ok" && (
                                <div className="success-message">
                                    <div className="success-icon">
                                        <CheckCircle size={24} />
                                    </div>
                                    <p>Your site visit request has been submitted successfully.</p>
                                    <p className="success-subtext">Our team will contact you shortly to confirm the appointment.</p>
                                </div>
                            )}

                            {status === "error" && (
                                <span className="status failed">
                                    Something went wrong. Please try again.
                                </span>
                            )}
                        </div>
                    </form>
                </div>
            </div>

            <Footer />
        </main>
    );
}