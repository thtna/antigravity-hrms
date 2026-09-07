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

async function inspectPg() {
  const rawEnv = fs.readFileSync('.env.staging', 'utf8');
  const env = parseEnv(rawEnv);
  const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_URL || env.DATABASE_URL } } });

  try {
    const schemas: any = await prisma.$queryRawUnsafe(`
      SELECT schema_name FROM information_schema.schemata;
    `);
    console.log('Schemas:', schemas.map((s: any) => s.schema_name));

    const authTables: any = await prisma.$queryRawUnsafe(`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'auth';
    `);
    console.log('Auth tables:', authTables.map((t: any) => t.table_name));
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

inspectPg();
