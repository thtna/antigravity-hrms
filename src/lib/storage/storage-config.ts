import { ApiError } from '@/lib/errors';

export type StorageProviderName = 'local' | 'supabase';

export interface StorageEnvironment {
  NODE_ENV?: string;
  APP_ENV?: string;
  STORAGE_PROVIDER?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SERVICE_KEY?: string;
}

export interface SupabaseStorageConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

export type ResolvedStorageConfig =
  | {
      provider: 'local';
      protectedEnvironment: false;
    }
  | {
      provider: 'supabase';
      protectedEnvironment: boolean;
      supabase: SupabaseStorageConfig;
    };

function configurationError(message: string): ApiError {
  return ApiError.internal(`Cau hinh Storage khong hop le: ${message}`);
}

function normalize(value: string | undefined): string {
  return value?.trim() || '';
}

function normalizeEnvironmentName(value: string | undefined): string {
  return normalize(value).toLowerCase();
}

export function isProtectedStorageEnvironment(env: StorageEnvironment): boolean {
  const nodeEnv = normalizeEnvironmentName(env.NODE_ENV);
  const appEnv = normalizeEnvironmentName(env.APP_ENV);

  return nodeEnv === 'production' || appEnv === 'production' || appEnv === 'staging';
}

export function validateSupabaseStorageConfig(
  config: Partial<SupabaseStorageConfig>
): SupabaseStorageConfig {
  const supabaseUrl = normalize(config.supabaseUrl);
  const serviceRoleKey = normalize(config.serviceRoleKey);

  if (!supabaseUrl) {
    throw configurationError('SUPABASE_URL la bat buoc.');
  }
  if (!serviceRoleKey) {
    throw configurationError('SUPABASE_SERVICE_ROLE_KEY la bat buoc.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw configurationError('SUPABASE_URL phai la URL HTTP/HTTPS hop le.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
    throw configurationError('SUPABASE_URL phai la URL HTTP/HTTPS hop le.');
  }

  return {
    supabaseUrl: parsedUrl.toString().replace(/\/$/, ''),
    serviceRoleKey,
  };
}

export function resolveStorageConfig(
  env: StorageEnvironment = process.env
): ResolvedStorageConfig {
  const protectedEnvironment = isProtectedStorageEnvironment(env);
  const rawProvider = normalize(env.STORAGE_PROVIDER);
  const provider = rawProvider.toLowerCase();

  if (!provider) {
    if (protectedEnvironment) {
      throw configurationError('STORAGE_PROVIDER=supabase la bat buoc trong Production/Staging.');
    }
    return { provider: 'local', protectedEnvironment: false };
  }

  if (provider !== 'local' && provider !== 'supabase') {
    throw configurationError('STORAGE_PROVIDER chi ho tro local hoac supabase.');
  }

  if (provider === 'local') {
    if (protectedEnvironment) {
      throw configurationError('Local Storage bi cam trong Production/Staging.');
    }
    return { provider: 'local', protectedEnvironment: false };
  }

  const canonicalServiceRoleKey = normalize(env.SUPABASE_SERVICE_ROLE_KEY);
  const legacyServiceKey = normalize(env.SUPABASE_SERVICE_KEY);
  const serviceRoleKey = protectedEnvironment
    ? canonicalServiceRoleKey
    : canonicalServiceRoleKey || legacyServiceKey;

  return {
    provider: 'supabase',
    protectedEnvironment,
    supabase: validateSupabaseStorageConfig({
      supabaseUrl: env.SUPABASE_URL,
      serviceRoleKey,
    }),
  };
}
