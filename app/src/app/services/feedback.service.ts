import { Injectable, inject } from '@angular/core';
import { FeedbackEntry, FeedbackTriageUpdate } from '../app.models';
import { ApiClientService } from './api-client.service';

export type FeedbackSubmitResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

export type FeedbackTriageResult =
  | {
      ok: true;
      feedback: FeedbackEntry;
    }
  | {
      ok: false;
      message: string;
    };

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly apiClient = inject(ApiClientService);

  async submitFeedback(
    token: string,
    page: string,
    rating: string,
    message: string,
  ): Promise<FeedbackSubmitResult> {
    const response = await this.apiClient.fetch('/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        page,
        rating,
        message,
        userAgent: window.navigator.userAgent,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      return {
        ok: false,
        message: body.message ?? 'Unable to send feedback right now.',
      };
    }

    this.apiClient.invalidateCache('/feedback');

    return { ok: true };
  }

  async listFeedback(token: string, force = false): Promise<FeedbackEntry[]> {
    const { ok, body } = await this.apiClient.fetchJson<FeedbackEntry[]>(
      '/feedback',
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
      undefined,
      force,
    );

    if (!ok || !Array.isArray(body)) {
      throw new Error(!Array.isArray(body) && body.message ? body.message : 'Unable to load feedback.');
    }

    return body;
  }

  async updateTriage(token: string, update: FeedbackTriageUpdate): Promise<FeedbackTriageResult> {
    const response = await this.apiClient.fetch(`/feedback/${encodeURIComponent(update.id)}/triage`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workStatus: update.workStatus,
        priority: update.priority ?? null,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as FeedbackEntry | { message?: string };

    if (!response.ok || !('id' in body)) {
      return {
        ok: false,
        message: 'message' in body && body.message ? body.message : 'Unable to save feedback status.',
      };
    }

    this.apiClient.invalidateCache('/feedback');

    return {
      ok: true,
      feedback: body,
    };
  }
}
