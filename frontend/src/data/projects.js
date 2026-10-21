/**
 * Standard default project form template helpers.
 * Note: Project data is dynamically stored and fetched directly from MongoDB Atlas (plotpro database).
 */

export const AVAILABLE_HIGHLIGHTS = [
  "Strategic and well-connected location",
  "Gated community with 24/7 security",
  "Wide blacktop roads",
  "Underground drainage & water supply",
  "Avenue trees and landscaped parks",
  "Ready-to-build plots",
  "High appreciation potential",
  "Clear Title",
  "DTCP Approved",
  "RERA Approved",
  "Bank Loan Available",
  "Immediate Construction",
];

// Safe defaults for new projects only. Legal/financial claims (DTCP, RERA, Bank Loan) are NEVER preselected by default.
export const DEFAULT_NEW_PROJECT_HIGHLIGHTS = [
  "Strategic and well-connected location",
  "Gated community with 24/7 security",
  "Wide blacktop roads",
  "Underground drainage & water supply",
  "Avenue trees and landscaped parks",
  "Ready-to-build plots",
  "High appreciation potential",
];

export const AVAILABLE_AMENITIES = [
  "24/7 Security",
  "Blacktop Roads",
  "Street Lighting",
  "Underground Drainage",
  "Water Supply",
  "Avenue Trees",
  "Children's Play Area",
  "Landscaped Parks",
  "CCTV Surveillance",
  "Security Cabin",
  "Walking Track",
  "Rainwater Harvesting",
  "Community Hall",
  "Solar Street Lights",
];

// Safe defaults for new projects only.
export const DEFAULT_NEW_PROJECT_AMENITIES = [
  "24/7 Security",
  "Blacktop Roads",
  "Street Lighting",
  "Underground Drainage",
  "Water Supply",
  "Avenue Trees",
  "Children's Play Area",
  "Landscaped Parks",
];

export const AVAILABLE_BENEFITS = [
  {
    title: "Prime Location",
    description: "Excellent connectivity to major roads and important locations.",
  },
  {
    title: "Gated Community",
    description: "Safe and secure community with 24/7 security.",
  },
  {
    title: "Wide Roads",
    description: "Well-developed and spacious roads for easy access.",
  },
  {
    title: "Green Environment",
    description: "Peaceful surroundings with green and natural environment.",
  },
  {
    title: "High Appreciation",
    description: "Rapidly developing neighborhood with strong capital growth.",
  },
  {
    title: "Clear Documentation",
    description: "Legally verified parent documents and immediate registration.",
  },
  {
    title: "Ready For Construction",
    description: "Complete infrastructure ready for immediate home construction.",
  },
  {
    title: "Water Abundance",
    description: "Copious potable ground water resources and uninterrupted supply.",
  },
];

export const DEFAULT_NEW_PROJECT_BENEFITS = [
  {
    title: "Prime Location",
    description: "Excellent connectivity to major roads and important locations.",
  },
  {
    title: "Gated Community",
    description: "Safe and secure community with 24/7 security.",
  },
  {
    title: "Wide Roads",
    description: "Well-developed and spacious roads for easy access.",
  },
  {
    title: "Green Environment",
    description: "Peaceful surroundings with green and natural environment.",
  },
];

// Backwards-compatible legacy exports
export const commonBenefits = DEFAULT_NEW_PROJECT_BENEFITS;
export const commonHighlights = DEFAULT_NEW_PROJECT_HIGHLIGHTS;
export const commonAmenities = DEFAULT_NEW_PROJECT_AMENITIES;

// No hardcoded projects. All live project data is saved and fetched from MongoDB Atlas.
export const projects = [];