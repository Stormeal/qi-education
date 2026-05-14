import { Injectable, inject } from '@angular/core';
import { LoginResponse } from '../app.models';
import { ApiClientService } from './api-client.service';

export type LoginResult =
  | {
      ok: true;
      login: LoginResponse;
    }
  | {
      ok: false;
      message: string;
    };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiClient = inject(ApiClientService);

  async login(email: string, password: string): Promise<LoginResult> {
    const response = await this.apiClient.fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
      }),
    });
    const body = (await response.json()) as LoginResponse | { message?: string };

    if (!response.ok) {
      const message = 'message' in body ? body.message ?? 'Unable to log in.' : 'Unable to log in.';

      return {
        ok: false,
        message: this.loginFailureMessage(message, response),
      };
    }

    return {
      ok: true,
      login: body as LoginResponse,
    };
  }

  async restoreSession(token: string): Promise<Omit<LoginResponse, 'token'> | null> {
    const response = await this.apiClient.fetch('/me', {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as Omit<LoginResponse, 'token'>;
  }

  private loginFailureMessage(message: string, response: Response): string {
    const authStorage = response.headers.get('x-qi-education-auth-storage');
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (response.status === 401 && isLocalhost && authStorage === 'memory') {
      return `${message}. Local API is using demo users because api/.env is missing or incomplete. Run npm run env:pull for shared users, or use teacher@qi-education.local / Password123!.`;
    }

    return message;
  }
}
