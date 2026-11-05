/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.ADMIN_BASE_PATH || undefined,
  async rewrites() {
    const apiProxyTarget =
      process.env.API_PROXY_TARGET ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${apiProxyTarget}/:path*` }];
  },
};
export default nextConfig;
