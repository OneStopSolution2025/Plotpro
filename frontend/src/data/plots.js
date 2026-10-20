import plotimg from "../assets/plot.png";
import entrance from "../assets/Projects/Greenvalley/Entrance.png";
import roadImage from "../assets/Projects/Greenvalley/road.png";
import image1 from "../assets/bg-img.png";
import image2 from "../assets/bg-image.jpg";

const commonImages = [
    plotimg,
    roadImage,
    entrance,
    image1,
    image2
];

const projectPlotCounts = {
    1: 120,
    2: 86,
    3: 104,
    4: 72,
    5: 58,
    6: 64,
    7: 110,
    8: 46,
    9: 112,
    10: 92,
    11: 138,
    12: 135,

    // New Projects
    13: 96,
    14: 108,
    15: 84,
    16: 116,
    17: 74,
    18: 126
};

const sizes = [
    "600 sq.ft",
    "800 sq.ft",
    "1000 sq.ft",
    "1200 sq.ft",
    "1500 sq.ft",
    "1800 sq.ft",
    "2000 sq.ft",
    "2400 sq.ft"
];

const facings = [
    "East",
    "West",
    "North",
    "South"
];

const statuses = [
    "Available",
    "Available",
    "Available",
    "Reserved",
    "Sold"
];

const prices = [
    "₹12 Lakh",
    "₹15 Lakh",
    "₹18 Lakh",
    "₹20 Lakh",
    "₹24 Lakh",
    "₹28 Lakh",
    "₹30 Lakh",
    "₹36 Lakh"
];

const generatedPlots = [];

Object.entries(projectPlotCounts).forEach(
    ([projectIdString, totalPlots]) => {

        const projectId = Number(projectIdString);

        for (let index = 1; index <= totalPlots; index++) {

            const plotNumber =
                `${projectId}${String(index).padStart(2, "0")}`;

            generatedPlots.push({
                id: `${projectId}-${index}`,

                projectId,

                plotNumber,

                image: plotimg,

                images: commonImages,

                size: sizes[(index - 1) % sizes.length],

                facing: facings[(index - 1) % facings.length],

                price: prices[(index - 1) % prices.length],

                status: statuses[(index - 1) % statuses.length]
            });
        }
    }
);

export const plots = generatedPlots;