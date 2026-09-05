import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * [PHASE 25] Production Database Health & Latency Probe
 */
export async function checkDatabaseConnection(): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      healthy: true,
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: err?.message || 'Database connection error',
    };
  }
}

/**
 * [PHASE 25] Graceful connection disposal on container restart / process termination
 */
if (typeof process !== 'undefined') {
  const handleShutdown = async () => {
    try {
      await prisma.$disconnect();
    } catch {
      // Ignore disconnect errors during process exit
    }
  };

  process.once('beforeExit', handleShutdown);
  process.once('SIGINT', handleShutdown);
  process.once('SIGTERM', handleShutdown);
}

export default prisma;
