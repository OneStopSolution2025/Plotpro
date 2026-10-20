/* =========================================================
   DREAMCITY — SUPER ADMIN SEED DATA
   ---------------------------------------------------------
   Seed profile, header, and initial admin accounts for
   AdminContext. Canonical project and plot data live in
   ProjectContext and PlotContext respectively.
   ========================================================= */

export const superAdminProfile = {
  name: "Super Admin",
  role: "Super Administrator",
  initials: "SA",
};

export const superAdminHeader = {
  kicker: "WELCOME BACK",
  greeting: "Good Morning, ",
  greetingAccent: "Super Admin",
  description:
    "Here's an overview of everything happening across DreamCity today.",
  dateLabel: "Today",
};


export const admins = [
  {
    id: "arun",
    name: "Arun Kumar",
    email: "arun@dreamcity.in",
    mobile: "+91 98765 43210",
    role: "Administrator",
    status: "Active",
  },
  {
    id: "priya",
    name: "Priya",
    email: "priya@dreamcity.in",
    mobile: "+91 98765 43211",
    role: "Administrator",
    status: "Active",
  },
  {
    id: "karthik",
    name: "Karthik",
    email: "karthik@dreamcity.in",
    mobile: "+91 98765 43212",
    role: "Administrator",
    status: "Active",
  },
  {
    id: "divya",
    name: "Divya",
    email: "divya@dreamcity.in",
    mobile: "+91 98765 43213",
    role: "Administrator",
    status: "Active",
  },
  {
    id: "senthil",
    name: "Senthil R",
    email: "senthil@dreamcity.in",
    mobile: "+91 98765 43214",
    role: "Administrator",
    status: "Inactive",
  },
];