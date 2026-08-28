import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The webapp reads Firebase Auth and Firestore directly from the browser, so
  // it can be published as static files on Firebase Hosting.
  output: "export",
};

export default nextConfig;
