/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enable after() API for asynchronous telemetry and processing tasks
    after: true,
  },
};

module.exports = nextConfig;
