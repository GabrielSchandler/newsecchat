import { fileURLToPath } from 'node:url';
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  serverExternalPackages: ['bullmq', 'ioredis'],
  outputFileTracingRoot: fileURLToPath(new URL('.',import.meta.url)),
  // O build não pode ser considerado verde com erro de tipo ou de lint.
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  experimental: {
    // Server Actions recebem upload de mídia (áudio, PDF, imagem).
    serverActions: { bodySizeLimit: '25mb' },
  },
};

export default nextConfig;
