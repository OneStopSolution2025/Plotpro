import Plotimg from '../assets/projectimg1.png'
import aboutimg from '../assets/About-section.jpg'
import section4 from '../assets/bg-image.jpg'
import "../css/About.css";
import Navbar from '../components/Navbar'
import Finalcta from '../components/Final-cta';
import Footer from '../components/Footer'

const About = () => {
    return (
        <main className="about-page">
            <Navbar />
            <section className="about-hero">

                <div className="about-hero-content">

                    <span className="about-eyebrow">
                        ABOUT DREAMCITY
                    </span>

                    <h1>
                        Building the foundation
                        <br />
                        <span>for your future.</span>
                    </h1>

                    <p>
                        We develop thoughtfully planned residential plots
                        in carefully selected locations, creating the right
                        foundation for families to build their future.
                    </p>

                    <div className="about-hero-actions">
                        <a href="/projects" className="about-primary-btn">
                            Explore Our Projects
                            <span className='arrow'>↗</span>
                        </a>

                        <a href="/contact" className="about-secondary-btn">
                            Talk to Us
                        </a>
                    </div>

                </div>

                <div className="about-hero-image-wrap">

                    <div className="about-hero-image">
                        <img
                            src={Plotimg}
                            alt="DreamCity plotted development"
                        />
                    </div>

                </div>

            </section>

            <section className="about-intro">

                <div className="about-intro-top">

                    <div className="about-intro-heading">

                        <span className="about-section-label">
                            WHO WE ARE
                        </span>

                        <h2>
                            More than
                            <br />
                            just a <span>plot.</span>
                        </h2>

                    </div>

                    <div className="about-intro-description">

                        <p className="about-intro-lead">
                            A well-planned plot is the beginning
                            of something bigger.
                        </p>

                        <p>
                            At DreamCity, we develop thoughtfully planned
                            residential plots in carefully selected locations.
                            From layout planning and connectivity to essential
                            infrastructure, every detail is considered to create
                            a better place for your future.
                        </p>

                        <a href="/projects" className="about-text-link">
                            Discover Our Projects
                            <span>↗</span>
                        </a>

                    </div>

                </div>

                <div className="about-intro-visual">

                    <div className="about-intro-image">

                        <img
                            src={aboutimg}
                            alt="DreamCity plotted development"
                        />

                    </div>

                </div>

            </section>
            {/* =========================================
    SECTION 3 — WHAT WE DO
========================================= */}

            <section className="about-process">

                <div className="about-process-header">

                    <div>
                        <span className="about-section-label">
                            WHAT WE DO
                        </span>

                        <h2>
                            From land to a
                            <br />
                            <span>better community.</span>
                        </h2>
                    </div>

                </div>


                <div className="about-process-list">

                    {/* STEP 01 */}
                    <div className="about-process-item">

                        <div className="process-number">
                            01
                        </div>

                        <div className="process-content">

                            <h3>Land <br /> Selection</h3>

                            <p>
                                We look for locations with strong connectivity,
                                accessibility and the potential to become
                                thriving residential communities.
                            </p>

                        </div>

                        <div className="process-arrow">
                            ↗
                        </div>

                    </div>


                    {/* STEP 02 */}
                    <div className="about-process-item">

                        <div className="process-number">
                            02
                        </div>

                        <div className="process-content">

                            <h3>Layout <br /> Planning</h3>

                            <p>
                                Each development is thoughtfully planned with
                                practical plot dimensions, internal roads,
                                access and a clear layout.
                            </p>

                        </div>

                        <div className="process-arrow">
                            ↗
                        </div>

                    </div>


                    {/* STEP 03 */}
                    <div className="about-process-item">

                        <div className="process-number">
                            03
                        </div>

                        <div className="process-content">

                            <h3>Site <br /> Development</h3>

                            <p>
                                We focus on essential infrastructure such as
                                roads, lighting, water facilities and other
                                project amenities.
                            </p>

                        </div>

                        <div className="process-arrow">
                            ↗
                        </div>

                    </div>


                    {/* STEP 04 */}
                    <div className="about-process-item">

                        <div className="process-number">
                            04
                        </div>

                        <div className="process-content">

                            <h3>Plot <br />Sales</h3>

                            <p>
                                With clear project information and plot
                                availability, we make it easier for customers
                                to find and choose the right plot.
                            </p>

                        </div>

                        <div className="process-arrow">
                            ↗
                        </div>

                    </div>

                </div>

            </section>

            {/* =========================================
    SECTION 4 — WHY DREAMCITY
========================================= */}

            <section className="about-why" id="why-dreamcity">

                <div className="about-why-container">

                    {/* TOP CONTENT */}



                    <div className="about-why-heading">

                        <span className="about-section-label">
                            WHY DREAMCITY
                        </span>

                        <h2>
                            The right plot is
                            <br />
                            <span>more than just land.</span>
                        </h2>

                    </div>

                    <div className="about-why-main">

                        {/* LEFT IMAGE */}

                        <div className="about-why-visual">

                            <div className="about-why-image">

                                <img
                                    src={section4}
                                    alt="DreamCity plotted development"
                                />

                                <div className="about-why-location-label">
                                    <span className='label-dot'>●</span>
                                    <span>FEATURED PROJECT</span>

                                </div>

                                <div className="about-why-location">


                                    <strong>Green Valley</strong>

                                    <small>
                                        Dindigul, Tamil Nadu
                                    </small>

                                </div>

                            </div>

                        </div>

                        <div className="about-why-list">

                            <div className="about-why-item">

                                <div className="about-why-item-content">

                                    <h3>
                                        Strategic Locations
                                    </h3>

                                    <p>
                                        Locations selected with practical
                                        connectivity and access to everyday
                                        essentials in mind.
                                    </p>

                                </div>

                                <div className="about-why-arrow">
                                    ↗
                                </div>

                            </div>

                            <div className="about-why-item">


                                <div className="about-why-item-content">

                                    <h3>
                                        Thoughtful Layouts
                                    </h3>

                                    <p>
                                        Practical plot sizes, organized roads
                                        and carefully planned spaces for a
                                        better site experience.
                                    </p>

                                </div>

                                <div className="about-why-arrow">
                                    ↗
                                </div>

                            </div>


                            {/* ITEM 03 */}

                            <div className="about-why-item">


                                <div className="about-why-item-content">

                                    <h3>
                                        Quality Infrastructure
                                    </h3>

                                    <p>
                                        We focus on essential site infrastructure
                                        that makes a plotted development practical
                                        and comfortable.
                                    </p>

                                </div>

                                <div className="about-why-arrow">
                                    ↗
                                </div>

                            </div>

                            <div className="about-why-item">


                                <div className="about-why-item-content">

                                    <h3>
                                        Long-Term Value
                                    </h3>

                                    <p>
                                        A thoughtfully selected plot gives you
                                        a strong foundation for your future plans
                                        and possibilities.
                                    </p>

                                </div>

                                <div className="about-why-arrow">
                                    ↗
                                </div>

                            </div>

                        </div>

                    </div>

                </div>

            </section>

            <Finalcta />

            <Footer />

        </main>
    );
};

export default About;