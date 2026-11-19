/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    qualities: [75, 90],
    // product photos, resized by Next for the public product pages
    remotePatterns: [{ protocol: "https", hostname: "moulins.s3.ap-south-1.amazonaws.com", pathname: "/products/**" }],
  },
  // Dev only: other devices on the Wi-Fi opening `next dev` by this
  // machine's IP need it listed, or Next blocks its scripts. Comma-separated,
  // e.g. DEV_ORIGINS=192.168.1.24. Ignored by production builds.
  allowedDevOrigins: process.env.DEV_ORIGINS ? process.env.DEV_ORIGINS.split(",").map((s) => s.trim()) : [],
};

export default nextConfig;
