/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.CANDIDATE_BASE_PATH || undefined,
  transpilePackages: ["@careerflow/core", "@careerflow/shared"],
  async rewrites() {
    const apiProxyTarget =
      process.env.API_PROXY_TARGET ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${apiProxyTarget}/:path*` }];
  },
};
export default nextConfig;
