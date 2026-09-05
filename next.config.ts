import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // [PHASE 26] Standalone output for Docker, disabled on Vercel (Vercel manages serverless packaging)
  output: process.env.VERCEL ? undefined : 'standalone',

  // [PHASE 26] Exclude Windows system font paths from standalone trace.
  // pdfkit traces C:\Windows\Fonts on Windows builders — irrelevant in Linux containers.
  outputFileTracingExcludes: {
    '/api/v1/payroll/payslips/[id]/pdf': [
      'C:\\Windows\\Fonts\\**',
      'C:/Windows/Fonts/**',
    ],
  },

  // [PHASE 25] Production Optimization & Hardening
  compress: true, // Enable Gzip & Brotli compression for server responses
  poweredByHeader: false, // Security: suppress X-Powered-By header

  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
