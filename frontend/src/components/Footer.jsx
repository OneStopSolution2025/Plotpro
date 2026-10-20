import { MapPin, Phone, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import "../css/Footer.css";
import footerlogo from '../assets/Logo/plotpro-logo12.png'

function Footer() {
    return (
        <footer className="footer">

            <div className="footer-content">

                <div className="footer-brand">

                    <div className="footer-logo-image">
                        <img src={footerlogo} alt="" />
                    </div>
                    <p>
                        Building well-planned residential communities
                        for a better and brighter tomorrow.
                    </p>

                </div>

                <div className="footer-column">

                    <h3>
                        Quick Links
                    </h3>

                    <Link to="/">
                        Home
                    </Link>

                    <Link to="/projects">
                        Projects
                    </Link>

                    <Link to="/about">
                        About Us
                    </Link>

                    <Link to="/contact">
                        Contact
                    </Link>

                </div>


                <div className="footer-column contact-column">

                    <h3>
                        Contact Us
                    </h3>

                    <p>
                        <MapPin />
                        Dindigul, Tamil Nadu
                    </p>

                    <a href="callto:+91 88698 34824">
                        <Phone />
                        +91 88698 34824
                    </a>
                    <p>
                        <a href="mailto:info@dreamcity.in">
                            <Mail />
                            info@os2plotpro.in
                        </a>
                    </p>


                </div>

            </div>

            <div className="footer-bottom">

                <p>
                    © 2026 DreamCity. All rights reserved.
                </p>

                <div>

                    <span>
                        Built & Powered by <a href="https://www.os2studio.com/">OS2 Studio</a>
                    </span>

                </div>

            </div>

        </footer>
    );
}

export default Footer;