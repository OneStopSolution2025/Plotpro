/* =========================================================
   DREAMCITY — RUNTIME DATE UTILITIES
   ---------------------------------------------------------
   Provides dynamic current date formatting at runtime using
   browser native JavaScript Date and Intl APIs.
   No static or hardcoded dates.
   ========================================================= */

/**
 * Returns the formatted current date string at runtime.
 * @param {Object} options
 * @param {'short' | 'long'} options.style - 'short' -> '29 Sep 2026', 'long' -> '29 September 2026'
 * @returns {string} Formatted date string
 */
export const formatCurrentDate = ({ style = "short" } = {}) => {
  const now = new Date();

  if (style === "long") {
    // Example: "29 September 2026"
    return now.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  // Default 'short': Example: "29 Sep 2026"
  return now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};
