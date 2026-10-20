import {
  FaSearch,
  FaFilter,
  FaMapMarkerAlt,
  FaEllipsisH,
} from "react-icons/fa";

import "../styles/admin-plots.css";
import { usePlots } from "../../context/PlotContext";

const AdminPlots = () => {
  const { plots } = usePlots();


  return (
    <div className="admin-plots-page">

      {/* Header */}
      <div className="admin-plots-header">

        <div>
          <span className="admin-plots-kicker">
            INVENTORY MANAGEMENT
          </span>

          <h1>Plots</h1>

          <p>
            View and manage plot availability across your projects.
          </p>
        </div>

        <button className="admin-plots-filter-btn">
          <FaFilter />
          Filter
        </button>

      </div>

      {/* Summary */}
      <div className="admin-plots-summary">

        <div className="admin-plot-summary-card">
          <span>Total Plots</span>
          <strong>484</strong>
          <small>Across all projects</small>
        </div>

        <div className="admin-plot-summary-card">
          <span>Available</span>
          <strong>234</strong>
          <small>Ready for booking</small>
        </div>

        <div className="admin-plot-summary-card">
          <span>Reserved</span>
          <strong>36</strong>
          <small>Temporarily reserved</small>
        </div>

        <div className="admin-plot-summary-card">
          <span>Booked</span>
          <strong>214</strong>
          <small>Already booked</small>
        </div>

      </div>

      {/* Main Card */}
      <section className="admin-plots-card">

        <div className="admin-plots-toolbar">

          <div>
            <h2>Plot Inventory</h2>

            <p>
              Browse plots and check their current availability.
            </p>
          </div>

          <div className="admin-plots-search">
            <FaSearch />

            <input
              type="text"
              placeholder="Search plot or project..."
            />
          </div>

        </div>

        {/* Table */}
        <div className="admin-plots-table-wrapper">

          <div className="admin-plots-table">

            <div className="admin-plots-table-header">
              <span>Plot</span>
              <span>Project</span>
              <span>Location</span>
              <span>Size</span>
              <span>Facing</span>
              <span>Price</span>
              <span>Status</span>
              <span>Action</span>
            </div>

            {plots.map((plot) => (

              <div
                className="admin-plots-table-row"
                key={plot.id}
              >

                {/* Plot */}
                <div className="admin-plot-name">
                  <strong>{plot.plot}</strong>
                  <small>{plot.id}</small>
                </div>

                {/* Project */}
                <div className="admin-plot-project">
                  {plot.project}
                </div>

                {/* Location */}
                <div className="admin-plot-location">
                  <FaMapMarkerAlt />
                  <span>{plot.location}</span>
                </div>

                {/* Size */}
                <div className="admin-plot-size">
                  {plot.size}
                </div>

                {/* Facing */}
                <div className="admin-plot-facing">
                  {plot.facing}
                </div>

                {/* Price */}
                <div className="admin-plot-price">
                  {plot.price}
                </div>

                {/* Status */}
                <div>
                  <span
                    className={`admin-plot-status ${plot.status
                      .toLowerCase()
                      .replace(" ", "-")}`}
                  >
                    {plot.status}
                  </span>
                </div>

                {/* Action */}
                <button
                  className="admin-plot-action"
                  title="More"
                >
                  <FaEllipsisH />
                </button>

              </div>

            ))}

          </div>

        </div>

      </section>

    </div>
  );
};

export default AdminPlots;