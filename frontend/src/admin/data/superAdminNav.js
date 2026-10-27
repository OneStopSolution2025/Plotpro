import { superAdminProfile } from "./superAdminMockData";

export const superAdminNavGroups = [
  {
    title: "MAIN MENU",
    items: [
      { label: "Dashboard", icon: "home", path: "/super-admin", end: true },
      { label: "General Enquiries", icon: "clipboard", path: "/super-admin/general-enquiries" },
      { label: "Branches", icon: "branch", path: "/super-admin/branches" },
      { label: "Approvals", icon: "approvals", path: "/super-admin/approvals" },
      { label: "New Project", icon: "grid", path: "/super-admin/projects/new" },
      { label: "Subscription", icon: "creditCard", path: "/super-admin/subscription" },
    ],
  },
];

export const superAdminHeaderUser = {
  name: superAdminProfile.name,
  role: superAdminProfile.role,
};
