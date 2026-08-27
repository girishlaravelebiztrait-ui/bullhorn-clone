/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse and mammoth pull in optional native/test assets that Next's
  // server bundler shouldn't try to trace. Keep them external on the server.
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "@elastic/elasticsearch"],
  },
};

export default nextConfig;
