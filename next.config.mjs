/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@electric-sql/pglite", "pg"],
    outputFileTracingIncludes: { "/api/**": ["./db/schema.sql"] },
  },
};
export default nextConfig;
