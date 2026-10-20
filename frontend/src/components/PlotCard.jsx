import { Ruler, Compass, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useProjects, getProjectRouteSlug } from "../context/ProjectContext";
import "../css/PlotCard.css";

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

    return (
        <article className="plot-card">

            <div className="plot-image">

                <img
                    src={image}
                    alt={`Plot ${plotNumber}`}
                />

                <div className="plot-image-overlay"></div>

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