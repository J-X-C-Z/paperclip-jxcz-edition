import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "orialis-brief",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Brief",
  description: "A project brief overview and project detail tab for Orialis.",
  author: "Orialis",
  categories: ["ui", "workspace"],
  capabilities: ["ui.page.register", "ui.sidebar.register", "ui.detailTab.register"],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "page",
        id: "brief-page",
        displayName: "Brief",
        exportName: "BriefPage",
        routePath: "brief",
      },
      {
        type: "sidebar",
        id: "brief-sidebar-link",
        displayName: "Brief",
        exportName: "BriefSidebarLink",
      },
      {
        type: "detailTab",
        id: "project-brief-tab",
        displayName: "Brief",
        exportName: "ProjectBriefTab",
        entityTypes: ["project"],
        order: 40,
      },
    ],
  },
};

export default manifest;
