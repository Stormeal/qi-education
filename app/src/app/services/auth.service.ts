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
      return {
        ok: false,
        message: 'message' in body ? body.message ?? 'Unable to log in.' : 'Unable to log in.',
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
}
