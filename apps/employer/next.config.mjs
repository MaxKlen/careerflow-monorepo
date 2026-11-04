/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.EMPLOYER_BASE_PATH || undefined,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};
export default nextConfig;
