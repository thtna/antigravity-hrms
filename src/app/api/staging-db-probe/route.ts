import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

// STAGING-ONLY TEMPORARY DIAGNOSTIC — MUST NEVER BE MERGED TO MAIN
// Revert immediately after probe result is captured.

const KNOWN_STAGING_ORG_ID = '32b15bd9-b243-4ebb-9f2b-32a22b94055b';

const EXPECTED_MIGRATION_NAMES: readonly string[] = [
  '20260901000000_init',
  '20260906000000_phase2_multi_tenant_foundation',
  '20260907000000_add_onboarding_and_worksite_indices',
  '20260908000000_drop_fallback_tenant_defaults',
];

export async function GET(): Promise<NextResponse> {
  const isAllowedRuntime =
    process.env.APP_ENV === 'staging' &&
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'staging';

  if (!isAllowedRuntime) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  type MigrationRow = { migration_name: string };
  type TableExistsRow = { exists: boolean };
  type ReadOnlyRow = { transaction_read_only: string };
  type OrgRow = { id: string };

  let transactionReadOnly = false;
  let organizationsTableExists = false;
  let appliedMigrationCount = 0;
  let allExpectedMigrationsApplied = false;
  let noUnexpectedMigrations = false;
  let knownStagingOrganizationExists = false;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);

    const roCheck = await tx.$queryRaw<ReadOnlyRow[]>(
      Prisma.sql`SHOW transaction_read_only`
    );
    transactionReadOnly = roCheck[0]?.transaction_read_only === 'on';

    const tableCheck = await tx.$queryRaw<TableExistsRow[]>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'organizations'
      ) AS exists
    `);
    organizationsTableExists = Boolean(tableCheck[0]?.exists);

    const migrationRows = await tx.$queryRaw<MigrationRow[]>(Prisma.sql`
      SELECT migration_name
      FROM public."_prisma_migrations"
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at ASC
    `);
    const appliedNames = migrationRows.map((r) => r.migration_name);
    appliedMigrationCount = appliedNames.length;

    const missingMigrations = EXPECTED_MIGRATION_NAMES.filter(
      (expected) => !appliedNames.includes(expected)
    );
    const unexpectedMigrations = appliedNames.filter(
      (applied) => !EXPECTED_MIGRATION_NAMES.includes(applied)
    );
    allExpectedMigrationsApplied =
      missingMigrations.length === 0 &&
      appliedMigrationCount >= EXPECTED_MIGRATION_NAMES.length;
    noUnexpectedMigrations = unexpectedMigrations.length === 0;

    const orgCheck = await tx.$queryRaw<OrgRow[]>(Prisma.sql`
      SELECT id FROM public.organizations
      WHERE id = ${KNOWN_STAGING_ORG_ID}
      LIMIT 1
    `);
    knownStagingOrganizationExists = orgCheck.length === 1;
  });

  const stagingDatabaseVerified =
    process.env.APP_ENV === 'staging' &&
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'staging' &&
    transactionReadOnly &&
    organizationsTableExists &&
    allExpectedMigrationsApplied &&
    noUnexpectedMigrations &&
    appliedMigrationCount === EXPECTED_MIGRATION_NAMES.length &&
    knownStagingOrganizationExists;

  return NextResponse.json({
    appEnv: process.env.APP_ENV,
    vercelEnv: process.env.VERCEL_ENV ?? 'unknown',
    transactionReadOnly,
    organizationsTableExists,
    expectedMigrationCount: EXPECTED_MIGRATION_NAMES.length,
    appliedMigrationCount,
    allExpectedMigrationsApplied,
    noUnexpectedMigrations,
    knownStagingOrganizationExists,
    stagingDatabaseVerified,
  });
}
