import "../css/ProjectCard.css";
import { useNavigate } from "react-router-dom";
import {
  FaLocationDot,
  FaRulerCombined,
  FaHouse,
  FaRoad,
  FaArrowRight,
} from "react-icons/fa6";
import { useProjects, getProjectRouteSlug, slugifyProject } from "../context/ProjectContext";

export const DEFAULT_PROJECT_IMAGE = "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1200&auto=format&fit=crop&q=80";

function Plotcard({
  id,
  image,
  title,
  details,
  projectSize,
  plotPrice,
  location,
  plotSizes,
  distance,
  slug,
  customId,
  _id,
}) {
  const navigate = useNavigate();
  const { projects } = useProjects();

  const projectSlug = slug || getProjectRouteSlug({ id, title, customId, _id }, projects) || slugifyProject({ title, id, customId }) || id;
  const resolvedImage = image || DEFAULT_PROJECT_IMAGE;

  return (
    <article className="project-card">
      {/* Project Image */}
      <img
        src={resolvedImage}
        alt={title}
        className="project-img"
        onError={(e) => {
          if (e.target.src !== DEFAULT_PROJECT_IMAGE) {
            e.target.onerror = null;
            e.target.src = DEFAULT_PROJECT_IMAGE;
          }
        }}
      />

      {/* Dark gradient overlay */}
      <div className="project-overlay"></div>

      {/* Location */}
      <div className="project-location">
        <FaLocationDot />
        <span>{location}</span>
      </div>

      {/* Main Content */}
      <div className="project-content">

        {/* Project heading */}
        <div className="project-heading">
          <h3 className="project-title">
            {title}
          </h3>

          <p className="project-description">
            {details}
          </p>
        </div>

        {/* Project information */}
        <div className="project-info">

          <div className="info-item">
            <div className="info-icon">
              <FaRulerCombined />
            </div>

            <div className="info-text">
              <span className="info-label">
                Total Acres
              </span>

              <strong>
                {projectSize}
              </strong>
            </div>
          </div>

          <div className="info-divider"></div>

          <div className="info-item">
            <div className="info-icon">
              <FaHouse />
            </div>

            <div className="info-text">
              <span className="info-label">
                Plot Sizes
              </span>

              <strong>
                {plotSizes}
              </strong>
            </div>
          </div>

          <div className="info-divider"></div>

          <div className="info-item">
            <div className="info-icon">
              <FaRoad />
            </div>

            <div className="info-text">
              <span className="info-label">
                Distance
              </span>

              <strong>
                {distance}
              </strong>
            </div>
          </div>

        </div>

        {/* Bottom Action */}
        <div className="project-actions">

          <div className="project-price">
            <span>Plots From</span>

            <strong>
              ₹{plotPrice}
            </strong>
          </div>

          <button
            className="explore-btn"
            onClick={() => navigate(`/project-details/${projectSlug}`)} type="button"
          >
            <span>Explore Project</span>

            <FaArrowRight />
          </button>

        </div>

      </div>
    </article>
  );
}

export default Plotcard;