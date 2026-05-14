import { Injectable, inject } from '@angular/core';
import { LoginResponse, LoginState } from '../app.models';
import { ApiClientService } from './api-client.service';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly apiClient = inject(ApiClientService);

  storeSession(login: LoginResponse, rememberMe: boolean): void {
    const storage = rememberMe ? window.localStorage : window.sessionStorage;
    const otherStorage = rememberMe ? window.sessionStorage : window.localStorage;

    otherStorage.removeItem('qiEducationSession');
    storage.setItem(
      'qiEducationSession',
      JSON.stringify({
        token: login.token,
        user: login.user,
        permissions: login.permissions,
      }),
    );
  }

  updateStoredLoginState(loginState: LoginState): void {
    const storage =
      window.localStorage.getItem('qiEducationSession') !== null
        ? window.localStorage
        : window.sessionStorage;

    storage.setItem('qiEducationSession', JSON.stringify(loginState));
  }

  clearStoredSession(): void {
    window.localStorage.removeItem('qiEducationSession');
    window.sessionStorage.removeItem('qiEducationSession');
    this.apiClient.clearCache();
  }

  onUnauthorized(handler: () => void): () => void {
    return this.apiClient.onUnauthorized(() => {
      this.clearStoredSession();
      handler();
    });
  }

  restoreLoginState(): LoginState | null {
    const rawSession =
      window.localStorage.getItem('qiEducationSession') ??
      window.sessionStorage.getItem('qiEducationSession');

    if (!rawSession) {
      return null;
    }

    try {
      const session = JSON.parse(rawSession) as {
        token?: string;
        user: LoginResponse['user'];
        permissions: LoginResponse['permissions'];
      };

      if (!session.token) {
        this.clearStoredSession();
        return null;
      }

      return {
        token: session.token,
        user: session.user,
        permissions: session.permissions,
      };
    } catch {
      this.clearStoredSession();
      return null;
    }
  }
}
