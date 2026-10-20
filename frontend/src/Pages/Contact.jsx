import { useState } from "react";
import "../css/Contact.css";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { ArrowRight } from "lucide-react";
import { publicApi } from "../services/api";


const INFO = [
    {
        icon: "mail",
        label: "Support email",
        value: "dreamcitysupport@example.com",
        action: "Email Us",
        href: "mailto:support@example.com",
    },
    {
        icon: "phone",
        label: "Phone number",
        value: "+11111 11111",
        action: "Call Us",
        href: "tel:+11111 11111",
    },
    {
        icon: "pin",
        label: "Location",
        value:
            "Dindigul, Tamil nadu",
        action: "Visit Us",
        href:
            "https://maps.app.goo.gl/hgsZhpfWQWSGnv3N8",
    },
];

function Icon({
    name,
    size = 20,
    sw = 1.6,
}) {

    const icons = {

        mail: (
            <>
                <rect
                    x="2.6"
                    y="4.8"
                    width="18.8"
                    height="14.4"
                    rx="3"
                />

                <path
                    d="m3.6 7.4 8.4 5.9 8.4-5.9"
                />
            </>
        ),

        phone: (
            <path
                d="M15.6 21A12.6 12.6 0 0 1 3 8.4
                3.4 3.4 0 0 1 6.4 5h1.3
                a1.5 1.5 0 0 1 1.5 1.2l.5 2.3
                a1.5 1.5 0 0 1-.6 1.5l-1.1.8
                a10 10 0 0 0 4.1 4.1l.8-1.1
                a1.5 1.5 0 0 1 1.5-.6l2.3.5
                A1.5 1.5 0 0 1 18.9 16v1.6
                A3.4 3.4 0 0 1 15.6 21Z"
            />
        ),

        pin: (
            <>
                <path
                    d="M12 21s7-5.5 7-11
                    a7 7 0 1 0-14 0c0 5.5
                    7 11 7 11Z"
                />

                <circle
                    cx="12"
                    cy="10"
                    r="2.6"
                />
            </>
        ),

        arrow: (
            <>
                <path
                    d="M7.5 16.5 16.5 7.5"
                />

                <path
                    d="M8.8 7.5h7.7v7.7"
                />
            </>
        ),

    }[name];


    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {icons}
        </svg>
    );
}


/* =========================================================
   CONTACT PAGE
========================================================= */

export default function Contact() {
    const [form, setForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        mobile: "",
        message: "",
    });

    const [errors, setErrors] = useState({});
    const [status, setStatus] = useState(null);

    /* =====================================================
       INPUT CHANGE
    ===================================================== */

    const updateForm = (key) => (event) => {
        const value = event.target.value;

        setForm((current) => ({
            ...current,
            [key]: value,
        }));

        setErrors((current) => ({
            ...current,
            [key]: undefined,
        }));
    };

    const validate = () => {
        const errors = {};

        if (!form.firstName.trim()) {
            errors.firstName = "First name required";
        }

        if (!form.lastName.trim()) {
            errors.lastName = "Last name required";
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
            errors.email = "Enter a valid email";
        }

        if (!form.mobile.trim()) {
            errors.mobile = "Mobile number required";
        } else if (!/^[0-9+\s\-()]{7,15}$/.test(form.mobile.trim())) {
            errors.mobile = "Enter a valid mobile number";
        }

        if (form.message.trim().length < 10) {
            errors.message = "Minimum 10 characters";
        }

        return errors;
    };

    /* =====================================================
       SUBMIT
    ===================================================== */

    const submit = async (event) => {
        event.preventDefault();

        const validationErrors = validate();
        setErrors(validationErrors);

        if (Object.keys(validationErrors).length) {
            return;
        }

        setStatus("sending");

        try {
            await publicApi.submitEnquiry({
                fullName: `${form.firstName} ${form.lastName}`.trim(),
                email: form.email.trim(),
                mobile: form.mobile.trim(),
                contactMethod: "email",
                message: form.message.trim(),
                projectId: null,
                plot: "",
            });

            setStatus("ok");

            setForm({
                firstName: "",
                lastName: "",
                email: "",
                mobile: "",
                message: "",
            });
        } catch {
            setStatus("error");
        }
    };



    return (
        <main className="contact">

            <Navbar />


            <div className="contact-wrap">

                <div className="info-cards">

                    {INFO.map((item) => (

                        <article
                            className="info-card"
                            key={item.label}
                        >

                            <span className="info-icon">

                                <Icon
                                    name={item.icon}
                                    size={30}
                                />

                            </span>


                            <h3 className="info-title">
                                {item.label}
                            </h3>


                            <p className="info-value">
                                {item.value}
                            </p>


                            <a
                                className="lime-button"
                                href={item.href}
                            >
                                {item.action}<ArrowRight />
                            </a>

                        </article>

                    ))}

                </div>


                <div className="contact-content">

                    <div className="form-area">

                        <h2 className="contact-title">
                            Leave a <span>message</span>
                        </h2>


                        <form
                            className="contact-form"
                            onSubmit={submit}
                            noValidate
                        >

                            <div className="name-row">

                                <div className="field">

                                    <input
                                        className={
                                            "input" +
                                            (
                                                errors.firstName
                                                    ? " error"
                                                    : ""
                                            )
                                        }
                                        placeholder="First Name*"
                                        value={
                                            form.firstName
                                        }
                                        onChange={
                                            updateForm(
                                                "firstName"
                                            )
                                        }
                                    />


                                    {errors.firstName && (
                                        <span className="error-text">
                                            {errors.firstName}
                                        </span>
                                    )}

                                </div>


                                <div className="field">

                                    <input
                                        className={
                                            "input" +
                                            (
                                                errors.lastName
                                                    ? " error"
                                                    : ""
                                            )
                                        }
                                        placeholder="Last Name*"
                                        value={
                                            form.lastName
                                        }
                                        onChange={
                                            updateForm(
                                                "lastName"
                                            )
                                        }
                                    />


                                    {errors.lastName && (
                                        <span className="error-text">
                                            {errors.lastName}
                                        </span>
                                    )}

                                </div>

                            </div>


                            {/* Email */}

                            <div className="field">

                                <input
                                    className={
                                        "input" +
                                        (
                                            errors.email
                                                ? " error"
                                                : ""
                                        )
                                    }
                                    placeholder="Email*"
                                    type="email"
                                    value={
                                        form.email
                                    }
                                    onChange={
                                        updateForm(
                                            "email"
                                        )
                                    }
                                />


                                {errors.email && (
                                    <span className="error-text">
                                        {errors.email}
                                    </span>
                                )}

                            </div>


                            {/* Mobile */}

                            <div className="field">

                                <input
                                    className={
                                        "input" +
                                        (
                                            errors.mobile
                                                ? " error"
                                                : ""
                                        )
                                    }
                                    placeholder="Mobile Number*"
                                    type="tel"
                                    value={
                                        form.mobile
                                    }
                                    onChange={
                                        updateForm(
                                            "mobile"
                                        )
                                    }
                                />


                                {errors.mobile && (
                                    <span className="error-text">
                                        {errors.mobile}
                                    </span>
                                )}

                            </div>


                            {/* Message */}

                            <div className="field">

                                <textarea
                                    className={
                                        "input" +
                                        (
                                            errors.message
                                                ? " error"
                                                : ""
                                        )
                                    }
                                    placeholder="Message*"
                                    rows={5}
                                    value={
                                        form.message
                                    }
                                    onChange={
                                        updateForm(
                                            "message"
                                        )
                                    }
                                />


                                {errors.message && (
                                    <span className="error-text">
                                        {errors.message}
                                    </span>
                                )}

                            </div>


                            {/* Submit */}

                            <div className="submit-row">

                                <button
                                    className="submit"
                                    type="submit"
                                    disabled={
                                        status ===
                                        "sending"
                                    }
                                >

                                    <span>
                                        {
                                            status ===
                                                "sending"
                                                ? "Sending..."
                                                : "Submit"
                                        }
                                    </span>


                                    <span className="submit-icon">

                                        <Icon
                                            name="arrow"
                                            size={16}
                                            sw={2.2}
                                        />

                                    </span>

                                </button>


                                {status === "ok" && (

                                    <span className="status success">
                                        Thanks! We'll get back
                                        to you shortly.
                                    </span>

                                )}


                                {status === "error" && (

                                    <span className="status failed">
                                        Something went wrong.
                                        Please try again.
                                    </span>

                                )}

                            </div>

                        </form>

                    </div>

                </div>

            </div>


            <Footer />

        </main>
    );
}