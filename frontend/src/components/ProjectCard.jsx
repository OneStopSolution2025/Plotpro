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

  return (
    <article className="project-card">
      {/* Project Image */}
      <img
        src={image}
        alt={title}
        className="project-img"
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