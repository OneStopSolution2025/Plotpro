import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * ScrollToTop Component
 * Ensures every page navigation in the application resets the window scroll
 * position to the top (0, 0), and handles hash anchor links gracefully if present.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    // If a hash anchor is provided (e.g. #contact or #features), scroll smoothly to that element
    if (hash) {
      const element = document.querySelector(hash);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }

    // Otherwise, immediately scroll window to top
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });

    // Also reset document body / root scroll in case any container held scroll state
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }
  }, [pathname, hash]);

  return null;
}
