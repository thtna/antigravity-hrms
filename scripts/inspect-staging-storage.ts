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

async function checkStorageSchema() {
  const rawEnv = fs.readFileSync('.env.staging', 'utf8');
  const env = parseEnv(rawEnv);
  const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_URL || env.DATABASE_URL } } });

  try {
    const schemas: any = await prisma.$queryRawUnsafe(`
      SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'storage';
    `);
    console.log('Storage schema exists:', schemas);

    if (schemas.length > 0) {
      const tables: any = await prisma.$queryRawUnsafe(`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'storage';
      `);
      console.log('Storage tables:', tables.map((t: any) => t.table_name));

      const buckets: any = await prisma.$queryRawUnsafe(`
        SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets;
      `);
      console.log('Current buckets:', buckets);
    }
  } catch (err: any) {
    console.error('Error checking storage schema:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkStorageSchema();
