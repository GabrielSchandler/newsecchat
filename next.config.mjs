/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O build não pode ser considerado verde com erro de tipo ou de lint.
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  experimental: {
    // Server Actions recebem upload de mídia (áudio, PDF, imagem).
    serverActions: { bodySizeLimit: '25mb' },
  },
};

export default nextConfig;
