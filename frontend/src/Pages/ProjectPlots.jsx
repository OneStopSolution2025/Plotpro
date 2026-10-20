import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import PlotCard from "../components/PlotCard";

import { useProjects, findProjectByIdentifier, getProjectRouteSlug, normalizeProject } from "../context/ProjectContext";
import { usePlots } from "../context/PlotContext";
import { publicApi } from "../services/api";

import "../css/ProjectPlots.css";

function ProjectPlots() {
    const { id } = useParams();

    const { projects, isLoading: isLoadingProjects } = useProjects();
    const { plots, fetchPlotsForProject } = usePlots();

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
                    console.warn(`[ProjectPlots] Could not fetch project by ID ${id}:`, err.message);
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

    const [activeFilter, setActiveFilter] = useState("All");

    const projectPlots = useMemo(() => {
        if (!project) return [];
        return plots.filter((plot) =>
            String(plot.projectId) === String(project.id) ||
            String(plot.projectCustomId) === String(project.customId) ||
            String(plot.projectMongoId) === String(project._id) ||
            String(plot.projectId) === String(project._id) ||
            String(plot.projectId) === String(project.customId)
        );
    }, [plots, project]);

    const availablePlots = useMemo(() => {
        return projectPlots.filter((plot) => plot.status === "Available");
    }, [projectPlots]);

    const reservedPlots = useMemo(() => {
        return projectPlots.filter((plot) => plot.status === "Reserved");
    }, [projectPlots]);

    const soldPlots = useMemo(() => {
        return projectPlots.filter((plot) => plot.status === "Sold");
    }, [projectPlots]);

    const filteredPlots = useMemo(() => {
        if (activeFilter === "Available") return availablePlots;
        if (activeFilter === "Reserved") return reservedPlots;
        if (activeFilter === "Sold") return soldPlots;
        return projectPlots;
    }, [activeFilter, availablePlots, reservedPlots, soldPlots, projectPlots]);

    if (!project) {
        if (isLoadingProjects || isFetchingDirect) {
            return (
                <>
                    <Navbar />
                    <main className="project-plots-page">
                        <section className="project-plots-not-found">
                            <div className="project-plots-container">
                                <h1>Loading Project...</h1>
                            </div>
                        </section>
                    </main>
                    <Footer />
                </>
            );
        }
        return (
            <>
                <Navbar />

                <main className="project-plots-page">
                    <section className="project-plots-not-found">
                        <div className="project-plots-container">
                            <span className="project-plots-eyebrow">
                                Project
                            </span>

                            <h1>Project Not Found</h1>

                            <p>
                                The requested project could not be found.
                            </p>

                            <Link
                                to="/projects"
                                className="project-plots-back-btn"
                            >
                                <ArrowLeft size={16} />
                                <span>Back to Projects</span>
                            </Link>
                        </div>
                    </section>
                </main>

                <Footer />
            </>
        );
    }

    const filters = [
        {
            label: "All",
            count: projectPlots.length
        },
        {
            label: "Available",
            count: availablePlots.length
        },
        {
            label: "Reserved",
            count: reservedPlots.length
        },
        {
            label: "Sold",
            count: soldPlots.length
        }
    ];

    return (
        <>
            <Navbar />

            <main className="project-plots-page">

                {/* HERO */}
                <section className="project-plots-hero">
                    <div className="project-plots-container">

                        <div
                            className="project-plots-hero-card"
                            style={{
                                backgroundImage: `url(${project.image})`
                            }}
                        >

                            <div className="project-plots-hero-overlay"></div>

                            <div className="project-plots-hero-content">

                                <Link
                                    to={`/project-details/${getProjectRouteSlug(project, projects) || project.slug || project.id}`}
                                    className="project-plots-back"
                                >
                                    <ArrowLeft size={15} />
                                    <span>Back to Project</span>
                                </Link>

                                <div className="project-plots-hero-bottom">

                                    <div>
                                        <span className="project-plots-hero-label">
                                            Plot Collection
                                        </span>

                                        <h1>
                                            {project.title}
                                        </h1>

                                        <p>
                                            {project.location}
                                        </p>
                                    </div>

                                    <div className="project-plots-hero-badge">
                                        <span>
                                            {projectPlots.length}
                                        </span>

                                        <small>
                                            Total Plots
                                        </small>
                                    </div>

                                </div>

                            </div>
                        </div>

                    </div>
                </section>


                {/* PROJECT SUMMARY */}
                <section className="project-plots-overview">
                    <div className="project-plots-container">

                        <div className="project-plots-overview-grid">

                            <div className="project-plots-overview-intro">
                                <span className="section-eyebrow">
                                    {project.plotType}
                                </span>

                                <h2>
                                    Find the right plot
                                    <br />
                                    <span>for your future.</span>
                                </h2>

                                <p>
                                    Explore all available plots in{" "}
                                    {project.title}, carefully planned
                                    for comfortable living and
                                    long-term value.
                                </p>
                            </div>


                            <div className="project-plots-stats">

                                <div className="project-plot-stat">
                                    <strong>
                                        {projectPlots.length}
                                    </strong>

                                    <span>
                                        Total Plots
                                    </span>
                                </div>

                                <div className="project-plot-stat">
                                    <strong>
                                        {availablePlots.length}
                                    </strong>

                                    <span>
                                        Available
                                    </span>
                                </div>

                                <div className="project-plot-stat">
                                    <strong>
                                        {reservedPlots.length}
                                    </strong>

                                    <span>
                                        Reserved
                                    </span>
                                </div>

                                <div className="project-plot-stat">
                                    <strong>
                                        {project.projectSize}
                                    </strong>

                                    <span>
                                        Project Size
                                    </span>
                                </div>

                            </div>

                        </div>

                    </div>
                </section>


                {/* ALL PLOTS */}
                <section className="all-plots-section">

                    <div className="project-plots-container">

                        <div className="all-plots-top">

                            <div className="all-plots-title">

                                <div className="all-plots-heading-row">
                                    <SlidersHorizontal size={17} />

                                    <span>
                                        Plot Availability
                                    </span>
                                </div>

                                <h2>
                                    Explore all plots
                                </h2>

                                <p>
                                    Choose a plot that matches your
                                    requirements and budget.
                                </p>

                            </div>


                            <div className="all-plots-count">
                                <strong>
                                    {filteredPlots.length}
                                </strong>

                                <span>
                                    {activeFilter === "All"
                                        ? "Plots"
                                        : `${activeFilter} Plots`}
                                </span>
                            </div>

                        </div>


                        {/* FILTERS */}
                        <div className="plot-status-filters">

                            {filters.map((filter) => (
                                <button
                                    key={filter.label}
                                    type="button"
                                    className={
                                        activeFilter === filter.label
                                            ? "plot-status-filter active"
                                            : "plot-status-filter"
                                    }
                                    onClick={() =>
                                        setActiveFilter(filter.label)
                                    }
                                >
                                    <span>
                                        {filter.label}
                                    </span>

                                    <small>
                                        {filter.count}
                                    </small>
                                </button>
                            ))}

                        </div>


                        {/* GRID */}
                        {filteredPlots.length > 0 ? (

                            <div className="all-plots-grid">

                                {filteredPlots.map((plot) => (
                                    <PlotCard
                                        key={plot.id}
                                        plotId={plot.id}
                                        plotNumber={plot.plotNumber}
                                        image={plot.image || project.defaultPlotImage || project.image || "/assets/plot.png"}
                                        size={plot.size}
                                        facing={plot.facing}
                                        price={plot.price}
                                        project={project}
                                        plot={plot}
                                    />
                                ))}

                            </div>

                        ) : (

                            <div className="plots-empty-state">

                                <div className="plots-empty-icon">
                                    <SlidersHorizontal size={20} />
                                </div>

                                <h3>
                                    No {activeFilter.toLowerCase()} plots
                                </h3>

                                <p>
                                    There are currently no plots in
                                    this category.
                                </p>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setActiveFilter("All")
                                    }
                                >
                                    View All Plots
                                </button>

                            </div>

                        )}

                    </div>

                </section>


                {/* BOTTOM CTA */}
                <section className="project-plots-cta-section">

                    <div className="project-plots-container">

                        <div className="project-plots-cta">

                            <div>
                                <span>
                                    Interested in {project.title}?
                                </span>

                                <h2>
                                    Find your perfect plot.
                                </h2>

                                <p>
                                    Explore the project and take the
                                    next step towards your future.
                                </p>
                            </div>

                            <div className="project-plots-cta-actions">

                                <Link
                                    to={`/project-details/${getProjectRouteSlug(project, projects) || project.slug || project.id}`}
                                    className="project-plots-cta-primary"
                                >
                                    Explore Project
                                    <span>↗</span>
                                </Link>

                                <Link
                                    to="/contact"
                                    className="project-plots-cta-secondary"
                                >
                                    Talk to Us
                                </Link>

                            </div>

                        </div>

                    </div>

                </section>

            </main>

            <Footer />
        </>
    );
}

export default ProjectPlots;