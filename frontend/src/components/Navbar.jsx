import "../css/Navbar.css";
import Container from "react-bootstrap/Container";
import Nav from "react-bootstrap/Nav";
import Navbar from "react-bootstrap/Navbar";
import { ArrowRight, LogOut} from 'lucide-react';
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import plotproLogo from "../assets/Logo/plotpro-logo12.png";

function MainNavbar() {
    const { user, isAuthenticated, isAdmin, isSuperAdmin, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (

        <Navbar
            expand="lg"
            className="whole"
        >

            <Container>
                <Navbar.Brand
                    as={Link}
                    to="/"
                    className="brand-name"
                >
                    <img
                        src={plotproLogo}
                        alt="PlotPro Logo"
                        className="navbar-brand-logo"
                    />
                </Navbar.Brand>
                <Navbar.Toggle
                    aria-controls="basic-navbar-nav"
                />
                <Navbar.Collapse
                    id="basic-navbar-nav"
                >
                    <Nav className="mx-auto center-nav-links">

                        <Nav.Link
                            as={Link}
                            to="/"
                            className="alink"
                        >
                            Home
                        </Nav.Link>


                        <Nav.Link
                            as={Link}
                            to="/projects"
                            className="alink"
                        >
                            Projects
                        </Nav.Link>

                        <Nav.Link
                            as={Link}
                            to="/about"
                            className="alink"
                        >
                            About
                        </Nav.Link>


                        <Nav.Link
                            as={Link}
                            to="/contact"
                            className="alink"
                        >
                            Contact
                        </Nav.Link>

                    </Nav>
                    <div className="credential">

                        {isAuthenticated ? (
                            <div className="nav-user-menu">
                                <Link to="/profile" className="nav-user-profile-btn" title="My Profile & Wishlist">
                                    <span className="nav-user-avatar">
                                        {user?.avatar ? (
                                            <img src={user.avatar} alt={user.name} />
                                        ) : (
                                            user?.name ? user.name.charAt(0).toUpperCase() : "U"
                                        )}
                                    </span>
                                    <span className="nav-user-name">{user?.name?.split(" ")[0] || "Profile"}</span>
                                </Link>

                                {isAdmin && (
                                    <Link
                                        to={isSuperAdmin ? "/super-admin" : "/admin"}
                                        className="nav-admin-link"
                                        title="Admin Dashboard"
                                    >
                                        Dashboard
                                    </Link>
                                )}

                                <button
                                    type="button"
                                    className="nav-logout-btn"
                                    onClick={handleLogout}
                                    title="Logout"
                                >
                                    <LogOut size={15} />
                                    <span>Logout</span>
                                </button>
                            </div>
                        ) : (
                            <Link to="/login" className="auth-link buttons">
                                Login
                                <ArrowRight />
                            </Link>
                        )}

                    </div>

                </Navbar.Collapse>

            </Container>

        </Navbar>

    );

}

export default MainNavbar;