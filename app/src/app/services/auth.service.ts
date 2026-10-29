import { Injectable, inject } from '@angular/core';
import { LoginResponse, SignupRequest } from '../app.models';
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

export type SignupResult =
  | {
      ok: true;
      login: LoginResponse;
    }
  | {
      ok: false;
      message: string;
    };

export type PasswordResetResult = { ok: true } | { ok: false; invalid: boolean; message: string };

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

  async signup(input: SignupRequest): Promise<SignupResult> {
    const response = await this.apiClient.fetch('/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: input.displayName.trim(),
        email: input.email.trim(),
        password: input.password,
        turnstileToken: input.turnstileToken,
      }),
    });
    const body = (await response.json()) as LoginResponse | { message?: string };

    if (!response.ok) {
      const message =
        'message' in body ? body.message ?? 'Unable to create your account.' : 'Unable to create your account.';

      return {
        ok: false,
        message: message === 'human-check-failed'
          ? 'The human check could not be verified. Please retry, or refresh this page.' : message,
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

    // 401: the session is not valid. Any other failure says nothing about the session.
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('The session could not be checked.');

    return (await response.json()) as Omit<LoginResponse, 'token'>;
  }

  /** US-L004. The reply is the same whether or not the address has an account. */
  async requestPasswordReset(email: string): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
    const result = await this.passwordReset('request', { email: email.trim() });
    return result.status === 202
      ? { ok: true, message: result.message || 'If an account exists for this address, we have sent a reset link.' }
      : { ok: false, message: result.message || 'We could not send email right now. Please try again later.' };
  }

  checkPasswordReset(token: string): Promise<PasswordResetResult> {
    return this.linkOutcome('/auth/password-reset/check', { token });
  }

  confirmPasswordReset(token: string, password: string): Promise<PasswordResetResult> {
    return this.linkOutcome('/auth/password-reset/confirm', { token, password });
  }

  /** US-L014. Needs no sign-in: the link may be opened on another device. */
  confirmEmail(token: string): Promise<PasswordResetResult> {
    return this.linkOutcome('/auth/email-confirmation/confirm', { token });
  }

  /** US-L014. `confirmed` is true when the account turned out to be confirmed already (204). */
  async resendEmailConfirmation(sessionToken: string): Promise<{ confirmed: boolean; message: string }> {
    const result = await this.postJson('/auth/email-confirmation/resend', {}, sessionToken);
    if (result.status === 204) return { confirmed: true, message: '' };
    return { confirmed: false, message: result.message || 'We could not send email right now. Please try again later.' };
  }

  /** US-L013. A wrong current password is a 400 from the API, never a 401, so the session survives it. */
  async changePassword(token: string, currentPassword: string, newPassword: string): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const response = await this.apiClient.fetch('/users/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (response.status === 204) return { ok: true };
      const json = await response.json().catch(() => ({})) as { message?: string };
      return { ok: false, message: json.message ?? 'Your password was not changed. Please try again.' };
    } catch {
      return { ok: false, message: 'Unable to reach the API. Please try again.' };
    }
  }

  private async linkOutcome(path: string, body: unknown): Promise<PasswordResetResult> {
    const result = await this.postJson(path, body);
    if (result.status === 204) return { ok: true };
    // 410: the link is unknown, expired or used. Anything else can be retried with the same link.
    return { ok: false, invalid: result.status === 410, message: result.message || 'Something went wrong. Please try again.' };
  }

  private passwordReset(step: string, body: unknown): Promise<{ status: number; message: string }> {
    return this.postJson(`/auth/password-reset/${step}`, body);
  }

  private async postJson(path: string, body: unknown, sessionToken?: string): Promise<{ status: number; message: string }> {
    try {
      const response = await this.apiClient.fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}) },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({})) as { message?: string };
      return { status: response.status, message: json.message ?? '' };
    } catch {
      return { status: 0, message: 'Unable to reach the API. Please try again.' };
    }
  }

  private loginFailureMessage(message: string, response: Response): string {
    const authStorage = response.headers.get('x-qi-education-auth-storage');
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (response.status === 401 && isLocalhost && authStorage === 'memory') {
      return `${message}. The local API is running with demo users (isolated stores). Use teacher@qi-education.local / Password123!, or start it with USE_SHARED_SERVICES=1 to use the shared accounts.`;
    }

    return message;
  }
}
