import Mux from '@mux/mux-node';
import type { Request } from 'express';
import { apiConfig, hasMuxConfig } from './config.js';

export type MuxPlaybackPolicy = 'public' | 'signed';

export type CreateMuxUploadInput = {
  courseId: string;
  sectionId: string;
  componentId: string;
  corsOrigin: string;
};

export type CreateMuxUploadResult = {
  uploadId: string;
  uploadUrl: string;
  playbackPolicy: MuxPlaybackPolicy;
};

export interface MuxVideoService {
  createDirectUpload(input: CreateMuxUploadInput): Promise<CreateMuxUploadResult>;
}

export type MuxWebhookEvent =
  | {
      type: 'video.upload.asset_created';
      data: {
        id: string;
        asset_id?: string;
        new_asset_settings?: {
          passthrough?: string;
        };
      };
    }
  | {
      type: 'video.asset.ready';
      data: {
        id: string;
        duration?: number;
        passthrough?: string;
        playback_ids?: Array<{
          id: string;
          policy?: 'public' | 'signed' | 'drm';
        }>;
        upload_id?: string;
      };
    }
  | {
      type: 'video.asset.errored';
      data: {
        id: string;
        passthrough?: string;
        upload_id?: string;
        errors?: {
          messages?: string[];
          type?: string;
        };
      };
    }
  | {
      type: string;
      data: unknown;
    };

export interface MuxWebhookService {
  unwrapWebhook(body: string, headers: Request['headers']): Promise<MuxWebhookEvent>;
}

export class ConfiguredMuxVideoService implements MuxVideoService {
  private readonly client: Mux;

  constructor(
    tokenId = apiConfig.MUX_TOKEN_ID,
    tokenSecret = apiConfig.MUX_TOKEN_SECRET,
    private readonly playbackPolicy: MuxPlaybackPolicy = apiConfig.MUX_DEFAULT_PLAYBACK_POLICY,
  ) {
    if (!tokenId || !tokenSecret) {
      throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET are required to create Mux uploads.');
    }

    this.client = new Mux({ tokenId, tokenSecret });
  }

  async createDirectUpload(input: CreateMuxUploadInput): Promise<CreateMuxUploadResult> {
    const upload = await this.client.video.uploads.create({
      cors_origin: input.corsOrigin,
      timeout: 3600,
      new_asset_settings: {
        playback_policies: [this.playbackPolicy],
        video_quality: 'basic',
        passthrough: JSON.stringify({
          c: input.courseId,
          s: input.sectionId,
          m: input.componentId,
        }),
      },
    });

    if (!upload.url) {
      throw new Error('Mux did not return a direct upload URL.');
    }

    return {
      uploadId: upload.id,
      uploadUrl: upload.url,
      playbackPolicy: this.playbackPolicy,
    };
  }
}

export class ConfiguredMuxWebhookService implements MuxWebhookService {
  private readonly client: Mux;

  constructor(private readonly webhookSecret = apiConfig.MUX_WEBHOOK_SECRET) {
    this.client = new Mux({ webhookSecret });
  }

  async unwrapWebhook(body: string, headers: Request['headers']): Promise<MuxWebhookEvent> {
    return (await this.client.webhooks.unwrap(body, headers, this.webhookSecret)) as MuxWebhookEvent;
  }
}

export function createMuxVideoService(): MuxVideoService | null {
  if (!hasMuxConfig()) {
    return null;
  }

  return new ConfiguredMuxVideoService();
}

export function createMuxWebhookService(): MuxWebhookService | null {
  if (!apiConfig.MUX_WEBHOOK_SECRET) {
    return null;
  }

  return new ConfiguredMuxWebhookService();
}
