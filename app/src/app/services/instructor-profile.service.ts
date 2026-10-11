import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from './api-client.service';

export type PublicInstructorProfile = { description: string; courseIds: string[] };
export type AdminInstructorProfile = { userId: string; displayName: string; description: string };
export type InstructorProfileResult<T> = { ok: true; body: T } | { ok: false; message: string };

/** US-T007: a teacher's public description, linked to the published courses they own. */
@Injectable({ providedIn: 'root' })
export class InstructorProfileService {
  private readonly apiClient = inject(ApiClientService);
  private publicRequested = false;

  /** Set by AppStateService whenever the session changes. */
  readonly token = signal('');
  readonly publicProfiles = signal<PublicInstructorProfile[]>([]);

  /** The description of whoever owns one of these courses; empty when nobody wrote one. */
  descriptionFor(courseIds: string[]): string {
    return this.publicProfiles().find((profile) => profile.courseIds.some((id) => courseIds.includes(id)))?.description ?? '';
  }

  /** Cards fall back to their old text when this fails, so the failure is not shown. */
  async loadPublic(force = false): Promise<void> {
    if (this.publicRequested && !force) return;
    this.publicRequested = true;
    const result = await this.request<PublicInstructorProfile[]>('/instructors');
    if (result.ok && Array.isArray(result.body)) this.publicProfiles.set(result.body);
    else this.publicRequested = false;
  }

  loadOwn(): Promise<InstructorProfileResult<{ description: string }>> {
    return this.request('/users/me/instructor-profile');
  }

  async saveOwn(description: string): Promise<InstructorProfileResult<{ description: string }>> {
    const result = await this.request<{ description: string }>('/users/me/instructor-profile', 'PUT', { description });
    if (result.ok) void this.loadPublic(true);
    return result;
  }

  adminList(): Promise<InstructorProfileResult<AdminInstructorProfile[]>> {
    return this.request('/admin/instructor-profiles');
  }

  async adminClear(userId: string): Promise<InstructorProfileResult<unknown>> {
    const result = await this.request(`/admin/instructor-profiles/${encodeURIComponent(userId)}`, 'DELETE');
    if (result.ok) void this.loadPublic(true);
    return result;
  }

  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<InstructorProfileResult<T>> {
    try {
      const token = this.token();
      const response = await this.apiClient.fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = await response.json().catch(() => ({}));
      return response.ok ? { ok: true, body: json as T } : { ok: false, message: json.message ?? 'The request could not be completed.' };
    } catch {
      return { ok: false, message: 'Unable to reach the API. Please try again.' };
    }
  }
}
