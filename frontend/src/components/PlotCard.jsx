import { Ruler, Compass, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useProjects, getProjectRouteSlug } from "../context/ProjectContext";
import { resolveImageUrl } from "../utils/imageUrl";
import "../css/PlotCard.css";

export const DEFAULT_PLOT_IMAGE = "/assets/plot.webp";
export const FALLBACK_PLOT_IMAGE = "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop&q=80";

function PlotCard({
    plotNumber,
    image,
    size,
    facing,
    price,
    plotId,
    project,
    plot,
}) {
    const { projects } = useProjects();
    const resolvedProject = project || projects.find((p) =>
        String(p.id) === String(plot?.projectId || plot?.projectCustomId) ||
        String(p._id) === String(plot?.projectMongoId) ||
        String(p._id) === String(plot?.projectId)
    );

    const projectSlug = resolvedProject
        ? (getProjectRouteSlug(resolvedProject, projects) || resolvedProject.slug || resolvedProject.id)
        : null;

    const plotSlug = plotNumber ? encodeURIComponent(plotNumber) : plotId;
    const plotUrl = projectSlug ? `/plot-details/${projectSlug}/${plotSlug}` : `/plot-details/${plotId}`;

    const rawImage =
        image ||
        plot?.image ||
        resolvedProject?.defaultPlotImage ||
        resolvedProject?.image ||
        DEFAULT_PLOT_IMAGE;
    const resolvedImage = resolveImageUrl(rawImage) || DEFAULT_PLOT_IMAGE;

    const status = (plot?.status || "Available").trim();
    const statusLower = status.toLowerCase();
    const isReserved = statusLower === "reserved";
    const isSold = statusLower === "sold";
    const isUnavailable = isReserved || isSold;
    const bannerText = isSold ? "SOLD OUT" : isReserved ? "RESERVED" : "";

    return (
        <article className={`plot-card ${isUnavailable ? `is-unavailable status-${statusLower}` : ""}`}>

            <div className={`plot-image ${isUnavailable ? "plot-image-faded" : ""}`}>
                {isUnavailable && <div className="plot-fade-backdrop"></div>}

                <img
                    src={resolvedImage}
                    alt={`Plot ${plotNumber}`}
                    onError={(e) => {
                        if (e.target.src !== FALLBACK_PLOT_IMAGE) {
                            e.target.onerror = null;
                            e.target.src = FALLBACK_PLOT_IMAGE;
                        }
                    }}
                />

                <div className="plot-image-overlay"></div>

                {/* Diagonal Banner for Reserved / Sold Out (Top-Left to Bottom-Right) */}
                {isUnavailable && (
                    <div className={`plot-diagonal-banner-wrapper banner-${statusLower}`}>
                        <div className="plot-diagonal-banner-bar">
                            <span>{bannerText}</span>
                        </div>
                    </div>
                )}

                {/* Status Indicator Badge */}
                <div className={`plot-card-status-badge status-${statusLower}`}>
                    <span className="status-dot"></span>
                    <span>{status}</span>
                </div>

            </div>


            <div className="plot-content">

                <h3 className="plot-price">
                    {price}
                </h3>

                <div className="plot-main-info">

                    <div className="plot-location-info">

                        <strong>
                            {resolvedProject?.title || "Dreamcity"}, {resolvedProject?.city || resolvedProject?.location || "Tamil Nadu"}.
                        </strong>

                        <span>
                            Plot No. {plotNumber}
                        </span>

                    </div>

                    <div className="plot-meta">

                        <div className="plot-meta-item">

                            <Ruler />

                            <div>
                                <strong>
                                    {size}
                                </strong>

                                <span>
                                    Plot Size
                                </span>
                            </div>

                        </div>


                        <div className="plot-meta-divider"></div>

                        <div className="plot-meta-item">

                            <Compass />

                            <div>
                                <strong>
                                    {facing}
                                </strong>

                                <span>
                                    Facing
                                </span>
                            </div>

                        </div>

                    </div>

                </div>

                <div className="plot-footer">


                    <Link
                        to={plotUrl}
                        className="plot-view-btn"
                    >

                        <span>
                            View Plot
                        </span>

                        <ArrowUpRight />

                    </Link>

                </div>

            </div>

        </article>
    );
}

export default PlotCard;