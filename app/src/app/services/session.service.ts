import { Injectable, inject } from '@angular/core';
import { LoginResponse, LoginState } from '../app.models';
import { ApiClientService } from './api-client.service';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly apiClient = inject(ApiClientService);

  setSessionContextProvider(provider: () => unknown): void {
    this.apiClient.setSessionContextProvider(provider);
  }

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

  /** True when the session stored in this browser had outlived its token (US-P010-AC03). */
  expiredOnRestore = false;

  // The token is header.payload.signature; the payload carries its own expiry in seconds.
  // A token that cannot be read is left for the API to judge.
  private tokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
      return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
    } catch {
      return false;
    }
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

      if (this.tokenExpired(session.token)) {
        this.expiredOnRestore = true;
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
