import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

export type TurnstileOptions = {
  sitekey: string; theme: 'light'; size: 'flexible'; callback: (token: string) => void;
  'expired-callback': () => void; 'error-callback': () => void; 'timeout-callback': () => void;
};
export type TurnstileApi = {
  render(host: HTMLElement, options: TurnstileOptions): string;
  reset(id: string): void; remove(id: string): void;
};
declare global { interface Window { turnstile?: TurnstileApi; } }

@Injectable({ providedIn: 'root' })
export class TurnstileService {
  private readonly document = inject(DOCUMENT);
  private loading?: Promise<TurnstileApi>;
  load(): Promise<TurnstileApi> {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    return this.loading ??= new Promise<TurnstileApi>((resolve, reject) => {
      const script = this.document.createElement('script');
      const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('Human check unavailable')); };
      const timer = setTimeout(fail, 10_000);
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.addEventListener('load', () => {
        clearTimeout(timer);
        if (window.turnstile) resolve(window.turnstile); else fail();
      }, { once: true });
      script.addEventListener('error', fail, { once: true });
      this.document.head.append(script);
    }).catch(error => { this.loading = undefined; throw error; });
  }
}
