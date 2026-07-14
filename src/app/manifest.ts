import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Policy to Action — District Policy Assistant",
    short_name: "Policy to Action",
    description:
      "Ask scenario questions and get guidance grounded in your district's policies and handbooks.",
    start_url: "/policy-assistant",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7fafc",
    theme_color: "#0e7490",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
