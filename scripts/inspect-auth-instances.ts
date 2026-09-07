import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

function parseEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

async function inspectAuthInstances() {
  const rawEnv = fs.readFileSync('.env.staging', 'utf8');
  const env = parseEnv(rawEnv);
  const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_URL || env.DATABASE_URL } } });

  try {
    const res: any = await prisma.$queryRawUnsafe(`
      SELECT * FROM auth.instances;
    `);
    console.log('auth.instances count:', res.length);
    if (res.length > 0) {
      console.log('auth.instances keys:', Object.keys(res[0]));
      console.log('raw_base_config exists:', !!res[0].raw_base_config);
    }
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

inspectAuthInstances();
