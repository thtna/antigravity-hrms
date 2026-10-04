import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { StorageManager } from '@/lib/storage/storage-manager';
import { LocalStorageProvider } from '@/lib/storage/providers/local.provider';
import { SupabaseStorageProvider } from '@/lib/storage/providers/supabase.provider';

describe('R3 local signed storage route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    StorageManager.resetProvider();
  });

  it('serves a valid token only through the active local provider', async () => {
    const provider = new LocalStorageProvider(undefined, 'route-test-secret');
    vi.spyOn(provider, 'download').mockResolvedValue({
      buffer: Buffer.from('local-document'),
      metadata: { size: 14, contentType: 'application/pdf' },
    });
    vi.spyOn(StorageManager, 'getProvider').mockReturnValue(provider);

    const signedUrl = await provider.getSignedUrl('documents', 'organizations/org-a/doc.pdf');
    const response = await GET(new NextRequest(new URL(signedUrl, 'http://localhost:3000')));

    expect(response.status).toBe(200);
    expect(provider.download).toHaveBeenCalledWith(
      'documents',
      'organizations/org-a/doc.pdf'
    );
  });

  it.each([
    { token: 'invalid-token', exp: Date.now() + 60_000, label: 'invalid token' },
    { token: 'invalid-token', exp: Date.now() - 1, label: 'expired token' },
  ])('rejects an $label', async ({ token, exp }) => {
    const provider = new LocalStorageProvider(undefined, 'route-test-secret');
    const download = vi.spyOn(provider, 'download');
    vi.spyOn(StorageManager, 'getProvider').mockReturnValue(provider);
    const request = new NextRequest(
      `http://localhost:3000/api/v1/storage/signed?bucket=documents&key=organizations%2Forg-a%2Fdoc.pdf&token=${token}&exp=${exp}`
    );

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(download).not.toHaveBeenCalled();
  });

  it('rejects Supabase mode before local signature verification or any download', async () => {
    const provider = new SupabaseStorageProvider({
      supabaseUrl: 'https://test-project.supabase.co',
      serviceRoleKey: 'test-service-role-key',
    });
    const supabaseDownload = vi.spyOn(provider, 'download');
    const localVerify = vi.spyOn(LocalStorageProvider.prototype, 'verifySignedToken');
    vi.spyOn(StorageManager, 'getProvider').mockReturnValue(provider);
    const request = new NextRequest(
      `http://localhost:3000/api/v1/storage/signed?bucket=documents&key=organizations%2Forg-a%2Fdoc.pdf&token=unused&exp=${Date.now() + 60_000}`
    );

    const response = await GET(request);

    expect(response.status).toBe(404);
    expect(localVerify).not.toHaveBeenCalled();
    expect(supabaseDownload).not.toHaveBeenCalled();
  });
});
