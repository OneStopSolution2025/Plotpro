import projectImage from "../assets/projectimg1.png";
import entrance from "../assets/Projects/Greenvalley/Entrance.png";
import road from "../assets/Projects/Greenvalley/road.png";
import image1 from "../assets/bg-img.png";
import image2 from "../assets/bg-image.jpg";
import image4 from "../assets/bg-image.jpg";

const commonImages = [
    projectImage,
    entrance,
    road,
    image1,
    image2,
    image4
];

const commonApprovals = [
    "DTCP Approved",
    "RERA Compliant"
];

export const commonBenefits = [
    {
        title: "Prime Location",
        description: "Excellent connectivity to major roads and important locations."
    },
    {
        title: "Gated Community",
        description: "Safe and secure community with 24/7 security."
    },
    {
        title: "Wide Roads",
        description: "Well-developed and spacious roads for easy access."
    },
    {
        title: "Green Environment",
        description: "Peaceful surroundings with green and natural environment."
    }
];

export const commonHighlights = [
    "Strategic and well-connected location",
    "Gated community with 24/7 security",
    "Wide blacktop roads",
    "Underground drainage & water supply",
    "Avenue trees and landscaped parks",
    "Ready-to-build plots",
    "High appreciation potential"
];

export const commonAmenities = [
    "24/7 Security",
    "Blacktop Roads",
    "Street Lighting",
    "Underground Drainage",
    "Water Supply",
    "Avenue Trees",
    "Children's Play Area",
    "Landscaped Parks"
];

const createProjectDetails = ({
    benefits,
    about,
    highlights,
    amenities,
    connectivity
}) => ({
    images: commonImages,

    benefits,

    about,

    highlights,

    amenities,

    locationConnectivity: connectivity,

    approvals: commonApprovals
});


export const projects = [

    /* =====================================================
       01 — GREEN VALLEY
    ===================================================== */

    {
        id: 1,
        adminId: "arun",
        image: projectImage,
        title: "Green Valley",
        details:
            "Premium residential plots surrounded by a peaceful green landscape.",
        projectSize: "12 Acres",
        plotPrice: "8.5 Lakh",
        priceLakhs: 8.5,
        location: "Dindigul, Tamil Nadu",
        city: "Dindigul",
        category: "Residential",
        plotType: "Residential",
        budget: "below10",
        plotSizes: "600 – 2400 Sq.ft",
        distance: "2 km to NH",
        status: "Active",

        totalPlots: 120,
        availablePlots: 68,
        reservedPlots: 18,
        soldPlots: 34,

        launchDate: "12 Jun 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Prime Location",
                    description:
                        "Excellent connectivity to major roads and important locations."
                },
                {
                    title: "Gated Community",
                    description:
                        "Safe and secure community with 24/7 security."
                },
                {
                    title: "Wide Roads",
                    description:
                        "Well-developed and spacious roads for easy access."
                },
                {
                    title: "Green Environment",
                    description:
                        "Peaceful surroundings with green and natural environment."
                }
            ],

            about: {
                description:
                    "Green Valley is a premium residential land project designed for peaceful and comfortable living. The project offers well-planned plots, excellent connectivity and essential modern infrastructure.",

                additionalDescription:
                    "Located in a developing area, Green Valley provides an ideal opportunity for both home buyers and property investors."
            },

            highlights: [
                "Strategic and well-connected location",
                "Gated community with 24/7 security",
                "Wide blacktop roads",
                "Underground drainage & water supply",
                "Avenue trees and landscaped parks",
                "Ready-to-build plots",
                "High appreciation potential"
            ],

            amenities: [
                "24/7 Security",
                "Blacktop Roads",
                "Street Lighting",
                "Underground Drainage",
                "Water Supply",
                "Avenue Trees",
                "Children's Play Area",
                "Landscaped Parks"
            ],

            connectivity: [
                {
                    name: "Chennai - Bangalore Highway",
                    distance: "2 km"
                },
                {
                    name: "Dindigul Railway Station",
                    distance: "5 km"
                },
                {
                    name: "Nearest School",
                    distance: "3 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "4 km"
                },
                {
                    name: "Chennai International Airport",
                    distance: "35 km"
                }
            ]
        })
    },


    /* =====================================================
       02 — SUNRISE ENCLAVE
    ===================================================== */

    {
        id: 2,
        adminId: "karthik",
        image: projectImage,
        title: "Sunrise Enclave",
        details:
            "Well-planned residential plots with convenient access to schools and daily amenities.",
        projectSize: "8 Acres",
        plotPrice: "11.5 Lakh",
        priceLakhs: 11.5,
        location: "Madurai, Tamil Nadu",
        city: "Madurai",
        category: "Residential",
        plotType: "Residential",
        budget: "10-25",
        plotSizes: "800 – 1800 Sq.ft",
        distance: "4 km to City",
        status: "Active",

        totalPlots: 86,
        availablePlots: 42,
        reservedPlots: 17,
        soldPlots: 27,

        launchDate: "28 May 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "City Connectivity",
                    description:
                        "Convenient access to major roads and important city locations."
                },
                {
                    title: "Family Friendly",
                    description:
                        "Planned surroundings suitable for families and future homes."
                },
                {
                    title: "Planned Roads",
                    description:
                        "Well-organized internal roads provide comfortable access."
                },
                {
                    title: "Essential Amenities",
                    description:
                        "Schools, hospitals and everyday facilities are within reach."
                }
            ],

            about: {
                description:
                    "Sunrise Enclave is a thoughtfully planned residential development in Madurai, offering well-sized plots for families looking to build comfortable homes.",

                additionalDescription:
                    "The project combines convenient connectivity with a peaceful residential environment."
            },

            highlights: [
                "Convenient city connectivity",
                "Planned residential layout",
                "Wide internal roads",
                "Street lighting",
                "Water supply",
                "Green open spaces",
                "Ready-to-build plots"
            ],

            amenities: [
                "24/7 Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Avenue Trees",
                "Children's Play Area",
                "Green Spaces",
                "Entrance Arch"
            ],

            connectivity: [
                {
                    name: "Madurai City Centre",
                    distance: "4 km"
                },
                {
                    name: "Madurai Railway Station",
                    distance: "7 km"
                },
                {
                    name: "Nearest School",
                    distance: "2 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "3 km"
                },
                {
                    name: "Madurai Airport",
                    distance: "12 km"
                }
            ]
        })
    },


    /* =====================================================
       03 — LAKE VIEW GARDENS
    ===================================================== */

    {
        id: 3,
        adminId: "priya",
        image: projectImage,
        title: "Lake View Gardens",
        details:
            "Spacious plotted development designed for peaceful family living.",
        projectSize: "15 Acres",
        plotPrice: "24 Lakh",
        priceLakhs: 24,
        location: "Trichy, Tamil Nadu",
        city: "Trichy",
        category: "Residential",
        plotType: "Residential",
        budget: "25-50",
        plotSizes: "1000 – 2400 Sq.ft",
        distance: "3.5 km to NH",
        status: "Active",

        totalPlots: 104,
        availablePlots: 31,
        reservedPlots: 22,
        soldPlots: 51,

        launchDate: "04 Apr 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Peaceful Setting",
                    description:
                        "A calm residential environment designed for comfortable family living."
                },
                {
                    title: "Spacious Plots",
                    description:
                        "Generous plot dimensions provide flexibility for home construction."
                },
                {
                    title: "Green Surroundings",
                    description:
                        "Planned green spaces create a pleasant neighbourhood atmosphere."
                },
                {
                    title: "Good Connectivity",
                    description:
                        "Easy access to major roads and surrounding urban areas."
                }
            ],

            about: {
                description:
                    "Lake View Gardens is a spacious residential plotted development in Trichy, designed around peaceful surroundings and practical community planning.",

                additionalDescription:
                    "The project provides larger plot options for families looking for comfortable homes with room to grow."
            },

            highlights: [
                "Spacious residential plots",
                "Peaceful surroundings",
                "Well-planned internal roads",
                "Landscaped green spaces",
                "Street lighting",
                "Water infrastructure",
                "Family-oriented community"
            ],

            amenities: [
                "24/7 Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Landscaped Parks",
                "Avenue Trees",
                "Children's Play Area",
                "Walking Area"
            ],

            connectivity: [
                {
                    name: "National Highway",
                    distance: "3.5 km"
                },
                {
                    name: "Trichy Railway Station",
                    distance: "8 km"
                },
                {
                    name: "Nearest School",
                    distance: "3 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "4 km"
                },
                {
                    name: "Trichy Airport",
                    distance: "14 km"
                }
            ]
        })
    },


    /* =====================================================
       04 — GREEN MEADOWS
    ===================================================== */

    {
        id: 4,
        adminId: "divya",
        image: projectImage,
        title: "Green Meadows",
        details:
            "Premium plots with wide roads, landscaped surroundings and modern infrastructure.",
        projectSize: "10 Acres",
        plotPrice: "18 Lakh",
        priceLakhs: 18,
        location: "Coimbatore, Tamil Nadu",
        city: "Coimbatore",
        category: "Residential",
        plotType: "Residential",
        budget: "10-25",
        plotSizes: "900 – 2000 Sq.ft",
        distance: "5 km to City",
        status: "Active",

        totalPlots: 72,
        availablePlots: 29,
        reservedPlots: 11,
        soldPlots: 32,

        launchDate: "18 Mar 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Growing Location",
                    description:
                        "Located in a developing residential zone with convenient access."
                },
                {
                    title: "Modern Planning",
                    description:
                        "Thoughtfully planned plots with practical internal infrastructure."
                },
                {
                    title: "Wide Roads",
                    description:
                        "Spacious internal roads provide comfortable vehicle movement."
                },
                {
                    title: "Green Community",
                    description:
                        "Landscaped areas and avenue trees create a pleasant environment."
                }
            ],

            about: {
                description:
                    "Green Meadows brings together practical residential planning, spacious roads and landscaped surroundings for comfortable living in Coimbatore.",

                additionalDescription:
                    "The project is designed for families seeking a balanced residential environment with good connectivity."
            },

            highlights: [
                "Well-connected location",
                "Wide internal roads",
                "Landscaped surroundings",
                "Street lighting",
                "Water supply",
                "Avenue plantation",
                "Ready-to-build plots"
            ],

            amenities: [
                "24/7 Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Avenue Trees",
                "Green Parks",
                "Children's Play Area",
                "Entrance Arch"
            ],

            connectivity: [
                {
                    name: "Coimbatore City",
                    distance: "5 km"
                },
                {
                    name: "Nearest Highway",
                    distance: "4 km"
                },
                {
                    name: "Nearest School",
                    distance: "2.5 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "3 km"
                },
                {
                    name: "Coimbatore Airport",
                    distance: "16 km"
                }
            ]
        })
    },


    /* =====================================================
       05 — METRO BUSINESS PARK
    ===================================================== */

    {
        id: 5,
        adminId: "karthik",
        image: projectImage,
        title: "Metro Business Park",
        details:
            "Commercial plots positioned for shops, offices and future business development.",
        projectSize: "7 Acres",
        plotPrice: "32 Lakh",
        priceLakhs: 32,
        location: "Madurai, Tamil Nadu",
        city: "Madurai",
        category: "Commercial",
        plotType: "Commercial",
        budget: "25-50",
        plotSizes: "1200 – 3000 Sq.ft",
        distance: "2 km to Ring Road",
        status: "Active",

        totalPlots: 58,
        availablePlots: 21,
        reservedPlots: 9,
        soldPlots: 28,

        launchDate: "10 Feb 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Commercial Location",
                    description:
                        "Planned for businesses seeking accessible commercial space."
                },
                {
                    title: "Road Access",
                    description:
                        "Convenient access for customers, employees and commercial traffic."
                },
                {
                    title: "Flexible Plots",
                    description:
                        "Different plot sizes support shops, offices and business spaces."
                },
                {
                    title: "Future Ready",
                    description:
                        "Designed with long-term commercial development in mind."
                }
            ],

            about: {
                description:
                    "Metro Business Park is a commercial plotted development designed for shops, offices and small business establishments in Madurai.",

                additionalDescription:
                    "The project provides commercially oriented plots with practical road access and planned infrastructure."
            },

            highlights: [
                "Commercially planned plots",
                "Good road connectivity",
                "Multiple plot dimensions",
                "Street lighting",
                "Water infrastructure",
                "Organized layout",
                "Business-friendly location"
            ],

            amenities: [
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Drainage",
                "Parking Spaces",
                "Security",
                "Entrance Arch",
                "Commercial Access"
            ],

            connectivity: [
                {
                    name: "Madurai Ring Road",
                    distance: "2 km"
                },
                {
                    name: "Madurai City Centre",
                    distance: "6 km"
                },
                {
                    name: "Main Bus Stand",
                    distance: "7 km"
                },
                {
                    name: "Railway Station",
                    distance: "8 km"
                },
                {
                    name: "Madurai Airport",
                    distance: "11 km"
                }
            ]
        })
    },


    /* =====================================================
       06 — ROYAL VILLA ENCLAVE
    ===================================================== */

    {
        id: 6,
        adminId: "arun",
        image: projectImage,
        title: "Royal Villa Enclave",
        details:
            "Large villa plots created for spacious independent homes and premium residences.",
        projectSize: "18 Acres",
        plotPrice: "42 Lakh",
        priceLakhs: 42,
        location: "Dindigul, Tamil Nadu",
        city: "Dindigul",
        category: "Residential",
        plotType: "Residential",
        budget: "25-50",
        plotSizes: "1500 – 3600 Sq.ft",
        distance: "3 km to NH",
        status: "Active",

        totalPlots: 64,
        availablePlots: 24,
        reservedPlots: 12,
        soldPlots: 28,

        launchDate: "22 Jan 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Large Plot Sizes",
                    description:
                        "Generous dimensions provide space for independent villa designs."
                },
                {
                    title: "Premium Layout",
                    description:
                        "A spacious layout designed for comfortable premium residences."
                },
                {
                    title: "Private Living",
                    description:
                        "Designed for families looking for independent homes and privacy."
                },
                {
                    title: "Natural Surroundings",
                    description:
                        "Open spaces and greenery create a relaxed residential setting."
                }
            ],

            about: {
                description:
                    "Royal Villa Enclave is a premium villa plot development in Dindigul offering larger plots for spacious independent residences.",

                additionalDescription:
                    "The layout focuses on privacy, accessibility and a comfortable premium residential experience."
            },

            highlights: [
                "Large villa plot dimensions",
                "Premium residential layout",
                "Wide roads",
                "Gated entrance",
                "Green open spaces",
                "Street lighting",
                "Ready-to-build plots"
            ],

            amenities: [
                "24/7 Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Landscaped Parks",
                "Avenue Trees",
                "Children's Play Area",
                "Gated Entrance"
            ],

            connectivity: [
                {
                    name: "National Highway",
                    distance: "3 km"
                },
                {
                    name: "Dindigul Railway Station",
                    distance: "6 km"
                },
                {
                    name: "Nearest School",
                    distance: "3 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "4 km"
                },
                {
                    name: "Madurai Airport",
                    distance: "65 km"
                }
            ]
        })
    },


    /* =====================================================
       07 — GREEN HORIZON
    ===================================================== */

    {
        id: 7,
        adminId: "priya",
        image: projectImage,
        title: "Green Horizon",
        details:
            "Affordable residential plots with essential infrastructure and good road connectivity.",
        projectSize: "6 Acres",
        plotPrice: "9.2 Lakh",
        priceLakhs: 9.2,
        location: "Trichy, Tamil Nadu",
        city: "Trichy",
        category: "Residential",
        plotType: "Residential",
        budget: "below10",
        plotSizes: "700 – 1600 Sq.ft",
        distance: "6 km to City",
        status: "Completed",

        totalPlots: 110,
        availablePlots: 0,
        reservedPlots: 10,
        soldPlots: 100,

        launchDate: "08 Jan 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Affordable Plots",
                    description:
                        "Practical plot sizes designed for budget-conscious buyers."
                },
                {
                    title: "Easy Connectivity",
                    description:
                        "Good access to surrounding roads and important locations."
                },
                {
                    title: "Planned Layout",
                    description:
                        "Organized plots with clearly planned internal roads."
                },
                {
                    title: "Peaceful Setting",
                    description:
                        "A calm residential environment away from busy city streets."
                }
            ],

            about: {
                description:
                    "Green Horizon is an affordable residential plotted development in Trichy designed for practical home building.",

                additionalDescription:
                    "The project combines accessible pricing with essential infrastructure and a peaceful neighbourhood setting."
            },

            highlights: [
                "Affordable residential plots",
                "Good road connectivity",
                "Planned internal roads",
                "Street lighting",
                "Water supply",
                "Green spaces",
                "Ready-to-build plots"
            ],

            amenities: [
                "Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Avenue Trees",
                "Green Spaces",
                "Children's Area",
                "Entrance Gate"
            ],

            connectivity: [
                {
                    name: "Trichy City",
                    distance: "6 km"
                },
                {
                    name: "National Highway",
                    distance: "5 km"
                },
                {
                    name: "Nearest School",
                    distance: "2 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "4 km"
                },
                {
                    name: "Trichy Airport",
                    distance: "15 km"
                }
            ]
        })
    },


    /* =====================================================
       08 — CENTRAL TRADE ESTATE
    ===================================================== */

    {
        id: 8,
        adminId: "divya",
        image: projectImage,
        title: "Central Trade Estate",
        details:
            "Strategically planned commercial plots suitable for retail and office development.",
        projectSize: "9 Acres",
        plotPrice: "46 Lakh",
        priceLakhs: 46,
        location: "Coimbatore, Tamil Nadu",
        city: "Coimbatore",
        category: "Commercial",
        plotType: "Commercial",
        budget: "25-50",
        plotSizes: "1400 – 3200 Sq.ft",
        distance: "2.8 km to Bypass",
        status: "Active",

        totalPlots: 46,
        availablePlots: 18,
        reservedPlots: 7,
        soldPlots: 21,

        launchDate: "15 Dec 2025",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Strategic Access",
                    description:
                        "Commercial plots positioned with convenient road connectivity."
                },
                {
                    title: "Business Focus",
                    description:
                        "Suitable for retail, office and service-oriented development."
                },
                {
                    title: "Spacious Plots",
                    description:
                        "Larger plot options provide flexibility for business layouts."
                },
                {
                    title: "Organized Infrastructure",
                    description:
                        "Planned roads, lighting and utilities support commercial use."
                }
            ],

            about: {
                description:
                    "Central Trade Estate is a commercial development in Coimbatore designed for businesses seeking spacious and accessible plots.",

                additionalDescription:
                    "The project focuses on practical commercial planning with good connectivity and supporting infrastructure."
            },

            highlights: [
                "Commercial development",
                "Strategic road access",
                "Spacious plot options",
                "Planned infrastructure",
                "Street lighting",
                "Water supply",
                "Organized layout"
            ],

            amenities: [
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Drainage",
                "Security",
                "Parking Area",
                "Commercial Access",
                "Entrance Gate"
            ],

            connectivity: [
                {
                    name: "Coimbatore Bypass",
                    distance: "2.8 km"
                },
                {
                    name: "Coimbatore City",
                    distance: "7 km"
                },
                {
                    name: "Nearest Bus Stand",
                    distance: "5 km"
                },
                {
                    name: "Railway Station",
                    distance: "8 km"
                },
                {
                    name: "Coimbatore Airport",
                    distance: "15 km"
                }
            ]
        })
    },


    /* =====================================================
       09 — PALM GROVE
    ===================================================== */

    {
        id: 9,
        adminId: "arun",
        image: projectImage,
        title: "Palm Grove",
        details:
            "Quiet residential plots surrounded by open spaces and established neighbourhoods.",
        projectSize: "11 Acres",
        plotPrice: "7.8 Lakh",
        priceLakhs: 7.8,
        location: "Dindigul, Tamil Nadu",
        city: "Dindigul",
        category: "Residential",
        plotType: "Residential",
        budget: "below10",
        plotSizes: "600 – 1800 Sq.ft",
        distance: "4.2 km to NH",
        status: "Active",

        totalPlots: 112,
        availablePlots: 57,
        reservedPlots: 15,
        soldPlots: 40,

        launchDate: "02 Dec 2025",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Quiet Community",
                    description:
                        "A peaceful residential environment surrounded by open spaces."
                },
                {
                    title: "Accessible Pricing",
                    description:
                        "Multiple plot sizes offer flexible options for buyers."
                },
                {
                    title: "Good Connectivity",
                    description:
                        "Convenient access to highways and nearby neighbourhoods."
                },
                {
                    title: "Green Surroundings",
                    description:
                        "Open areas and greenery provide a relaxed atmosphere."
                }
            ],

            about: {
                description:
                    "Palm Grove is a residential plotted development in Dindigul focused on peaceful living, practical planning and accessible plot options.",

                additionalDescription:
                    "The project offers a balanced combination of open surroundings and convenient connectivity."
            },

            highlights: [
                "Peaceful residential setting",
                "Affordable plot options",
                "Good road connectivity",
                "Open green spaces",
                "Street lighting",
                "Water supply",
                "Ready-to-build plots"
            ],

            amenities: [
                "Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Avenue Trees",
                "Green Parks",
                "Children's Play Area",
                "Gated Entrance"
            ],

            connectivity: [
                {
                    name: "National Highway",
                    distance: "4.2 km"
                },
                {
                    name: "Dindigul Railway Station",
                    distance: "6 km"
                },
                {
                    name: "Nearest School",
                    distance: "2.5 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "4 km"
                },
                {
                    name: "City Centre",
                    distance: "5 km"
                }
            ]
        })
    },


    /* =====================================================
       10 — EMERALD VILLAS
    ===================================================== */

    {
        id: 10,
        adminId: "karthik",
        image: projectImage,
        title: "Emerald Villas",
        details:
            "Premium villa plots with generous dimensions and a carefully planned road network.",
        projectSize: "14 Acres",
        plotPrice: "22 Lakh",
        priceLakhs: 22,
        location: "Madurai, Tamil Nadu",
        city: "Madurai",
        category: "Residential",
        plotType: "Residential",
        budget: "10-25",
        plotSizes: "1200 – 2800 Sq.ft",
        distance: "3.7 km to Airport Road",
        status: "Active",

        totalPlots: 92,
        availablePlots: 36,
        reservedPlots: 14,
        soldPlots: 42,

        launchDate: "18 Nov 2025",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Villa Living",
                    description:
                        "Large plots designed for independent villa-style homes."
                },
                {
                    title: "Premium Layout",
                    description:
                        "Carefully planned roads and plot dimensions support comfortable living."
                },
                {
                    title: "Airport Connectivity",
                    description:
                        "Convenient access to the airport road and surrounding locations."
                },
                {
                    title: "Green Spaces",
                    description:
                        "Planned landscape areas create a pleasant neighbourhood."
                }
            ],

            about: {
                description:
                    "Emerald Villas is a premium villa plot project in Madurai offering spacious plots for independent residences.",

                additionalDescription:
                    "The project is planned for families seeking larger homes with practical connectivity."
            },

            highlights: [
                "Premium villa plots",
                "Spacious dimensions",
                "Planned road network",
                "Green landscaped areas",
                "Street lighting",
                "Water supply",
                "Gated community"
            ],

            amenities: [
                "24/7 Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Landscaped Parks",
                "Avenue Trees",
                "Children's Play Area",
                "Gated Entrance"
            ],

            connectivity: [
                {
                    name: "Airport Road",
                    distance: "3.7 km"
                },
                {
                    name: "Madurai Airport",
                    distance: "9 km"
                },
                {
                    name: "Nearest School",
                    distance: "3 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "4 km"
                },
                {
                    name: "Madurai City",
                    distance: "7 km"
                }
            ]
        })
    },


    /* =====================================================
       11 — RIVERFRONT RESIDENCY
    ===================================================== */

    {
        id: 11,
        adminId: "priya",
        image: projectImage,
        title: "Riverfront Residency",
        details:
            "Thoughtfully planned residential development with spacious plots and natural surroundings.",
        projectSize: "20 Acres",
        plotPrice: "38 Lakh",
        priceLakhs: 38,
        location: "Trichy, Tamil Nadu",
        city: "Trichy",
        category: "Residential",
        plotType: "Residential",
        budget: "25-50",
        plotSizes: "1000 – 3000 Sq.ft",
        distance: "2.5 km to Main Road",
        status: "Active",

        totalPlots: 138,
        availablePlots: 52,
        reservedPlots: 20,
        soldPlots: 66,

        launchDate: "06 Nov 2025",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Natural Setting",
                    description:
                        "Designed around open surroundings and a peaceful residential atmosphere."
                },
                {
                    title: "Large Development",
                    description:
                        "A spacious community offering multiple plot dimensions."
                },
                {
                    title: "Planned Infrastructure",
                    description:
                        "Internal roads and essential utilities are planned for convenience."
                },
                {
                    title: "Family Community",
                    description:
                        "Suitable for families seeking spacious residential plots."
                }
            ],

            about: {
                description:
                    "Riverfront Residency is a large residential development in Trichy offering spacious plots within a thoughtfully planned community.",

                additionalDescription:
                    "The project focuses on comfortable residential planning with natural surroundings and essential infrastructure."
            },

            highlights: [
                "Large residential development",
                "Spacious plots",
                "Natural surroundings",
                "Wide internal roads",
                "Green spaces",
                "Water infrastructure",
                "Security"
            ],

            amenities: [
                "24/7 Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Avenue Trees",
                "Landscaped Parks",
                "Children's Play Area",
                "Walking Area"
            ],

            connectivity: [
                {
                    name: "Main Road",
                    distance: "2.5 km"
                },
                {
                    name: "Trichy City",
                    distance: "7 km"
                },
                {
                    name: "Nearest School",
                    distance: "3 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "4 km"
                },
                {
                    name: "Trichy Airport",
                    distance: "13 km"
                }
            ]
        })
    },


    /* =====================================================
       12 — URBAN SQUARE
    ===================================================== */

    {
        id: 12,
        adminId: "divya",
        image: projectImage,
        title: "Urban Square",
        details:
            "Commercial development offering well-sized plots for growing businesses and investments.",
        projectSize: "5 Acres",
        plotPrice: "14.5 Lakh",
        priceLakhs: 14.5,
        location: "Coimbatore, Tamil Nadu",
        city: "Coimbatore",
        category: "Commercial",
        plotType: "Commercial",
        budget: "10-25",
        plotSizes: "800 – 2200 Sq.ft",
        distance: "3 km to NH",
        status: "Completed",

        totalPlots: 135,
        availablePlots: 0,
        reservedPlots: 0,
        soldPlots: 135,

        launchDate: "24 Oct 2025",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Urban Location",
                    description:
                        "Commercial plots planned for businesses close to urban activity."
                },
                {
                    title: "Flexible Sizes",
                    description:
                        "Multiple plot dimensions support different business requirements."
                },
                {
                    title: "Road Connectivity",
                    description:
                        "Convenient access to highways and surrounding commercial areas."
                },
                {
                    title: "Planned Infrastructure",
                    description:
                        "Essential infrastructure is integrated into the development."
                }
            ],

            about: {
                description:
                    "Urban Square is a compact commercial plotted development in Coimbatore designed for growing businesses and practical commercial use.",

                additionalDescription:
                    "The project provides flexible plot sizes with convenient road connectivity."
            },

            highlights: [
                "Commercial plot development",
                "Urban connectivity",
                "Flexible plot sizes",
                "Planned internal roads",
                "Street lighting",
                "Water supply",
                "Security"
            ],

            amenities: [
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Drainage",
                "Security",
                "Parking Area",
                "Commercial Access",
                "Entrance Gate"
            ],

            connectivity: [
                {
                    name: "National Highway",
                    distance: "3 km"
                },
                {
                    name: "Coimbatore City",
                    distance: "5 km"
                },
                {
                    name: "Nearest Bus Stand",
                    distance: "4 km"
                },
                {
                    name: "Railway Station",
                    distance: "6 km"
                },
                {
                    name: "Coimbatore Airport",
                    distance: "12 km"
                }
            ]
        })
    },


    /* =====================================================
       13 — HILL VIEW ESTATE
    ===================================================== */

    {
        id: 13,
        adminId: "arun",
        image: projectImage,
        title: "Hill View Estate",
        details:
            "Premium residential plots planned for peaceful living with open surroundings.",
        projectSize: "13 Acres",
        plotPrice: "16.5 Lakh",
        priceLakhs: 16.5,
        location: "Palani, Tamil Nadu",
        city: "Palani",
        category: "Residential",
        plotType: "Residential",
        budget: "10-25",
        plotSizes: "800 – 2200 Sq.ft",
        distance: "3 km to City",
        status: "Active",

        totalPlots: 96,
        availablePlots: 48,
        reservedPlots: 15,
        soldPlots: 33,

        launchDate: "12 Sep 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Peaceful Location",
                    description:
                        "A calm residential setting surrounded by open spaces."
                },
                {
                    title: "Scenic Surroundings",
                    description:
                        "Open views and greenery create a pleasant living environment."
                },
                {
                    title: "Planned Roads",
                    description:
                        "Wide internal roads provide comfortable access throughout the layout."
                },
                {
                    title: "Family Friendly",
                    description:
                        "Designed for families looking for practical residential plots."
                }
            ],

            about: {
                description:
                    "Hill View Estate is a residential plotted development in Palani designed around peaceful surroundings and practical community planning.",

                additionalDescription:
                    "The project offers a selection of plot sizes suitable for independent homes."
            },

            highlights: [
                "Peaceful residential location",
                "Open surroundings",
                "Wide roads",
                "Green spaces",
                "Street lighting",
                "Water supply",
                "Ready-to-build plots"
            ],

            amenities: [
                "24/7 Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Avenue Trees",
                "Green Parks",
                "Children's Play Area",
                "Gated Entrance"
            ],

            connectivity: [
                {
                    name: "Palani City",
                    distance: "3 km"
                },
                {
                    name: "Nearest Highway",
                    distance: "4 km"
                },
                {
                    name: "Nearest School",
                    distance: "2 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "3 km"
                },
                {
                    name: "Railway Station",
                    distance: "5 km"
                }
            ]
        })
    },


    /* =====================================================
       14 — ROYAL GREENS
    ===================================================== */

    {
        id: 14,
        adminId: "priya",
        image: projectImage,
        title: "Royal Greens",
        details:
            "Modern residential plots with landscaped surroundings and convenient city access.",
        projectSize: "16 Acres",
        plotPrice: "19 Lakh",
        priceLakhs: 19,
        location: "Thanjavur, Tamil Nadu",
        city: "Thanjavur",
        category: "Residential",
        plotType: "Residential",
        budget: "10-25",
        plotSizes: "900 – 2400 Sq.ft",
        distance: "4 km to City",
        status: "Active",

        totalPlots: 108,
        availablePlots: 55,
        reservedPlots: 18,
        soldPlots: 35,

        launchDate: "25 Aug 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Prime Access",
                    description:
                        "Convenient access to city roads and important daily destinations."
                },
                {
                    title: "Modern Layout",
                    description:
                        "Organized residential planning with practical plot dimensions."
                },
                {
                    title: "Green Spaces",
                    description:
                        "Landscaped areas add greenery and openness to the community."
                },
                {
                    title: "Secure Community",
                    description:
                        "Planned security and controlled entry provide added peace of mind."
                }
            ],

            about: {
                description:
                    "Royal Greens is a modern residential plotted development in Thanjavur with landscaped surroundings and practical community infrastructure.",

                additionalDescription:
                    "The project is designed for families looking for comfortable homes in a well-planned layout."
            },

            highlights: [
                "Modern residential layout",
                "Wide internal roads",
                "Landscaped green spaces",
                "Security",
                "Street lighting",
                "Water supply",
                "Ready-to-build plots"
            ],

            amenities: [
                "24/7 Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Landscaped Parks",
                "Avenue Trees",
                "Children's Play Area",
                "Gated Entrance"
            ],

            connectivity: [
                {
                    name: "Thanjavur City",
                    distance: "4 km"
                },
                {
                    name: "Main Highway",
                    distance: "3 km"
                },
                {
                    name: "Nearest School",
                    distance: "2 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "3 km"
                },
                {
                    name: "Railway Station",
                    distance: "5 km"
                }
            ]
        })
    },


    /* =====================================================
       15 — SALEM HEIGHTS
    ===================================================== */

    {
        id: 15,
        adminId: "karthik",
        image: projectImage,
        title: "Salem Heights",
        details:
            "Well-connected residential plots designed for modern family homes.",
        projectSize: "10 Acres",
        plotPrice: "13.8 Lakh",
        priceLakhs: 13.8,
        location: "Salem, Tamil Nadu",
        city: "Salem",
        category: "Residential",
        plotType: "Residential",
        budget: "10-25",
        plotSizes: "700 – 2000 Sq.ft",
        distance: "3 km to NH",
        status: "Active",

        totalPlots: 84,
        availablePlots: 39,
        reservedPlots: 16,
        soldPlots: 29,

        launchDate: "18 Aug 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Highway Connectivity",
                    description:
                        "Convenient access to major roads and surrounding destinations."
                },
                {
                    title: "Practical Plot Sizes",
                    description:
                        "Multiple plot options suit different home planning requirements."
                },
                {
                    title: "Planned Infrastructure",
                    description:
                        "Essential infrastructure is planned throughout the development."
                },
                {
                    title: "Residential Comfort",
                    description:
                        "Designed for comfortable family living in a structured community."
                }
            ],

            about: {
                description:
                    "Salem Heights is a residential plotted project designed for modern family homes with practical connectivity and infrastructure.",

                additionalDescription:
                    "The project offers flexible plot sizes within a planned residential environment."
            },

            highlights: [
                "Good highway connectivity",
                "Flexible plot sizes",
                "Wide internal roads",
                "Street lighting",
                "Water supply",
                "Green spaces",
                "Secure entrance"
            ],

            amenities: [
                "Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Avenue Trees",
                "Green Spaces",
                "Children's Play Area",
                "Gated Entrance"
            ],

            connectivity: [
                {
                    name: "National Highway",
                    distance: "3 km"
                },
                {
                    name: "Salem City",
                    distance: "5 km"
                },
                {
                    name: "Nearest School",
                    distance: "2 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "3 km"
                },
                {
                    name: "Salem Railway Station",
                    distance: "6 km"
                }
            ]
        })
    },


    /* =====================================================
       16 — GRAND ORCHARD
    ===================================================== */

    {
        id: 16,
        adminId: "divya",
        image: projectImage,
        title: "Grand Orchard",
        details:
            "Spacious residential plots surrounded by landscaped green spaces and planned amenities.",
        projectSize: "17 Acres",
        plotPrice: "21.5 Lakh",
        priceLakhs: 21.5,
        location: "Karur, Tamil Nadu",
        city: "Karur",
        category: "Residential",
        plotType: "Residential",
        budget: "10-25",
        plotSizes: "1000 – 2600 Sq.ft",
        distance: "3.5 km to City",
        status: "Active",

        totalPlots: 116,
        availablePlots: 61,
        reservedPlots: 19,
        soldPlots: 36,

        launchDate: "10 Aug 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Spacious Planning",
                    description:
                        "Larger development area allows comfortable plot planning and open spaces."
                },
                {
                    title: "Green Environment",
                    description:
                        "Landscaped areas and avenue trees create a refreshing setting."
                },
                {
                    title: "Family Community",
                    description:
                        "Designed around practical family living and future homes."
                },
                {
                    title: "Easy Access",
                    description:
                        "Good connectivity to city roads and everyday facilities."
                }
            ],

            about: {
                description:
                    "Grand Orchard is a spacious residential development in Karur designed with green spaces, practical roads and family-oriented planning.",

                additionalDescription:
                    "The project offers larger plot options for buyers planning comfortable independent homes."
            },

            highlights: [
                "Spacious residential layout",
                "Green landscaped areas",
                "Wide roads",
                "Water supply",
                "Street lighting",
                "Children's area",
                "Security"
            ],

            amenities: [
                "24/7 Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Avenue Trees",
                "Landscaped Parks",
                "Children's Play Area",
                "Walking Area"
            ],

            connectivity: [
                {
                    name: "Karur City",
                    distance: "3.5 km"
                },
                {
                    name: "Main Road",
                    distance: "2 km"
                },
                {
                    name: "Nearest School",
                    distance: "2.5 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "3 km"
                },
                {
                    name: "Railway Station",
                    distance: "5 km"
                }
            ]
        })
    },


    /* =====================================================
       17 — SILVER OAKS
    ===================================================== */

    {
        id: 17,
        adminId: "divya",
        image: projectImage,
        title: "Silver Oaks",
        details:
            "Premium villa plots planned for spacious independent residences and long-term family living.",
        projectSize: "19 Acres",
        plotPrice: "34 Lakh",
        priceLakhs: 34,
        location: "Tiruppur, Tamil Nadu",
        city: "Tiruppur",
        category: "Residential",
        plotType: "Residential",
        budget: "25-50",
        plotSizes: "1400 – 3400 Sq.ft",
        distance: "4 km to City",
        status: "Active",

        totalPlots: 74,
        availablePlots: 30,
        reservedPlots: 13,
        soldPlots: 31,

        launchDate: "05 Aug 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Premium Plots",
                    description:
                        "Generous plot dimensions support spacious independent villa designs."
                },
                {
                    title: "Wide Roads",
                    description:
                        "Broad internal roads improve access and movement within the community."
                },
                {
                    title: "Private Living",
                    description:
                        "Planned for families seeking independent and spacious residences."
                },
                {
                    title: "Green Layout",
                    description:
                        "Landscape areas and avenue trees add a natural character to the project."
                }
            ],

            about: {
                description:
                    "Silver Oaks is a premium villa plot development in Tiruppur offering larger plots for independent family residences.",

                additionalDescription:
                    "The project combines spacious planning with practical road connectivity and green surroundings."
            },

            highlights: [
                "Premium villa plots",
                "Large dimensions",
                "Wide internal roads",
                "Landscaped spaces",
                "Security",
                "Street lighting",
                "Water infrastructure"
            ],

            amenities: [
                "24/7 Security",
                "Blacktop Roads",
                "Street Lighting",
                "Water Supply",
                "Landscaped Parks",
                "Avenue Trees",
                "Children's Play Area",
                "Gated Entrance"
            ],

            connectivity: [
                {
                    name: "Tiruppur City",
                    distance: "4 km"
                },
                {
                    name: "Main Highway",
                    distance: "5 km"
                },
                {
                    name: "Nearest School",
                    distance: "3 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "4 km"
                },
                {
                    name: "Railway Station",
                    distance: "6 km"
                }
            ]
        })
    },


    /* =====================================================
       18 — LAKEWOOD RESIDENCY
    ===================================================== */

    {
        id: 18,
        adminId: "divya",
        image: projectImage,
        title: "Lakewood Residency",
        details:
            "Premium residential plots planned around open green spaces and comfortable community living.",
        projectSize: "21 Acres",
        plotPrice: "27.5 Lakh",
        priceLakhs: 27.5,
        location: "Erode, Tamil Nadu",
        city: "Erode",
        category: "Residential",
        plotType: "Residential",
        budget: "25-50",
        plotSizes: "1000 – 2800 Sq.ft",
        distance: "3 km to NH",
        status: "Active",

        totalPlots: 126,
        availablePlots: 64,
        reservedPlots: 21,
        soldPlots: 41,

        launchDate: "28 Jul 2026",

        ...createProjectDetails({
            benefits: [
                {
                    title: "Large Community",
                    description:
                        "A spacious development with multiple plot options for different family needs."
                },
                {
                    title: "Green Surroundings",
                    description:
                        "Open landscaped areas create a pleasant residential atmosphere."
                },
                {
                    title: "Road Connectivity",
                    description:
                        "Convenient access to major roads and nearby city destinations."
                },
                {
                    title: "Complete Planning",
                    description:
                        "Roads, lighting, water and community spaces are planned together."
                }
            ],

            about: {
                description:
                    "Lakewood Residency is a premium residential plotted development in Erode designed for comfortable community living.",

                additionalDescription:
                    "The larger development provides flexible plot choices with planned infrastructure and green spaces."
            },

            highlights: [
                "Large residential development",
                "Premium plot options",
                "Wide internal roads",
                "Landscaped parks",
                "Street lighting",
                "Water supply",
                "Family-oriented community"
            ],

            amenities: [
                "24/7 Security",
                "Blacktop Roads",
                "Street Lighting",
                "Underground Drainage",
                "Water Supply",
                "Avenue Trees",
                "Children's Play Area",
                "Landscaped Parks"
            ],

            connectivity: [
                {
                    name: "National Highway",
                    distance: "3 km"
                },
                {
                    name: "Erode City",
                    distance: "5 km"
                },
                {
                    name: "Nearest School",
                    distance: "2 km"
                },
                {
                    name: "Nearest Hospital",
                    distance: "3 km"
                },
                {
                    name: "Railway Station",
                    distance: "6 km"
                }
            ]
        })
    }
];