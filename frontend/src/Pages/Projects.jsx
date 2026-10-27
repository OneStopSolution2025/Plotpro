import { useMemo, useState, useEffect, useRef } from "react";

import Navbar from "../components/Navbar";
import "../css/Projects.css";

import bgimg from "../assets/bg-img.png";
import filterimg from "../assets/filter.svg";

import ProjectCard from "../components/ProjectCard";

import { useProjects } from "../context/ProjectContext";

import Footer from '../components/Footer'

function Projects() {

    const { projects, parsePriceLakhs } = useProjects();


    const categories = [
        "All Projects",
        "Residential",
        "Commercial",
    ];


    const locationCounts = useMemo(() => {
        const counts = {};
        projects.forEach(p => {
            if (p.city) counts[p.city] = (counts[p.city] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([city, count]) => ({ city, count }));
    }, [projects]);


    const [locationSearch, setLocationSearch] = useState("");
    const [showAllLocations, setShowAllLocations] = useState(false);

    const filteredLocations = useMemo(() => {
        if (!locationSearch) return locationCounts;
        return locationCounts.filter(loc =>
            loc.city.toLowerCase().includes(locationSearch.toLowerCase())
        );
    }, [locationCounts, locationSearch]);

    const displayLocations = showAllLocations
        ? filteredLocations
        : filteredLocations.slice(0, 5);

    const hasMoreLocations = filteredLocations.length > 5;


    const plotTypes = [
        "Residential",
        "Commercial",
        "Villa Plot",
    ];

    const priceRange = useMemo(() => {
        const prices = projects.map(p => {
            const raw = p.priceLakhs !== undefined && p.priceLakhs !== null && !isNaN(p.priceLakhs)
                ? Number(p.priceLakhs)
                : parsePriceLakhs(p.plotPrice);
            return (!isNaN(raw) && raw > 0) ? raw : null;
        }).filter(Boolean);

        if (prices.length === 0) return { min: 1, max: 100 };
        const minFound = Math.min(...prices);
        const maxFound = Math.max(...prices);
        return {
            min: Math.max(1, Math.floor(minFound)),
            max: Math.max(100, Math.ceil(maxFound))
        };
    }, [projects, parsePriceLakhs]);

    const [appliedFilters, setAppliedFilters] = useState({
        category: "All Projects",
        locations: [],
        plotTypes: [],
        priceRange: { min: 1, max: 100 },
    });

    const [draftFilters, setDraftFilters] = useState({
        category: "All Projects",
        locations: [],
        plotTypes: [],
        priceRange: { min: 1, max: 100 },
    });

    const [mobileFilterOpen, setMobileFilterOpen] =
        useState(false);


    const isPriceInitializedRef = useRef(false);

    useEffect(() => {
        if (!isPriceInitializedRef.current) {
            if (projects.length > 0) {
                isPriceInitializedRef.current = true;
                setDraftFilters(prev => ({
                    ...prev,
                    priceRange: { ...priceRange }
                }));
                setAppliedFilters(prev => ({
                    ...prev,
                    priceRange: { ...priceRange }
                }));
            }
            return;
        }

        // On subsequent background polls, do NOT overwrite active or draft filter values.
        // We only clamp if the values exceed the new absolute project bounds.
        setDraftFilters(prev => {
            const currentMin = prev.priceRange.min;
            const currentMax = prev.priceRange.max;
            const clampedMin = Math.max(priceRange.min, currentMin);
            const clampedMax = Math.min(priceRange.max, currentMax);

            if (clampedMin === currentMin && clampedMax === currentMax) {
                return prev;
            }
            return {
                ...prev,
                priceRange: {
                    min: Math.min(clampedMin, clampedMax),
                    max: Math.max(clampedMin, clampedMax)
                }
            };
        });

        setAppliedFilters(prev => {
            const currentMin = prev.priceRange.min;
            const currentMax = prev.priceRange.max;
            const clampedMin = Math.max(priceRange.min, currentMin);
            const clampedMax = Math.min(priceRange.max, currentMax);

            if (clampedMin === currentMin && clampedMax === currentMax) {
                return prev;
            }
            return {
                ...prev,
                priceRange: {
                    min: Math.min(clampedMin, clampedMax),
                    max: Math.max(clampedMin, clampedMax)
                }
            };
        });
    }, [priceRange, projects.length]);


    /* =====================================================
       TOGGLE CHECKBOX FILTER
    ===================================================== */

    const toggleFilter = (key, value) => {

        setDraftFilters((previous) => {

            const currentValues = previous[key];

            const alreadySelected =
                currentValues.includes(value);


            if (alreadySelected) {

                return {
                    ...previous,

                    [key]: currentValues.filter(
                        (item) => item !== value
                    ),
                };

            }


            return {
                ...previous,

                [key]: [
                    ...currentValues,
                    value,
                ],
            };

        });

    };


    const handleDraftCategoryChange = (category) => {

        setDraftFilters((previous) => ({
            ...previous,
            category,
        }));

    };

    const handleTopCategoryChange = (category) => {

        setDraftFilters((previous) => ({
            ...previous,
            category,
        }));


        setAppliedFilters((previous) => ({
            ...previous,
            category,
        }));

    };

    const getPercent = (value) => {
        const numVal = typeof value === "number" ? value : (parseFloat(value) || priceRange.min);
        const range = priceRange.max - priceRange.min;
        if (range <= 0) return 0;
        const pct = ((numVal - priceRange.min) / range) * 100;
        return Math.max(0, Math.min(100, pct));
    };

    const minPercent = getPercent(draftFilters.priceRange.min);
    const maxPercent = getPercent(draftFilters.priceRange.max);

    const getValueFromPercent = (percent) => {
        const range = priceRange.max - priceRange.min;
        return Math.round((priceRange.min + (percent / 100) * range) * 2) / 2;
    };

    const handleThumbMouseDown = (e, thumb) => {
        e.preventDefault();
        e.stopPropagation();

        const trackEl = e.currentTarget.closest('.price-track');
        if (!trackEl) return;

        const handleMouseMove = (moveEvent) => {
            const trackRect = trackEl.getBoundingClientRect();
            let percent = ((moveEvent.clientX - trackRect.left) / trackRect.width) * 100;
            percent = Math.max(0, Math.min(100, percent));
            const value = getValueFromPercent(percent);

            setDraftFilters(prev => {
                if (thumb === 'min') {
                    return {
                        ...prev,
                        priceRange: { ...prev.priceRange, min: Math.min(value, prev.priceRange.max) }
                    };
                } else {
                    return {
                        ...prev,
                        priceRange: { ...prev.priceRange, max: Math.max(value, prev.priceRange.min) }
                    };
                }
            });
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleThumbTouchStart = (e, thumb) => {
        e.stopPropagation();
        const touch = e.touches[0];
        const trackEl = e.currentTarget.closest('.price-track');
        if (!trackEl) return;

        const handleTouchMove = (moveEvent) => {
            const trackRect = trackEl.getBoundingClientRect();
            let percent = ((moveEvent.touches[0].clientX - trackRect.left) / trackRect.width) * 100;
            percent = Math.max(0, Math.min(100, percent));
            const value = getValueFromPercent(percent);

            setDraftFilters(prev => {
                if (thumb === 'min') {
                    return {
                        ...prev,
                        priceRange: { ...prev.priceRange, min: Math.min(value, prev.priceRange.max) }
                    };
                } else {
                    return {
                        ...prev,
                        priceRange: { ...prev.priceRange, max: Math.max(value, prev.priceRange.min) }
                    };
                }
            });
        };

        const handleTouchEnd = () => {
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
        };

        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleTouchEnd);
    };

    const handleTrackMouseDown = (e) => {
        if (e.target.classList.contains('price-thumb')) return;
        const trackRect = e.currentTarget.getBoundingClientRect();
        let percent = ((e.clientX - trackRect.left) / trackRect.width) * 100;
        percent = Math.max(0, Math.min(100, percent));
        const value = getValueFromPercent(percent);

        // Determine which thumb is closer
        const minPercent = getPercent(draftFilters.priceRange.min);
        const maxPercent = getPercent(draftFilters.priceRange.max);
        const distToMin = Math.abs(percent - minPercent);
        const distToMax = Math.abs(percent - maxPercent);
        const targetThumb = distToMin <= distToMax ? 'min' : 'max';

        setDraftFilters(prev => {
            if (targetThumb === 'min') {
                return {
                    ...prev,
                    priceRange: { ...prev.priceRange, min: Math.min(value, prev.priceRange.max) }
                };
            } else {
                return {
                    ...prev,
                    priceRange: { ...prev.priceRange, max: Math.max(value, prev.priceRange.min) }
                };
            }
        });
    };

    const handleTrackTouchStart = (e) => {
        if (e.target.classList.contains('price-thumb')) return;
        const touch = e.touches[0];
        const trackRect = e.currentTarget.getBoundingClientRect();
        let percent = ((touch.clientX - trackRect.left) / trackRect.width) * 100;
        percent = Math.max(0, Math.min(100, percent));
        const value = getValueFromPercent(percent);

        // Determine which thumb is closer
        const minPercent = getPercent(draftFilters.priceRange.min);
        const maxPercent = getPercent(draftFilters.priceRange.max);
        const distToMin = Math.abs(percent - minPercent);
        const distToMax = Math.abs(percent - maxPercent);
        const targetThumb = distToMin <= distToMax ? 'min' : 'max';

        setDraftFilters(prev => {
            if (targetThumb === 'min') {
                return {
                    ...prev,
                    priceRange: { ...prev.priceRange, min: Math.min(value, prev.priceRange.max) }
                };
            } else {
                return {
                    ...prev,
                    priceRange: { ...prev.priceRange, max: Math.max(value, prev.priceRange.min) }
                };
            }
        });
    };

    /* =====================================================
           PRICE RANGE MATCH (replaces budget match)
        ===================================================== */

    const priceRangeMatch = (project, range) => {
        // Use priceLakhs if available, otherwise parse from plotPrice
        const raw = project.priceLakhs !== undefined && project.priceLakhs !== null && !isNaN(project.priceLakhs)
            ? Number(project.priceLakhs)
            : parsePriceLakhs(project.plotPrice);
        const priceLakhs = (!isNaN(raw) && raw > 0) ? raw : parsePriceLakhs(project.plotPrice);

        // If price could not be determined
        if (!priceLakhs || isNaN(priceLakhs) || priceLakhs <= 0) {
            // Only include if no specific price filter has been actively set
            return range.min <= priceRange.min && range.max >= priceRange.max;
        }

        return priceLakhs >= range.min && priceLakhs <= range.max;
    };

    const filteredProjects = useMemo(() => {

        return projects.filter((project) => {

            const categoryMatch =
                appliedFilters.category === "All Projects" ||
                project.category === appliedFilters.category ||
                project.plotType === appliedFilters.category;




            const locationMatch =
                appliedFilters.locations.length === 0 ||
                appliedFilters.locations.includes(
                    project.city
                );


            /* ---------------------------------------------
               PLOT TYPE
            --------------------------------------------- */

            const plotTypeMatch =
                appliedFilters.plotTypes.length === 0 ||
                appliedFilters.plotTypes.includes(
                    project.plotType
                );


            /* ---------------------------------------------
               PRICE RANGE
            --------------------------------------------- */

            const priceMatch = priceRangeMatch(
                project,
                appliedFilters.priceRange
            );


            return (
                categoryMatch &&
                locationMatch &&
                plotTypeMatch &&
                priceMatch
            );

        });

    }, [projects, appliedFilters]);

    /* =====================================================
       APPLY FILTERS
    ===================================================== */

    const applyFilters = () => {
        const rawMin = typeof draftFilters.priceRange.min === "number" ? draftFilters.priceRange.min : parseFloat(draftFilters.priceRange.min);
        const rawMax = typeof draftFilters.priceRange.max === "number" ? draftFilters.priceRange.max : parseFloat(draftFilters.priceRange.max);
        const validMin = isNaN(rawMin) ? priceRange.min : Math.max(priceRange.min, rawMin);
        const validMax = isNaN(rawMax) ? priceRange.max : Math.min(priceRange.max, rawMax);
        const finalPriceRange = {
            min: Math.min(validMin, validMax),
            max: Math.max(validMin, validMax)
        };

        setDraftFilters(prev => ({
            ...prev,
            priceRange: finalPriceRange
        }));

        setAppliedFilters({
            category: draftFilters.category,

            locations: [
                ...draftFilters.locations,
            ],

            plotTypes: [
                ...draftFilters.plotTypes,
            ],

            priceRange: finalPriceRange,
        });


        /* Close mobile filter after applying */

        setMobileFilterOpen(false);

    };


    /* =====================================================
       RESET FILTERS

       Only resets the DRAFT.
       Project results won't change until Apply.
    ===================================================== */

    const resetFilters = () => {

        setDraftFilters({
            category: "All Projects",
            locations: [],
            plotTypes: [],
            priceRange: { ...priceRange },
        });

    };


    /* =====================================================
       CLEAR + APPLY IMMEDIATELY

       Used by "Clear Filters" in no-results state.
    ===================================================== */

    const clearAllFilters = () => {

        const emptyFilters = {
            category: "All Projects",
            locations: [],
            plotTypes: [],
            priceRange: { ...priceRange },
        };


        setDraftFilters(emptyFilters);

        setAppliedFilters(emptyFilters);

    };


    /* =====================================================
       MOBILE FILTER TOGGLE
    ===================================================== */

    const toggleMobileFilter = () => {

        setMobileFilterOpen(
            (previous) => !previous
        );

    };


    return (

        <main className="home-page">


            {/* =================================================
                TOP CONTAINER
            ================================================= */}

            <div className="home-container">

                <Navbar />


                {/* =================================================
                    HERO
                ================================================= */}

                <section className="hero-section1">

                    <img
                        src={bgimg}
                        alt="Dream property"
                        className="hero-img"
                    />


                    <div className="hero-overlay1"></div>


                    <div className="hero-content1">

                        <h1>
                            Explore Our Projects
                        </h1>


                        <p>
                            Explore verified land projects
                            and premium plots in prime
                            locations. Find the right
                            property for your dream home
                            or your next investment.
                        </p>

                    </div>

                </section>


                {/* =================================================
                    DESKTOP CATEGORY BAR

                    Hidden on mobile.
                ================================================= */}

                <div className="mid-section1">

                    <div className="plot-sort1">

                        {categories.map((category) => (

                            <button
                                key={category}
                                type="button"
                                className={
                                    appliedFilters.category === category
                                        ? "sort-button1 active"
                                        : "sort-button1"
                                }
                                onClick={() =>
                                    handleTopCategoryChange(
                                        category
                                    )
                                }
                            >

                                {category}

                            </button>

                        ))}

                    </div>

                </div>

            </div>


            {/* =====================================================
                MOBILE FILTER BUTTON

                Only visible on mobile.
            ===================================================== */}

            <div className="mobile-filter-trigger">

                <button
                    type="button"
                    onClick={toggleMobileFilter}
                    aria-expanded={mobileFilterOpen}
                >

                    <img
                        src={filterimg}
                        alt=""
                    />


                    <span>

                        {mobileFilterOpen
                            ? "Hide Filters"
                            : "Filters"}

                    </span>

                </button>

            </div>


            {/* =====================================================
                PROJECT SECTION
            ===================================================== */}

            <div className="project-section">


                {/* =================================================
                    FILTER SIDEBAR
                ================================================= */}

                <aside
                    className={
                        mobileFilterOpen
                            ? "filters mobile-filter-visible"
                            : "filters"
                    }
                >


                    {/* =================================================
                        FILTER HEADER
                    ================================================= */}

                    <div className="fil-reset">


                        <div className="fil">

                            <img
                                src={filterimg}
                                className="filimg"
                                alt="Filter"
                            />


                            <p>
                                Filters
                            </p>

                        </div>


                        <div className="reset-btn">

                            <button
                                type="button"
                                onClick={resetFilters}
                            >
                                Reset
                            </button>

                        </div>

                    </div>


                    {/* =================================================
                        MOBILE CATEGORY

                        Hidden on desktop.
                    ================================================= */}

                    <div className="filter-category-mobile">

                        <div className="title">
                            Project Type
                        </div>


                        <div className="selection">

                            {categories.map((category) => (

                                <div
                                    className="loc1"
                                    key={category}
                                >

                                    <input
                                        id={`filter-mobile-category-${category}`}
                                        type="radio"
                                        name="mobile-project-category"
                                        checked={
                                            draftFilters.category ===
                                            category
                                        }
                                        onChange={() =>
                                            handleDraftCategoryChange(
                                                category
                                            )
                                        }
                                    />


                                    <label htmlFor={`filter-mobile-category-${category}`}>
                                        {category}
                                    </label>

                                </div>

                            ))}

                        </div>

                    </div>


                    {/* =================================================
                        LOCATION
                    ================================================= */}

                    <div className="location">

                        <div className="title">
                            Location
                        </div>

                        {/* Search Input */}
                        <div className="location-search">
                            <input
                                type="text"
                                placeholder="Search locations..."
                                value={locationSearch}
                                onChange={(e) => setLocationSearch(e.target.value)}
                            />
                        </div>

                        <div className="selection">

                            {displayLocations.map((loc) => (

                                <div
                                    className="loc1"
                                    key={loc.city}
                                >

                                    <input
                                        id={`filter-location-${loc.city}`}
                                        type="checkbox"
                                        checked={
                                            draftFilters.locations.includes(
                                                loc.city
                                            )
                                        }
                                        onChange={() =>
                                            toggleFilter(
                                                "locations",
                                                loc.city
                                            )
                                        }
                                    />


                                    <label htmlFor={`filter-location-${loc.city}`}>
                                        <span>{loc.city}</span>
                                        <span className="location-count">({loc.count})</span>
                                    </label>

                                </div>

                            ))}

                        </div>

                    </div>


                    {/* =================================================
                        PLOT TYPES
                    ================================================= */}

                    <div className="location">

                        <div className="title">
                            Plot Types
                        </div>


                        <div className="selection">

                            {plotTypes.map((type) => (

                                <div
                                    className="loc1"
                                    key={type}
                                >

                                    <input
                                        id={`filter-plottype-${type}`}
                                        type="checkbox"
                                        checked={
                                            draftFilters.plotTypes.includes(
                                                type
                                            )
                                        }
                                        onChange={() =>
                                            toggleFilter(
                                                "plotTypes",
                                                type
                                            )
                                        }
                                    />


                                    <label htmlFor={`filter-plottype-${type}`}>
                                        {type}
                                    </label>

                                </div>

                            ))}

                        </div>

                    </div>


                    {/* =================================================
                        PRICE RANGE
                    ================================================= */}

                    <div className="location1">

                        <div className="title">
                            Price Range (₹ Lakh)
                        </div>


                        <div className="selection price-range-slider">
                            <div className="price-range-inputs">
                                <label>
                                    Min
                                    <input
                                        type="number"
                                        min={priceRange.min}
                                        max={priceRange.max}
                                        step="0.5"
                                        value={draftFilters.priceRange.min}
                                        onChange={(e) => {
                                            const raw = e.target.value;
                                            if (raw === "") {
                                                setDraftFilters(prev => ({
                                                    ...prev,
                                                    priceRange: { ...prev.priceRange, min: "" }
                                                }));
                                                return;
                                            }
                                            const val = parseFloat(raw);
                                            if (isNaN(val)) return;
                                            setDraftFilters(prev => ({
                                                ...prev,
                                                priceRange: {
                                                    ...prev.priceRange,
                                                    min: val
                                                }
                                            }));
                                        }}
                                        onBlur={() => {
                                            setDraftFilters(prev => {
                                                const currentMin = typeof prev.priceRange.min === "number" ? prev.priceRange.min : priceRange.min;
                                                const currentMax = typeof prev.priceRange.max === "number" ? prev.priceRange.max : priceRange.max;
                                                const validMin = Math.max(priceRange.min, Math.min(currentMin, currentMax));
                                                return {
                                                    ...prev,
                                                    priceRange: {
                                                        ...prev.priceRange,
                                                        min: validMin
                                                    }
                                                };
                                            });
                                        }}
                                    />
                                </label>
                                <label>
                                    Max
                                    <input
                                        type="number"
                                        min={priceRange.min}
                                        max={priceRange.max}
                                        step="0.5"
                                        value={draftFilters.priceRange.max}
                                        onChange={(e) => {
                                            const raw = e.target.value;
                                            if (raw === "") {
                                                setDraftFilters(prev => ({
                                                    ...prev,
                                                    priceRange: { ...prev.priceRange, max: "" }
                                                }));
                                                return;
                                            }
                                            const val = parseFloat(raw);
                                            if (isNaN(val)) return;
                                            setDraftFilters(prev => ({
                                                ...prev,
                                                priceRange: {
                                                    ...prev.priceRange,
                                                    max: val
                                                }
                                            }));
                                        }}
                                        onBlur={() => {
                                            setDraftFilters(prev => {
                                                const currentMin = typeof prev.priceRange.min === "number" ? prev.priceRange.min : priceRange.min;
                                                const currentMax = typeof prev.priceRange.max === "number" ? prev.priceRange.max : priceRange.max;
                                                const validMax = Math.min(priceRange.max, Math.max(currentMax, currentMin));
                                                return {
                                                    ...prev,
                                                    priceRange: {
                                                        ...prev.priceRange,
                                                        max: validMax
                                                    }
                                                };
                                            });
                                        }}
                                    />
                                </label>
                            </div>

                            <div className="price-track-container">
                                <div
                                    className="price-track"
                                    onMouseDown={(e) => handleTrackMouseDown(e)}
                                    onTouchStart={(e) => handleTrackTouchStart(e)}
                                >
                                    <div
                                        className="price-range-fill"
                                        style={{
                                            left: `${minPercent}%`,
                                            right: `${100 - maxPercent}%`
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="price-thumb min-thumb"
                                        style={{ left: `${minPercent}%` }}
                                        onMouseDown={(e) => handleThumbMouseDown(e, 'min')}
                                        onTouchStart={(e) => handleThumbTouchStart(e, 'min')}
                                        aria-label={`Min price: ₹${draftFilters.priceRange.min} Lakh`}
                                    />
                                    <button
                                        type="button"
                                        className="price-thumb max-thumb"
                                        style={{ left: `${maxPercent}%` }}
                                        onMouseDown={(e) => handleThumbMouseDown(e, 'max')}
                                        onTouchStart={(e) => handleThumbTouchStart(e, 'max')}
                                        aria-label={`Max price: ₹${draftFilters.priceRange.max} Lakh`}
                                    />
                                </div>
                            </div>

                            <div className="price-range-labels">
                                <span>₹{draftFilters.priceRange.min} L</span>
                                <span>₹{draftFilters.priceRange.max} L</span>
                            </div>
                        </div>

                    </div>


                    {/* =================================================
                        APPLY FILTER
                    ================================================= */}

                    <button
                        className="apply-filter"
                        type="button"
                        onClick={applyFilters}
                    >

                        Apply Filters

                    </button>

                </aside>


                {/* =================================================
                    PROJECT RESULTS
                ================================================= */}

                <section className="project-results-wrapper">


                    {/* =================================================
                        RESULT HEADER
                    ================================================= */}

                    <div className="project-results-header">

                        <div>

                            <span>
                                PROJECTS
                            </span>


                            <h2>
                                {filteredProjects.length}
                                {" "}
                                {filteredProjects.length === 1
                                    ? "Project"
                                    : "Projects"}{" "}
                                Found
                            </h2>

                        </div>

                    </div>


                    {/* =================================================
                        PROJECT CARDS
                    ================================================= */}

                    {filteredProjects.length > 0 ? (

                        <div className="project-card2">

                            {filteredProjects.map(
                                (project) => (

                                    <ProjectCard
                                        key={project.id}
                                        {...project}
                                    />

                                )
                            )}

                        </div>

                    ) : (

                        /* =================================================
                           NO RESULTS
                        ================================================= */

                        <div className="no-projects">

                            <h3>
                                No Projects Found
                            </h3>


                            <p>
                                Try changing your filters
                                to find available projects.
                            </p>


                            <button
                                type="button"
                                onClick={
                                    clearAllFilters
                                }
                            >

                                Clear Filters

                            </button>

                        </div>

                    )}

                </section>



            </div>
            <Footer />

        </main>

    );

}


export default Projects;