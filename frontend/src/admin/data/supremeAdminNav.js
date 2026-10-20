/* =========================================================
   PLOTPRO — SUPREME ADMIN NAVIGATION
   ---------------------------------------------------------
   Dedicated platform-owner navigation for Supreme Admin.
   ========================================================= */

export const supremeAdminNavGroups = [
  {
    title: "PLATFORM OVERSIGHT",
    items: [
      { label: "Overview", icon: "chart", path: "/supreme-admin", end: true },
      { label: "Subscribers", icon: "users", path: "/supreme-admin/subscribers" },
      { label: "Subscription Plans", icon: "shield", path: "/supreme-admin/plans" },
      { label: "Subscriptions", icon: "calendar", path: "/supreme-admin/subscriptions" },
      { label: "Admin Seat Usage", icon: "userCheck", path: "/supreme-admin/seat-usage" },
      { label: "Platform Settings", icon: "cog", path: "/supreme-admin/settings" },
    ],
  },
];
