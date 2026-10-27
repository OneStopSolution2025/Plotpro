import Navbar from "../components/Navbar";
import "../css/ProjectDetails.css";
import PlotCard from "../components/PlotCard";
import ProjectPlotPanel from "../components/ProjectPlotPanel";
import Footer from '../components/Footer'

import {
    MapPinCheckInside,
    LandPlot,
    Share2,
    Heart,
    CircleCheckBig,
    ShieldCheck,
    Trees,
    Construction,
    Lightbulb,
    Droplets,
    Baby,
    ArrowRight,
    CheckCircle2,
    Sparkles,
    Building2,
    Home,
    Car,
    Zap,
    Leaf,
    MapPin,
    Wrench,
    Sun,
    ExternalLink,
    Check,
    Phone,
    Layers
} from "lucide-react";

import entrance from "../assets/Projects/Greenvalley/Entrance.png";

import { useState, useEffect, useRef, useMemo } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { useProjects, findProjectByIdentifier, getProjectRouteSlug, normalizeProject } from "../context/ProjectContext";

gsap.registerPlugin(ScrollTrigger);
import { usePlots } from "../context/PlotContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { shareContent } from "../utils/shareUtils";
import { userApi, publicApi } from "../services/api";
import { commonBenefits, commonHighlights, commonAmenities } from "../data/projects";

// Icon mapping functions for dynamic icons based on content
const getBenefitIcon = (title) => {
    const lower = title.toLowerCase();
    if (lower.includes("prime") || lower.includes("location")) return <LandPlot />;
    if (lower.includes("gated") || lower.includes("community") || lower.includes("security") || lower.includes("safe")) return <ShieldCheck />;
    if (lower.includes("road") || lower.includes("wide") || lower.includes("access")) return <Construction />;
    if (lower.includes("green") || lower.includes("environment") || lower.includes("nature") || lower.includes("peaceful")) return <Trees />;
    return <Sparkles />;
};

const getAmenityIcon = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes("security") || lower.includes("gate") || lower.includes("safe")) return <ShieldCheck />;
    if (lower.includes("road") || lower.includes("blacktop") || lower.includes("construction")) return <Construction />;
    if (lower.includes("light") || lower.includes("lamp")) return <Lightbulb />;
    if (lower.includes("drain") || lower.includes("sewer") || lower.includes("underground")) return <Droplets />;
    if (lower.includes("water") || lower.includes("supply")) return <Droplets />;
    if (lower.includes("tree") || lower.includes("avenue") || lower.includes("park") || lower.includes("landscape") || lower.includes("green")) return <Trees />;
    if (lower.includes("play") || lower.includes("children") || lower.includes("sport") || lower.includes("recreation")) return <Baby />;
    if (lower.includes("club") || lower.includes("building") || lower.includes("house") || lower.includes("community")) return <Building2 />;
    if (lower.includes("home") || lower.includes("house")) return <Home />;
    if (lower.includes("car") || lower.includes("vehicle") || lower.includes("parking")) return <Car />;
    if (lower.includes("electric") || lower.includes("power") || lower.includes("utility")) return <Zap />;
    if (lower.includes("walk") || lower.includes("track") || lower.includes("trail") || lower.includes("path")) return <Leaf />;
    if (lower.includes("sun") || lower.includes("solar")) return <Sun />;
    if (lower.includes("map") || lower.includes("location") || lower.includes("pin")) return <MapPin />;
    if (lower.includes("wrench") || lower.includes("maintenance") || lower.includes("repair")) return <Wrench />;
    return <Building2 />;
};

function ProjectDetails() {

    const { projects, isLoading } = useProjects();
    const { plots, fetchPlotsForProject } = usePlots();

    const { id } = useParams();
    const navigate = useNavigate();

    const matchedProject = findProjectByIdentifier(projects, id);
    const [fetchedProject, setFetchedProject] = useState(null);
    const [isFetchingDirect, setIsFetchingDirect] = useState(false);

    // Fetch authoritative project details directly from backend API
    useEffect(() => {
        if (id) {
            let isMounted = true;
            setIsFetchingDirect(true);
            publicApi.getProjectById(id)
                .then((res) => {
                    if (isMounted && res?.success && res.data) {
                        setFetchedProject(normalizeProject(res.data));
                    }
                })
                .catch((err) => {
                    console.warn(`[ProjectDetails] Could not fetch project by ID ${id}:`, err.message);
                })
                .finally(() => {
                    if (isMounted) setIsFetchingDirect(false);
                });

            return () => { isMounted = false; };
        }
    }, [id]);

    const project = fetchedProject || matchedProject;
    const projectIdKey = project?._id || project?.customId || project?.id;

    useEffect(() => {
        if (projectIdKey) {
            fetchPlotsForProject(projectIdKey);
        }
    }, [projectIdKey, fetchPlotsForProject]);

    const DEFAULT_PROJECT_IMAGE = "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1200&auto=format&fit=crop&q=80";
    const layoutImage =
        project?.layout?.referenceImageUrl ||
        project?.layout?.imageUrl ||
        project?.image ||
        (Array.isArray(project?.images) && project.images[0]) ||
        DEFAULT_PROJECT_IMAGE;

    const rawProjectImages = [
        ...(project?.layout?.referenceImageUrl ? [project.layout.referenceImageUrl] : []),
        ...(project?.layout?.imageUrl && project.layout.imageUrl !== project?.layout?.referenceImageUrl ? [project.layout.imageUrl] : []),
        ...(Array.isArray(project?.images) ? project.images : []),
        ...(project?.image ? [project.image] : [])
    ].filter((img, idx, arr) => img && arr.indexOf(img) === idx);

    const projectImages = rawProjectImages.length > 0 ? rawProjectImages : [DEFAULT_PROJECT_IMAGE];

    const [selectedImage, setSelectedImage] = useState(null);
    const [isPlotPanelOpen, setIsPlotPanelOpen] = useState(false);
    const activeImage = selectedImage || layoutImage || projectImages[0] || DEFAULT_PROJECT_IMAGE;

    const { isAuthenticated } = useAuth();
    const location = useLocation();
    const { showToast } = useToast();
    const [isSaved, setIsSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isHeartPopping, setIsHeartPopping] = useState(false);
    const [heartParticles, setHeartParticles] = useState([]);
    const [isSharing, setIsSharing] = useState(false);
    const [isShared, setIsShared] = useState(false);

    useEffect(() => {
        if (!isAuthenticated || !projectIdKey) return;
        let isMounted = true;
        userApi.getWishlist()
            .then((res) => {
                if (!isMounted) return;
                const savedProjects = res?.data?.projects || [];
                const found = savedProjects.some(
                    (p) => String(p._id) === String(project._id) || String(p.customId) === String(project.id) || String(p._id) === String(project.id)
                );
                setIsSaved(found);
            })
            .catch(() => { });
        return () => {
            isMounted = false;
        };
    }, [isAuthenticated, projectIdKey]);

    const triggerHeartAnimation = () => {
        setIsHeartPopping(true);
        // Create 5-6 delightful floating mini-hearts with random angles
        const particles = Array.from({ length: 6 }).map((_, i) => ({
            id: Date.now() + i,
            tx: `${(Math.random() - 0.5) * 60}px`,
            ty: `-${25 + Math.random() * 35}px`,
            icon: i % 2 === 0 ? "❤️" : "✨",
        }));
        setHeartParticles(particles);
        setTimeout(() => setIsHeartPopping(false), 700);
        setTimeout(() => setHeartParticles([]), 1000);
    };

    const handleToggleSave = async () => {
        if (!isAuthenticated) {
            navigate("/login", { state: { from: location.pathname } });
            return;
        }
        setIsSaving(true);
        try {
            const targetId = project._id || project.id;
            const res = await userApi.toggleSaveProject(targetId);
            if (res?.success) {
                setIsSaved(res.saved);
                if (res.saved) {
                    triggerHeartAnimation();
                    showToast("Added to your Wishlist!", "success");
                } else {
                    showToast("Removed from Wishlist", "info");
                }
            }
        } catch (err) {
            console.error("Failed to toggle wishlist project:", err);
            showToast("Failed to update Wishlist", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleShare = async () => {
        if (isSharing || !project) return;
        setIsSharing(true);
        try {
            const title = project.title || "PlotPro Project";
            const text = project.description
                ? `${project.title} - ${project.location || ""}`
                : `Explore ${project.title} on PlotPro`;
            const url = window.location.href;

            const result = await shareContent({ title, text, url });
            if (result.success) {
                setIsShared(true);
                setTimeout(() => setIsShared(false), 2500);
                showToast(
                    result.method === "share"
                        ? "Project shared successfully!"
                        : "Project link copied to clipboard!",
                    "success"
                );
            } else if (!result.cancelled) {
                showToast("Could not share or copy link. Please copy the URL from your address bar.", "error");
            }
        } catch (err) {
            console.error("Error sharing project:", err);
            showToast("Failed to share project link.", "error");
        } finally {
            setIsSharing(false);
        }
    };

    const animatedProjectIdRef = useRef(null);

    useEffect(() => {
        if (!project || !projectIdKey) return;

        // Prevent re-running entrance animations on background data syncs for the same project
        if (animatedProjectIdRef.current === projectIdKey) return;
        animatedProjectIdRef.current = projectIdKey;

        const ctx = gsap.context(() => {
            // 1. Gallery and Hero details entrance
            gsap.from(".project-gallery > *", {
                opacity: 0,
                y: 30,
                duration: 0.8,
                stagger: 0.15,
                ease: "power3.out",
            });

            // 2. Generic section reveals as user scrolls down
            gsap.utils.toArray(".project-reveal").forEach((section) => {
                gsap.from(section, {
                    opacity: 0,
                    y: 45,
                    duration: 0.8,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: section,
                        start: "top 85%",
                        once: true,
                    },
                });
            });

            // 3. Staggered Benefits cards
            gsap.from(".benefit-card", {
                opacity: 0,
                y: 35,
                duration: 0.6,
                stagger: 0.1,
                ease: "power2.out",
                scrollTrigger: {
                    trigger: ".benefits",
                    start: "top 85%",
                    once: true,
                },
            });

            // 4. Staggered Amenities cards
            gsap.from(".amenity-card", {
                opacity: 0,
                scale: 0.9,
                duration: 0.5,
                stagger: 0.08,
                ease: "power2.out",
                scrollTrigger: {
                    trigger: ".amenities-grid",
                    start: "top 85%",
                    once: true,
                },
            });

            // 5. Location and Connectivity items
            gsap.from(".location-item", {
                opacity: 0,
                x: -25,
                duration: 0.5,
                stagger: 0.08,
                ease: "power2.out",
                scrollTrigger: {
                    trigger: ".location-list",
                    start: "top 85%",
                    once: true,
                },
            });

            // 6. Plots grid cards entrance
            gsap.from(".plots-grid > *", {
                opacity: 0,
                y: 30,
                duration: 0.6,
                stagger: 0.12,
                ease: "power2.out",
                scrollTrigger: {
                    trigger: ".plots-grid",
                    start: "top 85%",
                    once: true,
                },
            });
        });

        return () => ctx.revert();
    }, [projectIdKey, project]);

    if (!project) {
        if (isLoading || isFetchingDirect) {
            return (
                <>
                    <Navbar />
                    <div className="project-not-found" style={{ textAlign: "center", padding: "80px 20px" }}>
                        <h2>Loading Project...</h2>
                    </div>
                    <Footer />
                </>
            );
        }
        return (
            <>
                <Navbar />
                <div className="project-not-found">
                    <h2>Project Not Found</h2>
                </div>
                <Footer />
            </>
        );
    }

    const projectPlots = useMemo(() => {
        if (!project) return [];
        const seenIds = new Set();
        const seenNumbers = new Set();
        return plots.filter((plot) => {
            const matchesProject =
                String(plot.projectId) === String(project.id) ||
                String(plot.projectCustomId) === String(project.customId) ||
                String(plot.projectMongoId) === String(project._id) ||
                String(plot.projectId) === String(project._id) ||
                String(plot.projectId) === String(project.customId);

            if (!matchesProject) return false;

            const plotKey = String(plot._id || plot.id || "");
            const plotNum = String(plot.plotNumber || "").trim().toLowerCase();

            if (plotKey && seenIds.has(plotKey)) return false;
            if (plotNum && seenNumbers.has(plotNum)) return false;

            if (plotKey) seenIds.add(plotKey);
            if (plotNum) seenNumbers.add(plotNum);

            return true;
        }).sort((a, b) => {
            const numA = String(a.plotNumber || "").trim();
            const numB = String(b.plotNumber || "").trim();
            return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: "base" });
        });
    }, [plots, project]);

    // Project-specific benefits: no silent fallback to generic defaults
    const projectBenefits = Array.isArray(project.benefits) ? project.benefits : [];

    // Project-specific highlights: no silent fallback to generic defaults
    const projectHighlights = Array.isArray(project.highlights) ? project.highlights : [];

    // Project-specific amenities: no silent fallback to generic defaults
    const projectAmenities = Array.isArray(project.amenities) ? project.amenities : [];

    const availablePlots = projectPlots.filter((p) => (p.status || "").toLowerCase() === "available");
    const reservedPlots = projectPlots.filter((p) => (p.status || "").toLowerCase() === "reserved");
    const soldPlots = projectPlots.filter((p) => (p.status || "").toLowerCase() === "sold");

    return (
        <>


            <main className="project-details-page">
                <Navbar />

                <div className="project-breadcrumb">
                    <Link to="/">Home</Link>

                    <ArrowRight />

                    <Link to="/projects">Projects</Link>

                    <ArrowRight />

                    <strong>{project.title}</strong>
                </div>


                <section className="project-gallery">

                    {/* Left Hero: Clickable Layout Display Image (Opens Right Plot Selection Panel) */}
                    <div className="image-container">
                        <div
                            className="big-container layout-clickable-hero"
                            onClick={() => setIsPlotPanelOpen(true)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setIsPlotPanelOpen(true);
                                }
                            }}
                            title="Click to explore interactive plot inventory"
                        >
                            <img
                                className="big-image"
                                src={activeImage}
                                alt={project.title}
                                onError={(e) => {
                                    if (e.target.src !== DEFAULT_PROJECT_IMAGE) {
                                        e.target.onerror = null;
                                        e.target.src = DEFAULT_PROJECT_IMAGE;
                                    }
                                }}
                            />
                            <div className="layout-overlay-pill">
                                <LandPlot size={16} />
                                <span>Master Layout • Click to View Plots</span>
                            </div>
                        </div>

                        {projectImages.length > 1 && (
                            <div className="small-container">
                                {projectImages.map((image, index) => (
                                    <img
                                        key={index}
                                        src={image}
                                        alt={`${project.title} thumbnail ${index + 1}`}
                                        className={`thumbnail ${activeImage === image ? "active-thumb" : ""}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedImage(image);
                                        }}
                                        onError={(e) => {
                                            if (e.target.src !== DEFAULT_PROJECT_IMAGE) {
                                                e.target.onerror = null;
                                                e.target.src = DEFAULT_PROJECT_IMAGE;
                                            }
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="project-details">

                        <div className="share-detail">

                            <div className="bt">
                                {project.plotType || "Residential"}
                            </div>

                            <div className="share">

                                <button
                                    type="button"
                                    className="hero-action-pill"
                                    onClick={handleToggleSave}
                                    disabled={isSaving}
                                    title={isSaved ? "Remove from Wishlist" : "Save to Wishlist"}
                                    aria-label={isSaved ? "Remove from Wishlist" : "Save to Wishlist"}
                                    style={isSaved ? { color: "#ef4444", borderColor: "#fca5a5", background: "#fef2f2" } : {}}
                                >
                                    <span className="heart-button-wrapper">
                                        <span className={`heart-icon-animated ${isHeartPopping ? "popping" : ""}`}>
                                            <Heart size={16} fill={isSaved ? "#ef4444" : "none"} color={isSaved ? "#ef4444" : "currentColor"} />
                                        </span>
                                        {heartParticles.map((p) => (
                                            <span
                                                key={p.id}
                                                className="floating-heart-particle"
                                                style={{ "--tx": p.tx, "--ty": p.ty }}
                                            >
                                                {p.icon}
                                            </span>
                                        ))}
                                    </span>
                                    <span>{isSaved ? "Saved" : "Save"}</span>
                                </button>

                                <button
                                    type="button"
                                    className="hero-action-pill"
                                    onClick={handleShare}
                                    disabled={isSharing}
                                    title={isShared ? "Link Copied" : "Share Project"}
                                    aria-label="Share this project"
                                    style={isShared ? { color: "#16a34a", borderColor: "#86efac", background: "#f0fdf4" } : {}}
                                >
                                    {isShared ? <Check size={16} color="#16a34a" /> : <Share2 size={16} />}
                                    <span>{isShared ? "Copied!" : "Share"}</span>
                                </button>

                            </div>

                        </div>


                        <div className="pro-de">

                            <h1>
                                {project.title}
                            </h1>


                            <div className="location2">

                                <MapPinCheckInside size={18} />

                                <p>
                                    {project.location || "Location on request"}
                                </p>

                            </div>


                            <p className="descrip">
                                {project.details ? project.details : `Exclusive gated-community development in ${project.location || "a prime strategic location"} featuring thoughtfully planned plots.`}
                            </p>

                            {/* Unified Pricing & Inventory Action Card */}
                            <div className="project-pricing-card">
                                <div className="pricing-card-main">
                                    <div className="pricing-left">
                                        <span className="pricing-eyebrow">PRICE STARTING FROM</span>
                                        <div className="pricing-value-row">
                                            <span className="pricing-currency">₹</span>
                                            <span className="pricing-amount">
                                                {project.plotPrice ? String(project.plotPrice).replace(/^[₹\s]+/, "") : "On Request"}
                                            </span>
                                            {project.plotPrice && <span className="pricing-suffix">/ Plot</span>}
                                        </div>
                                    </div>

                                    <div className="pricing-right">
                                        <div className="inventory-pill">
                                            <span className="status-dot-pulse"></span>
                                            <span className="inventory-pill-text">
                                                <strong>{availablePlots.length}</strong> Plots Available
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className="explore-plots-trigger-btn"
                                    onClick={() => setIsPlotPanelOpen(true)}
                                >
                                    <span className="trigger-btn-content">
                                        <Layers size={17} />
                                        <span>Explore Plot Inventory</span>
                                    </span>
                                    <span className="trigger-btn-badge">
                                        <span>View</span>
                                        <ArrowRight size={15} />
                                    </span>
                                </button>
                            </div>

                            {/* Conversion Actions */}
                            <div className="plot-hero-actions">
                                <button
                                    type="button"
                                    className="primary-plot-btn"
                                    onClick={() => navigate(`/site-visit/${project.id}`, {
                                        state: {
                                            from: location.pathname
                                        }
                                    })}
                                >
                                    <span>Book a Site Visit</span>
                                    <ArrowRight size={18} />
                                </button>

                                <button
                                    type="button"
                                    className="secondary-plot-btn"
                                    onClick={() => navigate(`/enquiry/${project.id}`, {
                                        state: {
                                            from: location.pathname
                                        }
                                    })}
                                >
                                    <Phone size={18} />
                                    <span>Enquiry</span>
                                </button>
                            </div>

                        </div>

                    </div>

                </section>



                {projectBenefits.length > 0 && (
                    <>
                        <div className="benefits-header">
                            <p className="section-tag">
                                WHY CHOOSE US
                            </p>
                            <h2>
                                Benefits of <br /><span>{project.title}</span>
                            </h2>
                        </div>

                        <section className="benefits">
                            {projectBenefits.map((benefit, index) => (
                                <div className="benefit-card" key={index}>
                                    <div className="benefit-icon">
                                        {getBenefitIcon(benefit.title)}
                                    </div>
                                    <h3>
                                        {benefit.title}
                                    </h3>
                                    <p>
                                        {benefit.description}
                                    </p>
                                </div>
                            ))}
                        </section>
                    </>
                )}

                <section className="about-section project-reveal">

                    <div className="about-content">

                        <p className="section-tag">
                            ABOUT
                        </p>

                        <h2>
                            About The Project
                        </h2>

                        <p>
                            {project.about?.description || "No description provided."}
                        </p>

                        <div className="approval-box">

                            <div className="approval-item">

                                <CircleCheckBig />

                                <span>
                                    DTCP Approved
                                </span>

                            </div>


                            <div className="approval-item">

                                <CircleCheckBig />

                                <span>
                                    RERA Compliant
                                </span>

                            </div>

                        </div>

                        <div className="patta-verify-wrap">

                            <a
                                href="https://eservices.tn.gov.in/eservicesnew/home.html"
                                className="patta-verify-btn"
                                target="_blank"
                                rel="noreferrer"
                            >
                                <span>Verify Patta / Chitta</span>
                                <ArrowRight />
                            </a>

                        </div>

                    </div>
                    <div className="highlights-content">

                        <p className="section-tag">
                            WHY INVEST
                        </p>

                        <h2>
                            Project Highlights
                        </h2>

                        {projectHighlights.length > 0 ? (
                            <div className="highlight-list">
                                {projectHighlights.map((highlight, index) => (
                                    <p key={index}>
                                        <CheckCircle2 />
                                        {highlight}
                                    </p>
                                ))}
                            </div>
                        ) : (
                            <div className="highlights-empty-state" style={{ marginTop: "20px", color: "#64748b", fontSize: "14px", lineHeight: "1.6" }}>
                                <p style={{ margin: 0 }}>Specific highlights and investment features will be updated soon for this project.</p>
                            </div>
                        )}

                    </div>

                    <div className="about-image">

                        <img
                            src={entrance}
                            alt={project.title}
                        />

                    </div>

                </section>

                {projectAmenities.length > 0 && (
                    <section className="amenities-section project-reveal">

                        <div className="amenities-header">

                            <p className="section-tag">
                                FEATURES
                            </p>

                            <h2>
                                Project <br /> <span>Amenities</span>
                            </h2>

                        </div>

                        <div className="amenities-grid">

                            {projectAmenities.map((amenity, index) => (

                                <div className="amenity-card" key={index}>

                                    {getAmenityIcon(amenity)}

                                    <p>
                                        {amenity}
                                    </p>

                                </div>

                            ))}

                        </div>

                    </section>
                )}
                <section className="location-section project-reveal">

                    <div className="location-list">

                        <h2>
                            Location & Connectivity
                        </h2>

                        {project.locationConnectivity?.map((item, index) => (
                            <div className="location-item" key={index}>

                                <MapPinCheckInside />

                                <span>
                                    {item.name}
                                </span>

                                <b>
                                    {item.distance}
                                </b>

                            </div>
                        ))}

                    </div>

                    {(() => {
                        const rawLoc = project?.location?.trim() || "";
                        const rawCity = project?.city?.trim() || "";
                        let resolvedLocation = "";
                        if (rawLoc && rawCity) {
                            resolvedLocation = rawLoc.toLowerCase().includes(rawCity.toLowerCase())
                                ? rawLoc
                                : `${rawLoc}, ${rawCity}`;
                        } else {
                            resolvedLocation = rawLoc || rawCity;
                        }
                        const mapQuery = resolvedLocation ? encodeURIComponent(resolvedLocation) : "";
                        const projectTitle = project?.title?.trim() || "Project";

                        return mapQuery ? (
                            <div className="map-box">
                                <iframe
                                    src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                                    width="100%"
                                    height="100%"
                                    style={{ border: 0 }}
                                    allowFullScreen=""
                                    loading="lazy"
                                    title={`${projectTitle} Location`}
                                ></iframe>
                            </div>
                        ) : (
                            <div
                                className="map-box"
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: "30px 20px",
                                    textAlign: "center",
                                    background: "#f1f5f9",
                                    color: "#64748b",
                                    gap: "10px",
                                }}
                            >
                                <MapPin size={32} style={{ color: "#94a3b8" }} />
                                <strong style={{ color: "#334155", fontSize: "15px" }}>Location Map Unavailable</strong>
                                <p style={{ margin: 0, fontSize: "13px", maxWidth: "320px", lineHeight: "1.5" }}>
                                    Map location details are currently unavailable for this project.
                                </p>
                            </div>
                        );
                    })()}

                    <div className="contact-card">

                        <div className="contact-icon">

                            <MapPinCheckInside />

                        </div>


                        <h2>
                            Interested in
                            <br />
                            This Project?
                        </h2>


                        <p>
                            Get in touch with our experts for more
                            details, site visit or best offers.
                        </p>


                        <button
                            onClick={() => navigate(`/enquiry/${project.id}`, {
                                state: {
                                    from: location.pathname
                                }
                            })}
                        >
                            Contact Us →
                        </button>

                    </div>

                </section>
                {/* Responsive Slide-Over Plot Selection Drawer */}
                <ProjectPlotPanel
                    isOpen={isPlotPanelOpen}
                    onClose={() => setIsPlotPanelOpen(false)}
                    project={project}
                    allProjects={projects}
                    plots={projectPlots}
                    isLoading={isLoading}
                    onRefresh={() => {
                        if (projectIdKey) {
                            fetchPlotsForProject(projectIdKey);
                        }
                    }}
                />

                <Footer />

            </main>
        </>
    );
}


export default ProjectDetails;