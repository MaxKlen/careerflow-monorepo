/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.EMPLOYER_BASE_PATH || undefined,
  async rewrites() {
    const apiProxyTarget =
      process.env.API_PROXY_TARGET ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${apiProxyTarget}/:path*` }];
  },
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
