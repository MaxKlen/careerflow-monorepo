/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.CANDIDATE_BASE_PATH || undefined,
  transpilePackages: ["@careerflow/core", "@careerflow/shared"],
};
export default nextConfig;
