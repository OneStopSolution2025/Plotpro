import { useState, useEffect } from "react";
import "../css/EnquiryForm.css";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { ArrowRight, MapPin, User, Phone, Mail, AlertCircle, CheckCircle, MessageSquare, Smartphone, Mail as MailIcon } from "lucide-react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useProjects, getProjectRouteSlug, findProjectByIdentifier } from "../context/ProjectContext";
import { usePlots } from "../context/PlotContext";
import { publicApi } from "../services/api";

const CONTACT_METHODS = [
    { value: "phone", label: "Phone Call", icon: Smartphone },
    { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
    { value: "email", label: "Email", icon: MailIcon },
];

export default function EnquiryForm() {
    const { projectId } = useParams();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { projects } = useProjects();
    const { plots } = usePlots();

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

    const [form, setForm] = useState({
        fullName: "",
        mobile: "",
        email: "",
        plot: preSelectedPlot,
        contactMethod: "",
        message: "",
    });

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
        return cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned);
    };

    const validateEmail = (email) => {
        if (!email.trim()) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
    };

    const validate = () => {
        const newErrors = {};

        if (!form.fullName.trim()) {
            newErrors.fullName = "Full name is required";
        }

        if (!form.mobile.trim()) {
            newErrors.mobile = "Mobile number is required";
        } else if (!validateMobile(form.mobile)) {
            newErrors.mobile = "Enter a valid 10-digit Indian mobile number";
        }

        if (!validateEmail(form.email)) {
            newErrors.email = "Enter a valid email address";
        }

        if (!form.contactMethod) {
            newErrors.contactMethod = "Please select a preferred contact method";
        }

        if (!form.message.trim()) {
            newErrors.message = "Message is required";
        } else if (form.message.trim().length < 10) {
            newErrors.message = "Message must be at least 10 characters";
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
            await publicApi.submitEnquiry({
                fullName: form.fullName,
                mobile: form.mobile,
                email: form.email,
                plot: form.plot,
                contactMethod: form.contactMethod || "phone",
                message: form.message,
                projectId: project?.id || projectId,
            });

            setStatus("ok");
            setForm({
                fullName: "",
                mobile: "",
                email: "",
                plot: "",
                contactMethod: "",
                message: "",
            });
        } catch (err) {
            console.error("Enquiry submission failed:", err);
            setStatus("error");
            setErrors({ submit: err.message || "Failed to submit enquiry. Please try again." });
        } finally {
            setIsSubmitting(false);
        }
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
        <main className="enquiry-form-page">
            <Navbar />

            <div className="form-page">
                <div className="form-container">
                    <div className="form-header">
                        <div className="project-info">
                            <MapPin size={20} />
                            <div>
                                <h1>Enquiry</h1>
                                <p className="project-name">{project.title}</p>
                            </div>
                        </div>
                    </div>

                    <form className="enquiry-form" onSubmit={handleSubmit} noValidate>
                        <div className="form-section">
                            <h3 className="section-title">Personal Details</h3>

                            <div className="field">
                                <label htmlFor="fullName">Full Name <span className="required">*</span></label>
                                <div className="input-wrapper">
                                    <User size={18} />
                                    <input
                                        id="fullName"
                                        type="text"
                                        className={`input ${errors.fullName ? "error" : ""}`}
                                        placeholder="Enter your full name"
                                        value={form.fullName}
                                        onChange={updateForm("fullName")}
                                        disabled={isSubmitting}
                                    />
                                </div>
                                {errors.fullName && <span className="error-text">{errors.fullName}</span>}
                            </div>

                            <div className="field">
                                <label htmlFor="mobile">Mobile Number <span className="required">*</span></label>
                                <div className="input-wrapper">
                                    <Phone size={18} />
                                    <input
                                        id="mobile"
                                        type="tel"
                                        className={`input ${errors.mobile ? "error" : ""}`}
                                        placeholder="Enter 10-digit mobile number"
                                        value={form.mobile}
                                        onChange={updateForm("mobile")}
                                        maxLength={10}
                                        disabled={isSubmitting}
                                    />
                                </div>
                                {errors.mobile && <span className="error-text">{errors.mobile}</span>}
                            </div>

                            <div className="field">
                                <label htmlFor="email">Email <span className="required">*</span></label>
                                <div className="input-wrapper">
                                    <Mail size={18} />
                                    <input
                                        id="email"
                                        type="email"
                                        className={`input ${errors.email ? "error" : ""}`}
                                        placeholder="Enter your email"
                                        value={form.email}
                                        onChange={updateForm("email")}
                                        disabled={isSubmitting}
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
                            <h3 className="section-title">Contact Preference</h3>

                            <div className="field">
                                <label>Preferred Contact Method <span className="required">*</span></label>
                                <div className="contact-methods">
                                    {CONTACT_METHODS.map((method) => (
                                        <label
                                            key={method.value}
                                            className={`contact-method ${form.contactMethod === method.value ? "selected" : ""} ${errors.contactMethod ? "error" : ""}`}
                                        >
                                            <input
                                                type="radio"
                                                name="contactMethod"
                                                value={method.value}
                                                checked={form.contactMethod === method.value}
                                                onChange={updateForm("contactMethod")}
                                                disabled={isSubmitting}
                                            />
                                            <span className="method-content">
                                                <method.icon size={20} />
                                                <span>{method.label}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                {errors.contactMethod && <span className="error-text">{errors.contactMethod}</span>}
                            </div>
                        </div>

                        <div className="form-section">
                            <h3 className="section-title">Your Message</h3>

                            <div className="field">
                                <label htmlFor="message">Message <span className="required">*</span></label>
                                <div className="input-wrapper textarea-wrapper">
                                    <textarea
                                        id="message"
                                        className={`input ${errors.message ? "error" : ""}`}
                                        placeholder="Describe your enquiry, requirements, or any questions you have..."
                                        rows={5}
                                        value={form.message}
                                        onChange={updateForm("message")}
                                        disabled={isSubmitting}
                                    />
                                </div>
                                {errors.message && <span className="error-text">{errors.message}</span>}
                            </div>
                        </div>

                        <div className="submit-row">
                            <button
                                type="submit"
                                className="submit-btn"
                                disabled={isSubmitting}
                            >
                                <span>{isSubmitting ? "Submitting..." : "Submit Enquiry"}</span>
                                <span className="submit-icon">
                                    <ArrowRight size={18} />
                                </span>
                            </button>

                            {status === "ok" && (
                                <div className="success-message">
                                    <div className="success-icon">
                                        <CheckCircle size={24} />
                                    </div>
                                    <p>Thank you! Your enquiry has been submitted successfully.</p>
                                    <p className="success-subtext">Our team will get back to you shortly via your preferred contact method.</p>
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