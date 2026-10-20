import "../css/Searchform.css";

import { useState } from "react";

import { FaSearch } from "react-icons/fa";
import {
    FaSliders,
    FaArrowLeft,
    FaXmark,
} from "react-icons/fa6";

import ProjectCard from "./ProjectCard";

import { projects } from "./Cardlist/Homecardlist";


function Searchform() {

    const [mobileScreen, setMobileScreen] = useState("search");

    const [search, setSearch] = useState("");

    const [filters, setFilters] = useState({
        location: "",
        plotType: "",
        budget: "",
    });


    /* =====================================================
       UPDATE FILTER
    ===================================================== */

    const updateFilter = (key, value) => {

        setFilters((prev) => ({
            ...prev,
            [key]: value,
        }));

    };


    /* =====================================================
       RESET
    ===================================================== */

    const resetFilters = () => {

        setFilters({
            location: "",
            plotType: "",
            budget: "",
        });

    };


    /* =====================================================
       FILTER PROJECTS
    ===================================================== */

    const filteredProjects = projects.filter((project) => {

        const searchText = search.trim().toLowerCase();

        const matchesSearch =
            !searchText ||
            project.title?.toLowerCase().includes(searchText) ||
            project.location?.toLowerCase().includes(searchText) ||
            project.details?.toLowerCase().includes(searchText);


        const matchesLocation =
            !filters.location ||
            project.city === filters.location;


        const matchesPlotType =
            !filters.plotType ||
            project.plotType === filters.plotType;


        const matchesBudget =
            !filters.budget ||
            project.budget === filters.budget;


        return (
            matchesSearch &&
            matchesLocation &&
            matchesPlotType &&
            matchesBudget
        );

    });


    /* =====================================================
       APPLY FILTERS
    ===================================================== */

    const applyFilters = () => {

        setMobileScreen("results");

    };


    return (

        <div className="inpagesearch">


            {/* =================================================
                DESKTOP
            ================================================= */}

            <div className="desktop-search">

                <div className="wholebox">


                    {/* SEARCH */}

                    <div className="searchbar">

                        <FaSearch className="search-icon" />

                        <input
                            type="text"
                            placeholder="Search for available plots"
                            value={search}
                            onChange={(e) =>
                                setSearch(e.target.value)
                            }
                        />

                    </div>


                    {/* FILTERS */}

                    <div className="searchbyselect">


                        {/* LOCATION */}

                        <div className="desktop-filter">

                            <select
                                value={filters.location}
                                onChange={(e) =>
                                    updateFilter(
                                        "location",
                                        e.target.value
                                    )
                                }
                            >

                                <option value="">
                                    Location
                                </option>

                                <option value="Chennai">
                                    Chennai
                                </option>

                                <option value="Madurai">
                                    Madurai
                                </option>

                                <option value="Dindigul">
                                    Dindigul
                                </option>

                                <option value="Coimbatore">
                                    Coimbatore
                                </option>

                            </select>

                        </div>


                        {/* PLOT TYPE */}

                        <div className="desktop-filter">

                            <select
                                value={filters.plotType}
                                onChange={(e) =>
                                    updateFilter(
                                        "plotType",
                                        e.target.value
                                    )
                                }
                            >

                                <option value="">
                                    Plot Type
                                </option>

                                <option value="Residential">
                                    Residential
                                </option>

                                <option value="Commercial">
                                    Commercial
                                </option>

                                <option value="Villa Plot">
                                    Villa Plot
                                </option>

                            </select>

                        </div>


                        {/* BUDGET */}

                        <div className="desktop-filter">

                            <select
                                value={filters.budget}
                                onChange={(e) =>
                                    updateFilter(
                                        "budget",
                                        e.target.value
                                    )
                                }
                            >

                                <option value="">
                                    Budget
                                </option>

                                <option value="5-10">
                                    ₹5 - ₹10 Lakhs
                                </option>

                                <option value="10-20">
                                    ₹10 - ₹20 Lakhs
                                </option>

                                <option value="20+">
                                    ₹20+ Lakhs
                                </option>

                            </select>

                        </div>


                        {/* SEARCH BUTTON */}

                        <button
                            className="search-btn"
                            type="button"
                        >

                            <FaSearch />

                            Search

                        </button>

                    </div>

                </div>

            </div>


            {/* =================================================
                MOBILE
            ================================================= */}

            <div className="mobile-search">


                {/* =================================================
                    SEARCH SCREEN
                ================================================= */}

                {mobileScreen === "search" && (

                    <div className="mobile-search-screen">

                        <div className="mobile-searchbar">

                            <FaSearch />

                            <input
                                type="text"
                                placeholder="Search available plots"
                                value={search}
                                onChange={(e) =>
                                    setSearch(e.target.value)
                                }
                            />

                        </div>


                        <button
                            className="mobile-filter-trigger"
                            type="button"
                            onClick={() =>
                                setMobileScreen("filters")
                            }
                        >

                            <FaSliders />

                            <span>Filters</span>

                        </button>

                    </div>

                )}


                {/* =================================================
                    FILTER SCREEN
                ================================================= */}

                {mobileScreen === "filters" && (

                    <div className="mobile-filter-screen">


                        <div className="mobile-filter-header">


                            <button
                                type="button"
                                className="mobile-back-btn"
                                onClick={() =>
                                    setMobileScreen("search")
                                }
                            >

                                <FaArrowLeft />

                            </button>


                            <h3>
                                Filters
                            </h3>


                            <button
                                type="button"
                                className="mobile-reset-btn"
                                onClick={resetFilters}
                            >

                                Reset

                            </button>

                        </div>


                        {/* LOCATION */}

                        <div className="mobile-filter-group">

                            <label>
                                Location
                            </label>


                            <div className="filter-options">

                                {[
                                    "Chennai",
                                    "Madurai",
                                    "Dindigul",
                                    "Coimbatore",
                                ].map((item) => (

                                    <button
                                        key={item}
                                        type="button"
                                        className={
                                            filters.location === item
                                                ? "filter-option active"
                                                : "filter-option"
                                        }
                                        onClick={() =>
                                            updateFilter(
                                                "location",
                                                item
                                            )
                                        }
                                    >

                                        {item}

                                    </button>

                                ))}

                            </div>

                        </div>


                        {/* PLOT TYPE */}

                        <div className="mobile-filter-group">

                            <label>
                                Plot Type
                            </label>


                            <div className="filter-options">

                                {[
                                    "Residential",
                                    "Commercial",
                                    "Villa Plot",
                                ].map((item) => (

                                    <button
                                        key={item}
                                        type="button"
                                        className={
                                            filters.plotType === item
                                                ? "filter-option active"
                                                : "filter-option"
                                        }
                                        onClick={() =>
                                            updateFilter(
                                                "plotType",
                                                item
                                            )
                                        }
                                    >

                                        {item}

                                    </button>

                                ))}

                            </div>

                        </div>


                        {/* BUDGET */}

                        <div className="mobile-filter-group">

                            <label>
                                Budget
                            </label>


                            <div className="filter-options">

                                {[
                                    {
                                        label: "₹5 - ₹10 Lakhs",
                                        value: "5-10",
                                    },
                                    {
                                        label: "₹10 - ₹20 Lakhs",
                                        value: "10-20",
                                    },
                                    {
                                        label: "₹20+ Lakhs",
                                        value: "20+",
                                    },
                                ].map((item) => (

                                    <button
                                        key={item.value}
                                        type="button"
                                        className={
                                            filters.budget === item.value
                                                ? "filter-option active"
                                                : "filter-option"
                                        }
                                        onClick={() =>
                                            updateFilter(
                                                "budget",
                                                item.value
                                            )
                                        }
                                    >

                                        {item.label}

                                    </button>

                                ))}

                            </div>

                        </div>


                        {/* APPLY */}

                        <button
                            className="apply-filter-btn"
                            type="button"
                            onClick={applyFilters}
                        >

                            Apply Filters

                        </button>

                    </div>

                )}


                {/* =================================================
                    RESULTS
                ================================================= */}

                {mobileScreen === "results" && (

                    <div className="mobile-results-screen">


                        {/* HEADER */}

                        <div className="mobile-results-header">


                            <button
                                type="button"
                                className="mobile-back-btn"
                                onClick={() =>
                                    setMobileScreen("filters")
                                }
                            >

                                <FaArrowLeft />

                            </button>


                            <div>

                                <span>
                                    SEARCH RESULTS
                                </span>

                                <h3>
                                    {filteredProjects.length} Projects Found
                                </h3>

                            </div>


                            <button
                                type="button"
                                className="mobile-close-btn"
                                onClick={() =>
                                    setMobileScreen("search")
                                }
                            >

                                <FaXmark />

                            </button>

                        </div>


                        {/* SELECTED FILTERS */}

                        <div className="selected-filters">


                            {filters.location && (

                                <span>
                                    {filters.location}
                                </span>

                            )}


                            {filters.plotType && (

                                <span>
                                    {filters.plotType}
                                </span>

                            )}


                            {filters.budget && (

                                <span>

                                    {filters.budget === "5-10"
                                        ? "₹5 - ₹10L"
                                        : filters.budget === "10-20"
                                            ? "₹10 - ₹20L"
                                            : "₹20L+"}

                                </span>

                            )}


                            {!filters.location &&
                                !filters.plotType &&
                                !filters.budget && (

                                    <span>
                                        All Projects
                                    </span>

                                )}

                        </div>


                        {/* PROJECT RESULTS */}

                        {filteredProjects.length > 0 ? (

                            <div className="mobile-filtered-projects">

                                {filteredProjects.map((project) => (

                                    <ProjectCard
                                        key={project.id}
                                        {...project}
                                    />

                                ))}

                            </div>

                        ) : (

                            <div className="mobile-no-results">

                                <FaSearch />

                                <h4>
                                    No Projects Found
                                </h4>

                                <p>
                                    Try changing your search
                                    or filters.
                                </p>

                                <button
                                    type="button"
                                    onClick={resetFilters}
                                >
                                    Clear Filters
                                </button>

                            </div>

                        )}

                    </div>

                )}

            </div>

        </div>

    );

}


export default Searchform;