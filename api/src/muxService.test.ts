import { beforeEach, describe, expect, it, vi } from 'vitest';
const provider = vi.hoisted(() => ({ create: vi.fn(), delete: vi.fn(), retrieve: vi.fn(), asset: vi.fn(), cancel: vi.fn() }));
vi.mock('@mux/mux-node', () => ({ default: class { video = { uploads: { create: provider.create, retrieve: provider.retrieve, cancel: provider.cancel }, assets: { retrieve: provider.asset, delete: provider.delete } }; } }));
import { ConfiguredMuxVideoService } from './muxService.js';

describe('US-T006 public playback and cleanup', () => {
  beforeEach(() => vi.resetAllMocks());
  it('VO-02 rejects signed configuration before accepting uploads', () => {
    expect(() => new ConfiguredMuxVideoService('isolated', 'isolated', 'signed')).toThrow(/public/);
  });
  it('VO-01 deletes a bound asset and refuses forged references', async () => {
    const service = new ConfiguredMuxVideoService('isolated', 'isolated');
    provider.asset.mockResolvedValue({ passthrough: '{"c":"course"}' });
    await service.removeVideo({ courseId: 'course', assetId: 'asset', uploadId: 'upload' });
    expect(provider.delete).toHaveBeenCalledWith('asset', { timeout: 3000, maxRetries: 0 });
    provider.delete.mockClear();
    await expect(service.removeVideo({ courseId: 'other', assetId: 'asset', uploadId: 'upload' })).rejects.toThrow(/ownership/);
    expect(provider.delete).not.toHaveBeenCalled();
  });
  it('VO-01 cancels a bound pending upload and deletes an asset created during cancellation', async () => {
    const service = new ConfiguredMuxVideoService('isolated', 'isolated');
    provider.retrieve.mockResolvedValue({ new_asset_settings: { passthrough: '{"c":"course"}' } });
    provider.cancel.mockResolvedValue({ asset_id: 'late-asset' });
    provider.asset.mockResolvedValue({ passthrough: '{"c":"course"}' });
    await service.removeVideo({ courseId: 'course', assetId: '', uploadId: 'upload' });
    expect(provider.cancel).toHaveBeenCalledWith('upload', { timeout: 3000, maxRetries: 0 });
    expect(provider.delete).toHaveBeenCalledWith('late-asset', { timeout: 3000, maxRetries: 0 });
  });
  it('VO-01 treats provider 404 as already removed', async () => {
    provider.asset.mockRejectedValue({ status: 404 });
    await expect(new ConfiguredMuxVideoService('isolated', 'isolated').removeVideo({ courseId: 'course', assetId: 'asset', uploadId: '' })).resolves.toBeUndefined();
    expect(provider.delete).not.toHaveBeenCalled();
  });
});
