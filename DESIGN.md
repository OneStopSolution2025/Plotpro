---
name: PlotPro
description: Real estate plot layout visualizer and property management platform
colors:
  primary: "#17240f"
  primary-dark: "#081206"
  accent: "#a63d2f"
  surface-card: "#2d362b"
  surface-overlay: "rgba(82, 94, 73, 0.62)"
  neutral-bg: "#ffffff"
  text-primary: "#2b2b2b"
  text-muted: "#94a3b8"
  text-light: "#ffffff"
typography:
  display:
    fontFamily: "Poppins, sans-serif"
    fontSize: "clamp(48px, 5.2vw, 70px)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-2.5px"
  heading:
    fontFamily: "Poppins, sans-serif"
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.7px"
  body:
    fontFamily: "Poppins, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "20px"
  lg: "30px"
  full: "50px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  badge:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.full}"
    padding: "9px 14px"
---

## Overview
PlotPro features a nature-inspired dark-forest real estate aesthetic, combining deep greens (`#17240f`), crisp glassmorphism cards with backdrop blur, and modern typography centered on Poppins.

## Colors
- **Deep Forest Green (Primary)**: `#17240f`
- **Sub-forest Deep**: `#081206`
- **Terracotta / Rust (Secondary/Action)**: `#a63d2f`
- **Muted Glass Surfaces**: `rgba(82, 94, 73, 0.62)` with `backdrop-filter: blur(10px)`
- **Clean Neutral Background**: `#ffffff`
- **Muted Grays**: `#94a3b8`

## Typography
- Primary Font: `Poppins, sans-serif`
- Headings: Tight letter-spacing (`-0.7px` to `-2.5px`), strong weights (600)
- Body: 14px default, clean line-height (1.5)

## Layout
- Fluid responsive grid structures, max widths tailored to 1200px - 1400px.
- Floating glassmorphism navigation header with backdrop blur.

## Elevation & Depth
- Layered gradients on image assets (`rgba(0, 0, 0, 0.6)` to `rgba(8, 18, 6, 0.98)`).
- Soft drop shadows: `0 12px 35px rgba(0, 0, 0, 0.12)`.
- Glassmorphism overlays with `1px solid rgba(255, 255, 255, 0.14)`.

## Shapes
- Rounded pills (`50px`) for actions, search bars, location badges, and filters.
- Large border radii (`24px` to `30px`) for project cards and hero sections.

## Components
- Floating Glass Navbar
- Immersive Project Cards with integrated price pills and explore CTAs
- Plot Layout Grid and interactive selection maps
- Admin dashboard KPI cards and data tables

## Do's and Don'ts
- **Do**: Maintain high-contrast text against dark hero gradients and image cards.
- **Do**: Use rounded pill buttons (`50px`) for major primary actions.
- **Don't**: Introduce neon or incompatible primary blues/purples; preserve the refined architectural earth-tone aesthetic.
