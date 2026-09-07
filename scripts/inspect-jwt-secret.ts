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

async function checkJwtSecret() {
  const rawEnv = fs.readFileSync('.env.staging', 'utf8');
  const env = parseEnv(rawEnv);
  const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_URL || env.DATABASE_URL } } });

  try {
    const secrets: any = await prisma.$queryRawUnsafe(`
      SELECT name, setting FROM pg_settings WHERE name LIKE '%jwt%' OR name LIKE '%supabase%';
    `);
    console.log('PG Settings:', secrets.map((s: any) => s.name));

    const authConfig: any = await prisma.$queryRawUnsafe(`
      SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'vault';
    `);
    console.log('Vault schema:', authConfig);
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkJwtSecret();
