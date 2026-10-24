import { Injectable, inject } from '@angular/core';
import { UserProfileDetails } from '../app.models';
import { ApiClientService } from './api-client.service';

const PROFILE_STORAGE_PREFIX = 'qiEducationProfile:';

/** A course bought by this account (`GET /users/me/payments`). */
export type CoursePurchase = { id: string; courseId: string; courseTitle: string; amountDkk: number; paidAt: string; refunded: boolean };

/** Default initials-avatar color, matching the forest green used in the header. */
export const DEFAULT_AVATAR_COLOR = '#2f4f43';

/**
 * Stores the user-authored part of a profile (bio, role, goals, avatar color).
 *
 * US-L003: the account holds it (`/users/me/profile`). The copy on the device, keyed by
 * user id, only lets the form open at once and carries over what was saved before accounts
 * held profiles.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly apiClient = inject(ApiClientService);

  /** The account's profile; `updatedAt` is null when it was never saved. Null when it could not be read. */
  async loadAccount(token: string): Promise<(UserProfileDetails & { updatedAt: string | null }) | null> {
    try {
      const response = await this.apiClient.fetch('/users/me/profile', { headers: { authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => null) as Partial<UserProfileDetails & { updatedAt: string | null }> | null;
      if (!response.ok || typeof body?.avatarColor !== 'string') return null;
      const text = (value: unknown) => (typeof value === 'string' ? value : '');
      return { bio: text(body.bio), jobTitle: text(body.jobTitle), company: text(body.company), learningGoals: text(body.learningGoals),
        avatarColor: body.avatarColor, updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : null };
    } catch {
      return null;
    }
  }

  async saveAccount(token: string, details: UserProfileDetails): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const response = await this.apiClient.fetch('/users/me/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(details),
      });
      if (response.ok) return { ok: true };
      const body = await response.json().catch(() => ({})) as { message?: string };
      return { ok: false, message: body.message ?? 'Please try again.' };
    } catch {
      return { ok: false, message: 'Unable to reach the API. Please try again.' };
    }
  }

  /** US-L024: a Stripe customer portal session (saved card, receipts) for this account. */
  async openBillingPortal(token: string, returnUrl: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
    try {
      const response = await this.apiClient.fetch('/users/me/billing-portal', {
        method: 'POST', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ returnUrl }),
      });
      const body = await response.json().catch(() => ({})) as { url?: string; message?: string };
      return response.ok && body.url ? { ok: true, url: body.url } : { ok: false, message: body.message ?? 'Please try again.' };
    } catch {
      return { ok: false, message: 'Unable to reach the API. Please try again.' };
    }
  }

  /** The account's purchases, newest first. */
  async listPurchases(token: string): Promise<{ ok: true; purchases: CoursePurchase[] } | { ok: false; message: string }> {
    try {
      const response = await this.apiClient.fetch('/users/me/payments', { headers: { authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({})) as { payments?: CoursePurchase[]; message?: string };
      return response.ok && Array.isArray(body.payments) ? { ok: true, purchases: body.payments }
        : { ok: false, message: body.message ?? 'Your purchases could not be loaded. Please try again.' };
    } catch {
      return { ok: false, message: 'Unable to reach the API. Please try again.' };
    }
  }

  /** Stripe's receipt page for one purchase. */
  async receiptUrl(token: string, purchaseId: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
    try {
      const response = await this.apiClient.fetch(`/users/me/payments/${encodeURIComponent(purchaseId)}/receipt`, { headers: { authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({})) as { url?: string; message?: string };
      return response.ok && body.url ? { ok: true, url: body.url } : { ok: false, message: body.message ?? 'Please try again.' };
    } catch {
      return { ok: false, message: 'Unable to reach the API. Please try again.' };
    }
  }

  loadProfile(userId: string): UserProfileDetails {
    if (!userId) {
      return this.emptyProfile();
    }

    try {
      const raw = window.localStorage.getItem(this.storageKey(userId));

      if (!raw) {
        return this.emptyProfile();
      }

      const parsed = JSON.parse(raw) as Partial<UserProfileDetails>;

      return {
        bio: typeof parsed.bio === 'string' ? parsed.bio : '',
        jobTitle: typeof parsed.jobTitle === 'string' ? parsed.jobTitle : '',
        company: typeof parsed.company === 'string' ? parsed.company : '',
        learningGoals: typeof parsed.learningGoals === 'string' ? parsed.learningGoals : '',
        avatarColor:
          typeof parsed.avatarColor === 'string' && parsed.avatarColor
            ? parsed.avatarColor
            : DEFAULT_AVATAR_COLOR,
      };
    } catch {
      return this.emptyProfile();
    }
  }

  saveProfile(userId: string, details: UserProfileDetails): void {
    if (!userId) {
      return;
    }

    window.localStorage.setItem(this.storageKey(userId), JSON.stringify(details));
  }

  private emptyProfile(): UserProfileDetails {
    return {
      bio: '',
      jobTitle: '',
      company: '',
      learningGoals: '',
      avatarColor: DEFAULT_AVATAR_COLOR,
    };
  }

  private storageKey(userId: string): string {
    return `${PROFILE_STORAGE_PREFIX}${userId}`;
  }
}
