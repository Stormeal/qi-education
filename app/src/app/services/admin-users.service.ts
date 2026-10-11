import { Injectable, inject } from '@angular/core';
import { ApiClientService } from './api-client.service';

export type AdminUserRole = 'student' | 'teacher' | 'admin';
export type AdminUser = { id: string; email: string; displayName: string; role: AdminUserRole; status: string; createdAt: string };
export type AdminUserChange = { id: string; at: string; actor: { id: string; displayName: string };
  target: { id: string; displayName: string; email: string }; field: 'role' | 'status'; from: string; to: string };
export type AdminUsersResult<T> = { ok: true; body: T } | { ok: false; message: string };

/** US-A001: admins search users, change a role and send a password reset link. */
@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly apiClient = inject(ApiClientService);

  search(token: string, text: string): Promise<AdminUsersResult<{ users: AdminUser[]; total: number }>> {
    const query = text.trim() ? `?search=${encodeURIComponent(text.trim())}` : '';
    return this.request(token, `/admin/users${query}`);
  }

  changeRole(token: string, userId: string, role: AdminUserRole): Promise<AdminUsersResult<AdminUser>> {
    return this.request(token, `/admin/users/${encodeURIComponent(userId)}/role`, 'PATCH', { role });
  }

  changeStatus(token: string, userId: string, status: 'active' | 'disabled'): Promise<AdminUsersResult<AdminUser>> {
    return this.request(token, `/admin/users/${encodeURIComponent(userId)}/status`, 'PATCH', { status });
  }

  listChanges(token: string): Promise<AdminUsersResult<{ changes: AdminUserChange[] }>> {
    return this.request(token, '/admin/users/changes');
  }

  sendPasswordReset(token: string, userId: string): Promise<AdminUsersResult<{ message: string }>> {
    return this.request(token, `/admin/users/${encodeURIComponent(userId)}/password-reset`, 'POST');
  }

  private async request<T>(token: string, path: string, method = 'GET', body?: unknown): Promise<AdminUsersResult<T>> {
    try {
      const response = await this.apiClient.fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = await response.json().catch(() => ({}));
      return response.ok ? { ok: true, body: json as T } : { ok: false, message: json.message ?? 'The request could not be completed.' };
    } catch {
      return { ok: false, message: 'Unable to reach the API. Please try again.' };
    }
  }
}
