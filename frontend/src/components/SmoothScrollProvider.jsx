import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Global Lenis instance reference for programmatic access (e.g. scroll reset)
 */
let lenisInstance = null;

export function getLenis() {
  return lenisInstance;
}

/**
 * SmoothScrollProvider
 * Initializes Lenis smooth scrolling across the entire client site,
 * hooks Lenis scroll events into GSAP ScrollTrigger for 60fps precision,
 * and handles route navigation scroll-to-top via Lenis.scrollTo(0).
 */
export default function SmoothScrollProvider() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    // 1. Initialize Lenis
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Exponential easeOut
      direction: "vertical",
      gestureDirection: "vertical",
      smooth: true,
      smoothTouch: false, // Maintain native snappy touch momentum on mobile devices
      touchMultiplier: 2,
      prevent: (node) => {
        return (
          node.hasAttribute?.("data-lenis-prevent") ||
          node.closest?.("[data-lenis-prevent]") ||
          node.closest?.(".modal") ||
          node.closest?.(".modal-dialog") ||
          node.closest?.(".modal-content") ||
          node.closest?.(".plot-panel-drawer") ||
          node.closest?.(".plot-panel-body") ||
          node.closest?.("[role='dialog']") ||
          node.closest?.(".sa-modal-responsive") ||
          node.closest?.(".sa-modal-responsive-card") ||
          node.closest?.(".sa-modal-body-scroll") ||
          node.closest?.(".sa-modal-backdrop") ||
          node.closest?.(".sa-modal-content") ||
          node.closest?.(".sa-modal-overlay") ||
          node.closest?.(".sa-modal") ||
          node.closest?.(".sub-modal-overlay") ||
          node.closest?.(".sub-modal-content")
        );
      },
    });

    lenisInstance = lenis;

    // 2. Connect Lenis scroll updates to GSAP ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update);

    // 3. Drive Lenis with GSAP's optimized ticker (unified 60fps / 120fps render loop)
    const updateTicker = (time) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(updateTicker);
      lenis.destroy();
      lenisInstance = null;
    };
  }, []);

  // Handle route change and hash changes smoothly with Lenis
  useEffect(() => {
    if (!lenisInstance) return;

    if (hash) {
      const element = document.querySelector(hash);
      if (element) {
        lenisInstance.scrollTo(element, { offset: 0, duration: 1.2 });
        return;
      }
    }

    // Scroll to top immediately on route change
    lenisInstance.scrollTo(0, { immediate: true });
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    // Refresh ScrollTrigger calculations for new page content
    const refreshTimer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 150);

    return () => clearTimeout(refreshTimer);
  }, [pathname, hash]);

  return null;
}
