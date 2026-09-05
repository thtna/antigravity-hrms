import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ApiResponse } from '@/types';

export async function GET(): Promise<NextResponse<ApiResponse<{ status: string; version: string; uptime: number }>>> {
  logger.info('System health check invoked', { endpoint: '/api/health' });

  return NextResponse.json({
    success: true,
    data: {
      status: 'HEALTHY',
      version: '1.0.0',
      uptime: process.uptime(),
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}
