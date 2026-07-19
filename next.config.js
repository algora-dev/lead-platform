/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client', 'jsdom'],
};

module.exports = nextConfig;
