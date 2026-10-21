import { useEffect, useState, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useProjects, findProjectByIdentifier, getProjectRouteSlug, normalizeProject } from "../context/ProjectContext";
import { usePlots, normalizePlot } from "../context/PlotContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { shareContent } from "../utils/shareUtils";
import { userApi, publicApi } from "../services/api";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

import "../css/PlotDetails.css";

import {
    MapPin,
    Heart,
    Share2,
    Ruler,
    Compass,
    FileCheck,
    Road,
    Droplets,
    Waves,
    Zap,
    ArrowRight,
    ExternalLink,
    Phone,
    CalendarDays,
    Check,
    MapPinned,
} from "lucide-react";

import hospital from '../assets/Plotdetails/hospital.png'
import shoppingmall from '../assets/Plotdetails/shoppingmall.png'
import road from '../assets/Plotdetails/road.png'
import bus from '../assets/Plotdetails/bus.png'
import train from '../assets/Plotdetails/train.png'
import school from '../assets/Plotdetails/school.png'

gsap.registerPlugin(ScrollTrigger);

function PlotDetails() {

    const { projectName, plotNumber, id } = useParams();
    const navigate = useNavigate();
    const { plots, fetchPlotsForProject } = usePlots();
    const { projects, isLoading: isLoadingProjects } = useProjects();
    const [isFetchingPlots, setIsFetchingPlots] = useState(false);

    // 1. Resolve project and direct plot
    const matchedProject = projectName ? findProjectByIdentifier(projects, projectName) : null;
    const [fetchedProject, setFetchedProject] = useState(null);
    const [fetchedPlot, setFetchedPlot] = useState(null);
    const [isFetchingDirectPlot, setIsFetchingDirectPlot] = useState(false);

    // Direct plot fetch for legacy / direct /plot-details/:id
    useEffect(() => {
        if (id) {
            let isMounted = true;
            setIsFetchingDirectPlot(true);
            publicApi.getPlotById(id)
                .then(async (res) => {
                    if (isMounted && res?.success && res.data) {
                        const norm = normalizePlot(res.data);
                        setFetchedPlot(norm);
                        const projId = norm.projectId || norm.projectCustomId || norm.projectMongoId;
                        if (projId) {
                            try {
                                const pRes = await publicApi.getProjectById(projId);
                                if (isMounted && pRes?.success && pRes.data) {
                                    setFetchedProject(normalizeProject(pRes.data));
                                }
                            } catch {}
                        }
                    }
                })
                .catch(() => {})
                .finally(() => {
                    if (isMounted) setIsFetchingDirectPlot(false);
                });
            return () => { isMounted = false; };
        } else {
            setFetchedPlot(null);
        }
    }, [id]);

    // Fallback if not found in local memory
    useEffect(() => {
        if (!matchedProject && projectName) {
            let isMounted = true;
            publicApi.getProjectById(projectName)
                .then((res) => {
                    if (isMounted && res?.success && res.data) {
                        setFetchedProject(normalizeProject(res.data));
                    }
                })
                .catch(() => {});
            return () => { isMounted = false; };
        } else if (matchedProject) {
            setFetchedProject(null);
        }
    }, [matchedProject, projectName]);

    let project = matchedProject || fetchedProject;

    if (!project && id) {
        const directPlot = fetchedPlot || plots.find(
            (item) => String(item.id) === String(id) || String(item.customId) === String(id) || String(item._id) === String(id)
        );
        if (directPlot) {
            project = projects.find(
                (p) =>
                    String(p.id) === String(directPlot.projectId) ||
                    String(p.customId) === String(directPlot.projectCustomId) ||
                    String(p._id) === String(directPlot.projectMongoId)
            ) || fetchedProject;
        }
    }

    // 2. Fetch plots for resolved project
    useEffect(() => {
        const targetId = project?.customId || project?.id || project?._id;
        if (!targetId) return;
        let isMounted = true;
        setIsFetchingPlots(true);
        fetchPlotsForProject(targetId).finally(() => {
            if (isMounted) setIsFetchingPlots(false);
        });
        return () => {
            isMounted = false;
        };
    }, [project?.customId, project?.id, project?._id, fetchPlotsForProject]);

    // 3. Resolve plot
    let plot = null;
    if (project && plotNumber) {
        const decodedPlotNum = decodeURIComponent(plotNumber).trim().toLowerCase();
        plot = plots.find((item) => {
            const matchesProject =
                String(item.projectId) === String(project.id) ||
                String(item.projectCustomId) === String(project.customId) ||
                String(item.projectMongoId) === String(project._id) ||
                String(item.projectId) === String(project._id) ||
                String(item.projectId) === String(project.customId);
            if (!matchesProject) return false;

            const pNum = String(item.plotNumber || "").trim().toLowerCase();
            const pNumClean = pNum.replace(/^plot\s*[-#]?\s*/i, "");
            const decodedClean = decodedPlotNum.replace(/^plot\s*[-#]?\s*/i, "");

            return (
                pNum === decodedPlotNum ||
                pNumClean === decodedClean ||
                String(item.id).toLowerCase() === decodedPlotNum ||
                String(item.customId).toLowerCase() === decodedPlotNum ||
                String(item._id).toLowerCase() === decodedPlotNum
            );
        });
    }

    // Fallback resolution for legacy /plot-details/:id
    if (!plot && id) {
        plot = fetchedPlot || plots.find(
            (item) => String(item.id) === String(id) || String(item.customId) === String(id) || String(item._id) === String(id)
        );
        if (plot && !project) {
            project = projects.find(
                (p) =>
                    String(p.id) === String(plot.projectId) ||
                    String(p.customId) === String(plot.projectCustomId) ||
                    String(p._id) === String(plot.projectMongoId)
            ) || fetchedProject;
        }
    }

    const DEFAULT_PLOT_IMAGE = "/assets/plot.png";
    const FALLBACK_PLOT_IMAGE = "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop&q=80";

    const rawPlotImages =
        (plot?.images && plot.images.length > 0)
            ? plot.images
            : plot?.image
                ? [plot.image]
                : project?.defaultPlotImage
                    ? [project.defaultPlotImage]
                    : project?.image
                        ? [project.image]
                        : [];

    const plotImages = rawPlotImages.length > 0 ? rawPlotImages : [DEFAULT_PLOT_IMAGE];

    const [selectedImage, setSelectedImage] = useState(null);
    const activeImage = selectedImage || plotImages[0] || DEFAULT_PLOT_IMAGE;

    const { isAuthenticated } = useAuth();
    const location = useLocation();
    const { showToast } = useToast();
    const [isSaved, setIsSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isHeartPopping, setIsHeartPopping] = useState(false);
    const [heartParticles, setHeartParticles] = useState([]);
    const [isSharing, setIsSharing] = useState(false);
    const [isShared, setIsShared] = useState(false);

    const plotIdKey = plot?._id || plot?.customId || plot?.id;

    useEffect(() => {
        if (!isAuthenticated || !plotIdKey) return;
        let isMounted = true;
        userApi.getWishlist()
            .then((res) => {
                if (!isMounted) return;
                const savedPlots = res?.data?.plots || [];
                const found = savedPlots.some(
                    (p) => String(p._id) === String(plot._id) || String(p.customId) === String(plot.id) || String(p._id) === String(plot.id)
                );
                setIsSaved(found);
            })
            .catch(() => { });
        return () => {
            isMounted = false;
        };
    }, [isAuthenticated, plotIdKey]);

    const triggerHeartAnimation = () => {
        setIsHeartPopping(true);
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

    const handleToggleWishlist = async () => {
        if (!isAuthenticated) {
            navigate("/login", { state: { from: location.pathname } });
            return;
        }
        setIsSaving(true);
        try {
            const targetId = plot._id || plot.id;
            const res = await userApi.toggleSavePlot(targetId);
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
            console.error("Failed to toggle wishlist plot:", err);
            showToast("Failed to update Wishlist", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleShare = async () => {
        if (isSharing || !plot) return;
        setIsSharing(true);
        try {
            const plotNum = plot.plotNumber || "";
            const projTitle = project?.title || "";
            const title = projTitle ? `Plot No. ${plotNum} - ${projTitle}` : `Plot No. ${plotNum}`;
            const text = projTitle
                ? `Explore Plot No. ${plotNum} at ${projTitle} on PlotPro`
                : `Explore Plot No. ${plotNum} on PlotPro`;
            const url = window.location.href;

            const result = await shareContent({ title, text, url });
            if (result.success) {
                setIsShared(true);
                setTimeout(() => setIsShared(false), 2500);
                showToast(
                    result.method === "share"
                        ? "Plot shared successfully!"
                        : "Plot link copied to clipboard!",
                    "success"
                );
            } else if (!result.cancelled) {
                showToast("Could not share or copy link. Please copy the URL from your address bar.", "error");
            }
        } catch (err) {
            console.error("Error sharing plot:", err);
            showToast("Failed to share plot link.", "error");
        } finally {
            setIsSharing(false);
        }
    };

    const animatedPlotIdRef = useRef(null);

    useEffect(() => {
        if (!plot || !plotIdKey) return;

        // Prevent re-running entrance animations on background data syncs for the same plot
        if (animatedPlotIdRef.current === plotIdKey) return;
        animatedPlotIdRef.current = plotIdKey;

        const ctx = gsap.context(() => {

            gsap.from(".plot-hero > *", {
                opacity: 0,
                y: 30,
                duration: 0.8,
                stagger: 0.12,
                ease: "power3.out",
            });


            gsap.utils.toArray(".plot-reveal").forEach((section) => {

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


            gsap.from(".spec-row", {
                opacity: 0,
                x: -20,
                duration: 0.5,
                stagger: 0.07,
                ease: "power2.out",

                scrollTrigger: {
                    trigger: ".specifications-card",
                    start: "top 80%",
                    once: true,
                },
            });


            gsap.from(".landmark-card", {
                opacity: 0,
                y: 25,
                duration: 0.5,
                stagger: 0.08,
                ease: "power2.out",

                scrollTrigger: {
                    trigger: ".landmarks-grid",
                    start: "top 85%",
                    once: true,
                },
            });

        });

        return () => ctx.revert();

    }, [plotIdKey, plot]);

    if (!plot || !project) {
        if (isLoadingProjects || isFetchingPlots || isFetchingDirectPlot) {
            return (
                <>
                    <Navbar />
                    <div className="plot-not-found" style={{ textAlign: "center", padding: "100px 20px" }}>
                        <h2>Loading Plot Details...</h2>
                    </div>
                    <Footer />
                </>
            );
        }
        return (
            <>
                <Navbar />

                <div className="plot-not-found">
                    <h2>Plot Not Found</h2>
                </div>

                <Footer />
            </>
        );
    }


    return (
        <main className="plot-details-page">

            <Navbar />


            <div className="project-breadcrumb1">
                <Link to="/">Home</Link>

                <ArrowRight />

                <Link to="/projects">Projects</Link>

                <ArrowRight />

                <Link to={`/project-details/${getProjectRouteSlug(project, projects) || project.slug || project.id}`}>
                    {project.title}
                </Link>

                <ArrowRight />

                <strong>Plot {plot.plotNumber}</strong>
            </div>


            {/* =================================================
                HERO
            ================================================= */}

            <section className="plot-hero plot-reveal">

                {/* Gallery */}

                <div className="plot-gallery">

                    <div className="plot-main-image">

                        <img
                            src={activeImage}
                            alt={`${project?.title || "Plot"} Plot ${plot.plotNumber}`}
                            onError={(e) => {
                                if (e.target.src !== FALLBACK_PLOT_IMAGE) {
                                    e.target.onerror = null;
                                    e.target.src = FALLBACK_PLOT_IMAGE;
                                }
                            }}
                        />

                        <div className="plot-image-gradient"></div>

                    </div>


                    {/* Thumbnails */}

                    <div className="plot-thumbnails">

                        {plotImages.map((image, index) => (

                            <button
                                key={index}
                                type="button"
                                className={
                                    activeImage === image
                                        ? "plot-thumb active"
                                        : "plot-thumb"
                                }
                                onClick={() =>
                                    setSelectedImage(image)
                                }
                            >

                                <img
                                    src={image}
                                    alt={`Plot view ${index + 1}`}
                                    onError={(e) => {
                                        if (e.target.src !== FALLBACK_PLOT_IMAGE) {
                                            e.target.onerror = null;
                                            e.target.src = FALLBACK_PLOT_IMAGE;
                                        }
                                    }}
                                />

                            </button>

                        ))}

                    </div>

                </div>


                {/* Details */}

                <div className="plot-summary">

                    <div className="plot-summary-top">

                        <span className="plot-label">
                            PLOT DETAILS
                        </span>


                        <div className="plot-actions">

                            <button
                                type="button"
                                onClick={handleToggleWishlist}
                                disabled={isSaving}
                                title={isSaved ? "Remove from Wishlist" : "Add to Wishlist"}
                                aria-label={isSaved ? "Remove from Wishlist" : "Add to Wishlist"}
                                style={isSaved ? { color: "#ef4444", borderColor: "#fca5a5" } : {}}
                            >
                                <span className="heart-button-wrapper">
                                    <span className={`heart-icon-animated ${isHeartPopping ? "popping" : ""}`}>
                                        <Heart size={18} fill={isSaved ? "#ef4444" : "none"} color={isSaved ? "#ef4444" : "currentColor"} />
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
                                <span>{isSaved ? "In Wishlist" : "Add to Wishlist"}</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleShare}
                                disabled={isSharing}
                                title={isShared ? "Link Copied" : "Share Plot"}
                                aria-label="Share this plot"
                                style={isShared ? { color: "#16a34a", borderColor: "#86efac" } : {}}
                            >
                                {isShared ? <Check size={18} color="#16a34a" /> : <Share2 size={18} />}
                                <span>{isShared ? "Copied!" : "Share"}</span>
                            </button>

                        </div>

                    </div>


                    <h1>
                        Plot No. {plot.plotNumber}
                    </h1>


                    <div className="plot-location">

                        <MapPin />

                        <span>
                            {project?.location}
                        </span>

                    </div>


                    <p className="plot-short-description">
                        A premium  {plot.facing} Facing plot in a
                        well-planned community, developed
                        for a better tomorrow.
                    </p>


                    {/* Price */}

                    <div className="plot-total-price">

                        <span>
                            TOTAL PRICE
                        </span>

                        <strong>
                            {plot.price}
                        </strong>

                    </div>


                    {/* Quick specs */}

                    <div className="plot-quick-specs">

                        <div className="quick-spec">

                            <div className="quick-icon">
                                <Ruler />
                            </div>

                            <strong>
                                {plot.size}
                            </strong>

                            <span>
                                Plot Size
                            </span>

                        </div>


                        <div className="quick-divider"></div>


                        <div className="quick-spec">

                            <div className="quick-icon">
                                <Compass />
                            </div>

                            <strong>
                                {plot.facing}
                            </strong>

                            <span>
                                Facing
                            </span>

                        </div>


                        <div className="quick-divider"></div>


                        <div className="quick-spec">

                            <div className="quick-icon">
                                <FileCheck />
                            </div>

                            <strong>
                                DTCP Approved
                            </strong>

                            <span>
                                Legal Status
                            </span>

                        </div>

                    </div>


                    {/* CTA */}

                    <div className="plot-hero-actions">
                        <button
                            type="button"
                            className="primary-plot-btn"
                            onClick={() => navigate(`/site-visit/${project.id}?plot=${plot.plotNumber}`, {
                                state: {
                                    from: location.pathname
                                }
                            })}
                        >
                            <span>
                                Book a Site Visit
                            </span>

                            <ArrowRight />

                        </button>


                        <button
                            type="button"
                            className="secondary-plot-btn"
                            onClick={() => navigate(`/enquiry/${project.id}?plot=${plot.plotNumber}`, {
                                state: {
                                    from: location.pathname
                                }
                            })}
                        >
                            <Phone />

                            <span>
                                Enquiry
                            </span>

                        </button>

                    </div>

                </div>

            </section>


            {/* =================================================
                LOCATION + SPECIFICATIONS
            ================================================= */}

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
                const projectTitle = project?.title?.trim() || "Plot";

                return (
                    <section className="plot-two-column plot-reveal">

                        {/* Location */}

                        <div className="plot-info-card location-card">

                            <div className="info-card-heading">

                                <div className="info-heading-icon">
                                    <MapPin />
                                </div>

                                <div>

                                    <h2>
                                        Plot <span>Location</span>
                                    </h2>

                                    <p>
                                        Strategically located with easy
                                        access to key destinations.
                                    </p>

                                </div>

                            </div>


                            {mapQuery ? (
                                <>
                                    <div className="plot-map">

                                        <iframe
                                            src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                                            title={`${projectTitle} Location`}
                                            loading="lazy"
                                        ></iframe>


                                        <div className="map-location-label">

                                        </div>

                                    </div>


                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="map-button"
                                    >

                                        View on Google Maps

                                        <ExternalLink />

                                    </a>
                                </>
                            ) : (
                                <div
                                    className="plot-map-unavailable"
                                    style={{
                                        minHeight: "220px",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        padding: "30px 20px",
                                        textAlign: "center",
                                        background: "#f1f5f9",
                                        borderRadius: "20px",
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
                            )}

                        </div>


                        {/* Specifications */}

                <div className="plot-info-card specifications-card">

                    <div className="info-card-heading">

                        <div className="info-heading-icon">
                            <FileCheck />
                        </div>

                        <div>

                            <h2>
                                Plot <span>Specifications</span>
                            </h2>

                            <p>
                                Everything you need to know
                                about this plot.
                            </p>

                        </div>

                    </div>


                    <div className="specifications-list">

                        <div className="spec-row">

                            <div>
                                <Ruler />
                                <span>Plot Number</span>
                            </div>

                            <strong>
                                {plot.plotNumber}
                            </strong>

                        </div>


                        <div className="spec-row">

                            <div>
                                <Ruler />
                                <span>Plot Size</span>
                            </div>

                            <strong>
                                {plot.size}
                            </strong>

                        </div>


                        <div className="spec-row">

                            <div>
                                <Compass />
                                <span>Facing</span>
                            </div>

                            <strong>
                                {plot.facing} Facing
                            </strong>

                        </div>


                        <div className="spec-row">

                            <div>
                                <Road />
                                <span>Road Width</span>
                            </div>

                            <strong>
                                30 ft Blacktop Road
                            </strong>

                        </div>


                        <div className="spec-row">

                            <div>
                                <Droplets />
                                <span>Water Supply</span>
                            </div>

                            <strong>
                                Available
                            </strong>

                        </div>


                        <div className="spec-row">

                            <div>
                                <Waves />
                                <span>Drainage</span>
                            </div>

                            <strong>
                                Underground Drainage
                            </strong>

                        </div>


                        <div className="spec-row">

                            <div>
                                <Zap />
                                <span>Electricity</span>
                            </div>

                            <strong>
                                Available
                            </strong>

                        </div>

                        <div className="spec-row">

                            <div>
                                <FileCheck />
                                <span>Legal Status</span>
                            </div>

                            <strong>
                                DTCP Approved
                            </strong>

                        </div>

                    </div>

                </div>

                    </section>
                );
            })()}


            {/* =================================================
                NEARBY LANDMARKS
            ================================================= */}

            <section className="landmarks-section plot-reveal">

                <div className="landmarks-heading">

                    <div className="landmark-title">

                        <div className="info-heading-icon">
                            <MapPinned />
                        </div>

                        <div>

                            <h2>
                                Nearby Landmarks
                            </h2>

                        </div>

                    </div>

                </div>


                <div className="landmarks-grid">

                    {/* SCHOOL */}
                    <div className="landmark-card">

                        <div className="landmark-card-title">
                            Schools
                        </div>

                        <div className="landmark-image">
                            <img
                                src={school}
                                alt={`Schools near ${project?.title || "this project"}`}
                            />
                        </div>

                        <div className="landmark-blue"></div>

                        <div className="landmark-arrow">
                            <ArrowRight />
                        </div>

                    </div>


                    {/* HOSPITAL */}
                    <div className="landmark-card">

                        <div className="landmark-card-title">
                            Hospitals
                        </div>

                        <div className="landmark-image">
                            <img
                                src={hospital}
                                alt={`Hospitals near ${project?.title || "this project"}`}
                            />
                        </div>

                        <div className="landmark-blue"></div>

                        <div className="landmark-arrow">
                            <ArrowRight />
                        </div>

                    </div>


                    {/* SHOPPING */}
                    <div className="landmark-card">

                        <div className="landmark-card-title">
                            Shopping <br /> Mall
                        </div>

                        <div className="landmark-image">
                            <img
                                src={shoppingmall}
                                alt={`Shopping near ${project?.title || "this project"}`}
                            />
                        </div>

                        <div className="landmark-blue"></div>

                        <div className="landmark-arrow">
                            <ArrowRight />
                        </div>

                    </div>


                    {/* BUS STAND */}
                    <div className="landmark-card">

                        <div className="landmark-card-title">
                            Bus Stand
                        </div>

                        <div className="landmark-image">
                            <img
                                src={bus}
                                alt={`Bus Stand near ${project?.title || "this project"}`}
                            />
                        </div>

                        <div className="landmark-blue"></div>

                        <div className="landmark-arrow">
                            <ArrowRight />
                        </div>

                    </div>


                    {/* NH 44 */}
                    <div className="landmark-card">

                        <div className="landmark-card-title">
                            Highway
                        </div>

                        <div className="landmark-image">
                            <img
                                src={road}
                                alt={`Highway near ${project?.title || "this project"}`}
                            />
                        </div>

                        <div className="landmark-blue"></div>

                        <div className="landmark-arrow">
                            <ArrowRight />
                        </div>

                    </div>


                    {/* RAILWAY */}
                    <div className="landmark-card">

                        <div className="landmark-card-title">
                            Railway <br />Station
                        </div>

                        <div className="landmark-image">
                            <img
                                src={train}
                                alt={`Railway Station near ${project?.title || "this project"}`}
                            />
                        </div>

                        <div className="landmark-blue"></div>

                        <div className="landmark-arrow">
                            <ArrowRight />
                        </div>

                    </div>

                </div>

            </section>


            {/* =================================================
                ABOUT + CTA
            ================================================= */}

            <section className="plot-about-section plot-reveal">

                <div className="about-plot-card">

                    <div className="about-plot-heading">

                        <div className="info-heading-icon1">
                            <FileCheck />
                        </div>

                        <h2>
                            About <br /> <span>This Plot</span>
                        </h2>

                    </div>

                    <div className="para">
                        <p>
                            Plot No- {plot.plotNumber} is a thoughtfully positioned {plot.facing} Facing
                            plot in {project?.title || "this premium community"}, offering
                            the perfect balance of location, connectivity,
                            and modern infrastructure.
                        </p>

                        <p>
                            Ideal for building your dream home or as a
                            long-term investment, this plot provides
                            excellent value in a fast-growing location.
                        </p>
                    </div>


                    <div className="about-checks">

                        <div>
                            <Check />
                            <span>
                                Ready for construction
                            </span>
                        </div>

                        <div>
                            <Check />
                            <span>
                                Peaceful and green environment
                            </span>
                        </div>

                        <div>
                            <Check />
                            <span>
                                High appreciation potential
                            </span>
                        </div>

                    </div>

                </div>


                {/* Contact CTA */}

                <div className="plot-contact-card">

                    <span className="contact-small-title">
                        HAVE QUESTIONS?
                    </span>

                    <h2>
                        Let's talk about
                        <br />
                        this plot.
                    </h2>

                    <p>
                        Our team is here to help you with
                        site visits, pricing and more details.
                    </p>


                    <div className="contact-card-bottom">

                        <button
                            onClick={() => navigate(`/enquiry/${project.id}?plot=${plot.plotNumber}`, {
                                state: {
                                    from: location.pathname
                                }
                            })}
                            type="button"
                        >

                            <span>Contact Us</span>

                            <ArrowRight />

                        </button>


                        <div className="contact-big-icon">
                            <Phone />
                        </div>

                    </div>

                    <div
                        className="schedule"
                        onClick={() => navigate(`/site-visit/${project.id}?plot=${plot.plotNumber}`, {
                            state: {
                                from: location.pathname
                            }
                        })}
                        style={{ cursor: "pointer" }}
                    >

                        <CalendarDays />

                        <span>
                            Schedule a
                            <br />
                            Site Visit
                        </span>

                    </div>

                </div>

            </section>


            <Footer />

        </main>
    );
}

export default PlotDetails;