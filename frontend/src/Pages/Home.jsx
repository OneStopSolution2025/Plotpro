import "../css/Home.css";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Finalcta from "../components/Final-cta";

import heroimage from "../assets/bg-image.jpg";

import Homecardlist from "../components/Cardlist/Homecardlist";

import { useEffect, useRef } from "react";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import {
    ArrowRight,
    Search,
    Map,
    ClipboardPenLine,
    CalendarDays,
    KeyRound,
} from "lucide-react";

import { useNavigate } from "react-router-dom";


/* =====================================================
   GSAP PLUGIN
===================================================== */

gsap.registerPlugin(ScrollTrigger);


const Home = () => {

    const navigate = useNavigate();

    /* =====================================================
       HOW IT WORKS SECTION REF
    ===================================================== */

    const processRef = useRef(null);


    /* =====================================================
       GSAP SCROLL ANIMATION
    ===================================================== */

    useEffect(() => {

        const section = processRef.current;

        if (!section) return;

        const ctx = gsap.context(() => {

            const steps = gsap.utils.toArray(".process-step");

            const mm = gsap.matchMedia();


            /* =====================================================
               DESKTOP
            ===================================================== */

            mm.add("(min-width: 651px)", () => {

                const timeline = gsap.timeline({
                    defaults: {
                        ease: "power3.out"
                    },

                    scrollTrigger: {
                        trigger: section,

                        start: "top 12%",

                        /*
                         * THIS IS THE IMPORTANT PART
                         * Gives the animation a long scroll distance.
                         */
                        end: "+=2800",

                        scrub: 1,

                        pin: true,

                        pinSpacing: true,

                        anticipatePin: 1,

                        invalidateOnRefresh: true,

                        markers: false
                    }
                });


                /* =================================================
                   HEADER
                ================================================= */

                timeline.fromTo(
                    ".how-it-works-header",
                    {
                        opacity: 0,
                        y: 40
                    },
                    {
                        opacity: 1,
                        y: 0,
                        duration: 0.7
                    }
                );


                /* =================================================
                   LINE
                ================================================= */

                timeline.fromTo(
                    ".process-line-progress",
                    {
                        scaleY: 0
                    },
                    {
                        scaleY: 1,
                        duration: 4.5,
                        ease: "none"
                    },
                    "-=0.15"
                );


                /* =================================================
                   STEPS
                ================================================= */

                steps.forEach((step, index) => {

                    const direction =
                        index % 2 === 0
                            ? 70
                            : -70;


                    /* ---------------------------------------------
                       STEP
                    --------------------------------------------- */

                    timeline.fromTo(
                        step,
                        {
                            opacity: 0,
                            x: direction
                        },
                        {
                            opacity: 1,
                            x: 0,
                            duration: 0.75,
                            ease: "power3.out"
                        },

                        /*
                         * Spread each step across the timeline
                         */
                        index === 0
                            ? 0.7
                            : `+=${0.35}`
                    );


                    /* ---------------------------------------------
                       NUMBER
                    --------------------------------------------- */

                    timeline.fromTo(
                        step.querySelector(".process-number"),
                        {
                            opacity: 0,
                            scale: 0.6
                        },
                        {
                            opacity: 1,
                            scale: 1,
                            duration: 0.35,
                            ease: "back.out(1.7)"
                        },
                        "-=0.45"
                    );


                    /* ---------------------------------------------
                       ICON
                    --------------------------------------------- */

                    timeline.fromTo(
                        step.querySelector(".process-icon"),
                        {
                            opacity: 0,
                            scale: 0.7,
                            rotate: -10
                        },
                        {
                            opacity: 1,
                            scale: 1,
                            rotate: 0,
                            duration: 0.4,
                            ease: "back.out(1.5)"
                        },
                        "-=0.35"
                    );


                    /* ---------------------------------------------
                       NODE
                    --------------------------------------------- */

                    timeline.fromTo(
                        step.querySelector(".process-node"),
                        {
                            opacity: 0,
                            scale: 0.5
                        },
                        {
                            opacity: 1,
                            scale: 1,
                            duration: 0.3
                        },
                        "-=0.3"
                    );

                });

            });


            /* =====================================================
               MOBILE
            ===================================================== */

            mm.add("(max-width: 650px)", () => {

                const timeline = gsap.timeline({
                    defaults: {
                        ease: "power3.out"
                    },

                    scrollTrigger: {
                        trigger: section,

                        start: "top 10%",

                        end: "+=2200",

                        scrub: 1,

                        pin: true,

                        pinSpacing: true,

                        anticipatePin: 1,

                        invalidateOnRefresh: true,

                        markers: false
                    }
                });


                /* HEADER */

                timeline.fromTo(
                    ".how-it-works-header",
                    {
                        opacity: 0,
                        y: 30
                    },
                    {
                        opacity: 1,
                        y: 0,
                        duration: 0.6
                    }
                );


                /* LINE */

                timeline.fromTo(
                    ".process-line-progress",
                    {
                        scaleY: 0
                    },
                    {
                        scaleY: 1,
                        duration: 4
                    },
                    "-=0.1"
                );


                /* STEPS */

                steps.forEach((step, index) => {

                    timeline.fromTo(
                        step,
                        {
                            opacity: 0,
                            y: 35
                        },
                        {
                            opacity: 1,
                            y: 0,
                            duration: 0.6
                        },

                        index === 0
                            ? 0.6
                            : "+=0.25"
                    );


                    timeline.fromTo(
                        step.querySelector(".process-icon"),
                        {
                            opacity: 0,
                            scale: 0.7
                        },
                        {
                            opacity: 1,
                            scale: 1,
                            duration: 0.35,
                            ease: "back.out(1.5)"
                        },
                        "-=0.3"
                    );

                });

            });


            return () => {
                mm.revert();
            };

        }, section);


        return () => {
            ctx.revert();
        };

    }, []);


    return (
        <>
            <main className="home-page">
                <Navbar />

                <div className="home-container">

                    {/* =================================================
                        NAVBAR
                    ================================================= */}




                    {/* =================================================
                        HERO
                    ================================================= */}

                    <section className="hero-section">

                        <img
                            src={heroimage}
                            alt="Dream property"
                            className="hero-img"
                        />

                        <div className="hero-overlay"></div>


                        <div className="hero-content">

                            <h1>
                                Find the Perfect Plot
                                <br />
                                to Build Your Future
                            </h1>

                            <p>
                                Explore verified land projects and premium
                                plots in prime locations. Find the right
                                property for your dream home or your next
                                investment.
                            </p>

                        </div>

                    </section>


                    {/* =================================================
                        FEATURED PROJECTS
                    ================================================= */}

                    <section className="mid-section">

                        <div className="featured-header">

                            <div className="featured-title">

                                <span className="section-label">
                                    FEATURED PROJECTS
                                </span>

                                <h2>
                                    Explore our
                                    <br />
                                    plotted developments
                                </h2>

                            </div>


                            <button
                                className="show-projects"
                                onClick={() => navigate("/projects")}
                            >

                                <span>
                                    View All Projects
                                </span>

                                <ArrowRight className="arrow-icon" />

                            </button>

                        </div>


                        <div className="plot-cards">

                            <Homecardlist limit={4} />

                        </div>

                    </section>


                    {/* =================================================
                        WHY DREAMCITY
                    ================================================= */}

                    <section className="why-dreamcity-section">

                        <div className="why-dreamcity-top">

                            <div className="why-dreamcity-heading">

                                

                                <h2>
                                    Why
                                    <br />
                                    choose us
                                </h2>

                            </div>

                        </div>


                        <div className="why-dreamcity-features">


                            {/* 01 */}

                            <article className="why-feature">

                                <div className="why-feature-number">
                                    01
                                </div>

                                <h3>
                                    Strategic Locations
                                </h3>

                                <p>
                                    Well-connected locations with easy
                                    access to schools, hospitals,
                                    workplaces and everyday essentials.
                                </p>

                            </article>


                            {/* 02 */}

                            <article className="why-feature active">

                                <div className="why-feature-number">
                                    02
                                </div>

                                <h3>
                                    Thoughtful Layouts
                                </h3>

                                <p>
                                    Carefully planned layouts with
                                    optimal plot dimensions, wide
                                    internal roads and a well-organized
                                    development plan.
                                </p>

                            </article>


                            {/* 03 */}

                            <article className="why-feature">

                                <div className="why-feature-number">
                                    03
                                </div>

                                <h3>
                                    Quality Infrastructure
                                </h3>

                                <p>
                                    Essential infrastructure such as
                                    roads, street lighting, water
                                    facilities and green spaces for
                                    a better living experience.
                                </p>

                            </article>


                            {/* 04 */}

                            <article className="why-feature">

                                <div className="why-feature-number">
                                    04
                                </div>

                                <h3>
                                    Transparent Information
                                </h3>

                                <p>
                                    Clear details on project features,
                                    plot availability, pricing and
                                    specifications to help you make
                                    the right decision.
                                </p>

                            </article>


                            {/* 05 */}

                            <article className="why-feature">

                                <div className="why-feature-number">
                                    05
                                </div>

                                <h3>
                                    Our Support
                                </h3>

                                <p>
                                    Our team is always ready to assist
                                    you from enquiry to site visit
                                    and beyond for a smooth experience.
                                </p>

                            </article>

                        </div>

                    </section>


                    {/* =================================================
                        HOW IT WORKS
                    ================================================= */}

                    <section
                        className="how-it-works-section"
                        ref={processRef}
                    >

                        <div className="how-it-works-header">

                            <span className="process-label">
                                PROCESS

                            </span>

                            <h2>
                                How We <span>Work</span>
                            </h2>


                        </div>


                        {/* ================= TIMELINE ================= */}

                        <div className="process-timeline">


                            {/* Center line */}

                            <div className="process-line">

                                <div className="process-line-progress"></div>

                            </div>


                            {/* =================================================
                                STEP 01
                            ================================================= */}

                            <article className="process-step process-step-right">

                                <div className="process-content">

                                    <div className="process-icon">

                                        <Search
                                            size={27}
                                            strokeWidth={1.8}
                                        />

                                    </div>


                                    <div className="process-text">

                                        <h3>
                                            Explore Projects
                                        </h3>

                                        <p>
                                            Browse our plotted developments
                                            and discover projects in locations
                                            that suit your needs.
                                        </p>

                                    </div>

                                </div>


                                <div className="process-node">
                                    <span></span>
                                </div>

                            </article>


                            {/* =================================================
                                STEP 02
                            ================================================= */}

                            <article className="process-step process-step-left">

                                <div className="process-content">

                                    <div className="process-text">

                                        <h3>
                                            Choose Your Plot
                                        </h3>

                                        <p>
                                            Explore available plots inside
                                            your selected project and check
                                            size, facing and pricing details.
                                        </p>

                                    </div>


                                    <div className="process-icon">

                                        <Map
                                            size={27}
                                            strokeWidth={1.8}
                                        />

                                    </div>

                                </div>


                                <div className="process-node">
                                    <span></span>
                                </div>

                            </article>


                            {/* =================================================
                                STEP 03
                            ================================================= */}

                            <article className="process-step process-step-right">

                                <div className="process-content">


                                    <div className="process-icon">

                                        <ClipboardPenLine
                                            size={27}
                                            strokeWidth={1.8}
                                        />

                                    </div>


                                    <div className="process-text">

                                        <h3>
                                            Enquire or Book
                                        </h3>

                                        <p>
                                            Submit an enquiry or booking
                                            request for your preferred plot
                                            and connect with our team.
                                        </p>

                                    </div>

                                </div>


                                <div className="process-node">
                                    <span></span>
                                </div>

                            </article>


                            {/* =================================================
                                STEP 04
                            ================================================= */}

                            <article className="process-step process-step-left">

                                <div className="process-content">

                                    <div className="process-text">

                                        <h3>
                                            Site Visit
                                        </h3>

                                        <p>
                                            Visit the project site, understand
                                            the location and get complete
                                            clarification before confirming.
                                        </p>

                                    </div>


                                    <div className="process-icon">

                                        <CalendarDays
                                            size={27}
                                            strokeWidth={1.8}
                                        />

                                    </div>

                                </div>


                                <div className="process-node">
                                    <span></span>
                                </div>

                            </article>


                            {/* =================================================
                                STEP 05
                            ================================================= */}

                            <article className="process-step process-step-right">

                                <div className="process-content">


                                    <div className="process-icon">

                                        <KeyRound
                                            size={27}
                                            strokeWidth={1.8}
                                        />

                                    </div>


                                    <div className="process-text">

                                        <h3>
                                            Own Your Plot
                                        </h3>

                                        <p>
                                            Complete the necessary formalities
                                            and take the first step towards
                                            building your future.
                                        </p>

                                    </div>

                                </div>


                                <div className="process-node">
                                    <span></span>
                                </div>

                            </article>

                        </div>

                    </section>
                    <Finalcta />
                </div>

            </main>


            <Footer />

        </>
    );
};


export default Home;