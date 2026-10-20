import '../css/Finalcta.css'



function Finalcta() {
    return (
        <>
            <section className="about-final-cta">
                <div className="about-final-cta-card">
                    <div className="final-cta-whole">

                   
                        <div className="about-final-cta-content">

                            <span className="about-final-cta-label">
                                LET’S CONNECT
                            </span>

                            <h2>
                                Ready to find
                                <br />
                                <span>your perfect plot?</span>
                            </h2>

                            <p>
                                Explore our thoughtfully planned developments
                                <br />
                                and take the next step towards your future.
                            </p>

                            <div className="about-final-cta-actions">

                                <a href="/projects" className="about-cta-primary">
                                    <span>Explore Our Projects</span>
                                    <span className="about-cta-arrow">↗</span>
                                </a>

                                <a href="/contact" className="about-cta-secondary">
                                    Talk to Us
                                </a>

                            </div>

                        </div>

                        {/* Decorative concentric circles */}
                        <div className="about-cta-rings">
                            <span className="cta-ring ring-1"></span>
                            <span className="cta-ring ring-2"></span>
                        </div>
                    </div>
                </div>
            </section>

        </>
    );
}
export default Finalcta