import Navbar from "../components/Navbar";
import "../css/ProjectDetails.css";
import PlotCard from "../components/PlotCard";
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
    ExternalLink
} from "lucide-react";

import entrance from "../assets/Projects/Greenvalley/Entrance.png";

import { useState, useEffect } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { useProjects, findProjectByIdentifier, getProjectRouteSlug, normalizeProject } from "../context/ProjectContext";
import { usePlots } from "../context/PlotContext";
import { useAuth } from "../context/AuthContext";
import { userApi, publicApi } from "../services/api";

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

    // Fallback: If project not currently in local memory, fetch via publicApi
    useEffect(() => {
        if (!matchedProject && id) {
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
        } else if (matchedProject) {
            setFetchedProject(null);
        }
    }, [matchedProject, id]);

    const project = matchedProject || fetchedProject;

    useEffect(() => {
        const targetId = project?.customId || project?.id || project?._id;
        if (targetId) {
            fetchPlotsForProject(targetId);
        }
    }, [project?.customId, project?.id, project?._id, fetchPlotsForProject]);

    const projectImages = project?.images || (project?.image ? [project.image] : []);

    const [selectedImage, setSelectedImage] = useState(null);
    const activeImage = selectedImage || projectImages[0] || "";

    const { isAuthenticated } = useAuth();
    const location = useLocation();
    const [isSaved, setIsSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isAuthenticated || !project) return;
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
    }, [isAuthenticated, project]);

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
            }
        } catch (err) {
            console.error("Failed to toggle wishlist project:", err);
        } finally {
            setIsSaving(false);
        }
    };

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

    const projectPlots = plots.filter((plot) =>
        String(plot.projectId) === String(project.id) ||
        String(plot.projectCustomId) === String(project.customId) ||
        String(plot.projectMongoId) === String(project._id) ||
        String(plot.projectId) === String(project._id) ||
        String(plot.projectId) === String(project.customId)
    );


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

                    <div className="image-container">

                        <div className="big-container">

                            <img
                                className="big-image"
                                src={activeImage}
                                alt={project.title}
                            />

                        </div>


                        <div className="small-container">

                            {projectImages.map((image, index) => (

                                <img
                                    key={index}
                                    src={image}
                                    alt={project.title}
                                    className="thumbnail"
                                    onClick={() =>
                                        setSelectedImage(image)
                                    }
                                />

                            ))}

                        </div>

                    </div>

                    <div className="project-details">

                        <div className="share-detail">

                            <div className="bt">
                                {project.plotType}
                            </div>

                            <div className="share">

                                <button
                                    type="button"
                                    onClick={handleToggleSave}
                                    disabled={isSaving}
                                    title={isSaved ? "Remove from Wishlist" : "Save to Wishlist"}
                                    style={isSaved ? { color: "#ef4444", borderColor: "#fca5a5" } : {}}
                                >
                                    <Heart size={18} fill={isSaved ? "#ef4444" : "none"} color={isSaved ? "#ef4444" : "currentColor"} />
                                    {isSaved ? "Saved" : "Save"}
                                </button>

                                <button>
                                    <Share2 />
                                    Share
                                </button>

                            </div>

                        </div>


                        <div className="pro-de">

                            <h1>
                                {project.title}
                            </h1>


                            <div className="location2">

                                <MapPinCheckInside />

                                <p>
                                    {project.location}
                                </p>

                            </div>


                            <p className="descrip">
                                {project.details || "No description provided."}
                            </p>

                            <div className="plot-price2">

                                <p className="p1">
                                    Price Starting From
                                </p>

                                <div className="per-plot">

                                    <p className="p2">
                                        ₹ {project.plotPrice}
                                    </p>

                                    <p className="p3">
                                        Per Plot
                                    </p>

                                </div>

                            </div>

                            <div className="book-btn">

                                <button
                                    className="primary-btn"
                                    onClick={() => navigate(`/site-visit/${project.id}`, {
                                        state: {
                                            from: location.pathname
                                        }
                                    })}
                                >
                                    Book a Site Visit
                                </button>

                                <button
                                    className="secondary-btn"
                                    onClick={() => navigate(`/enquiry/${project.id}`, {
                                        state: {
                                            from: location.pathname
                                        }
                                    })}
                                >
                                    Enquiry
                                </button>

                            </div>

                        </div>

                    </div>

                </section>



                <div className="benefits-header">

                    <p className="section-tag">
                        WHY CHOOSE US
                    </p>
                    <h2>
                        Benefits of <br /><span>{project.title}</span>
                    </h2>
                </div>


                <section className="benefits">

                    {project.benefits?.map((benefit, index) => (
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

                <section className="about-section">

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


                        <div className="highlight-list">

                            {project.highlights?.map((highlight, index) => (
                                <p key={index}>
                                    <CheckCircle2 />
                                    {highlight}
                                </p>
                            ))}

                        </div>

                    </div>

                    <div className="about-image">

                        <img
                            src={entrance}
                            alt={project.title}
                        />

                    </div>

                </section>

                <section className="amenities-section">

                    <div className="amenities-header">

                        <p className="section-tag">
                            FEATURES
                        </p>

                        <h2>
                            Project <br /> <span>Amenities</span>
                        </h2>

                    </div>


                    <div className="amenities-grid">

                        {project.amenities?.map((amenity, index) => (

                            <div className="amenity-card" key={index}>

                                {getAmenityIcon(amenity)}

                                <p>
                                    {amenity}
                                </p>

                            </div>

                        ))}

                    </div>

                </section>
                <section className="location-section">

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

                    <div className="map-box">

                        <iframe
                            src="https://www.google.com/maps?q=Chettinayakanpatti,Dindigul&output=embed"
                            width="100%"
                            height="100%"
                            style={{ border: 0 }}
                            allowFullScreen=""
                            loading="lazy"
                            title="Green Valley Location"
                        ></iframe>

                    </div>

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

                <section className="plots-section">

                    <div className="plots-top">

                        <div className="plots-heading">

                            <p className="section-tag">
                                AVAILABLE PLOTS
                            </p>

                            <h2>
                                Available Plots
                            </h2>

                            <p>
                                Choose a plot that suits your needs and budget.
                            </p>

                        </div>

                        <div className="view-all-plots-wrapper">
                            <Link
                                to={`/project-plots/${getProjectRouteSlug(project, projects) || project.slug || project.id}`}
                                className="view-all-plots-btn"
                            >
                                <span>View All Plots</span>
                                <ArrowRight />
                            </Link>
                        </div>


                    </div>

                    <div className="plot-filters">

                        <button className="active-filter">
                            All ({project.totalPlots})
                        </button>

                        <button>
                            Available ({project.availablePlots})
                        </button>

                        <button>
                            Reserved ({project.reservedPlots})
                        </button>

                        <button>
                            Sold ({project.soldPlots})
                        </button>

                    </div>

                    <div className="plots-grid">

                        {projectPlots.slice(0, 4).map((plot) => (<PlotCard
                            key={plot.id}
                            plotId={plot.id}
                            plotNumber={plot.plotNumber}
                            image={plot.image || project.defaultPlotImage || project.image}
                            size={plot.size}
                            facing={plot.facing}
                            price={plot.price}
                            project={project}
                            plot={plot}
                        />
                        ))}

                    </div>

                </section>
                <Footer />

            </main>
        </>
    );
}


export default ProjectDetails;