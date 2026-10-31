import { TestBed } from '@angular/core/testing';
import { CONSENT_VERSION, ConsentService } from '../../services/consent.service';
import { CookieConsent, CookieLink } from './cookie-consent';

const KEY = 'qi-education:cookie-consent';

describe('US-P021 cookie consent', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  const render = () => {
    const fixture = TestBed.createComponent(CookieConsent); fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const button = (label: string) => [...page.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!;
    return { fixture, page, button, consent: TestBed.inject(ConsentService) };
  };

  it('shows the banner with analytics off until a decision is recorded, then remembers it', () => {
    const { fixture, page, button, consent } = render();
    expect(page.textContent).toContain('We use only essential cookies needed to run the site.');
    expect(consent.pending()).toBe(true);
    expect(consent.hasConsent('essential')).toBe(true);
    expect(consent.hasConsent('analytics')).toBe(false);
    button('Accept').click(); fixture.detectChanges();
    expect(page.querySelector('.cc-panel')).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ version: CONSENT_VERSION, categories: { essential: true, analytics: false } });
    TestBed.resetTestingModule();
    expect(TestBed.inject(ConsentService).pending()).toBe(false);
  });

  it('lets the preferences panel turn analytics on, and the footer link reopens it', () => {
    const { fixture, page, button, consent } = render();
    button('Preferences').click(); fixture.detectChanges();
    const boxes = page.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(boxes[0].checked && boxes[0].disabled).toBe(true);
    boxes[1].click(); fixture.detectChanges();
    button('Save preferences').click(); fixture.detectChanges();
    expect(consent.hasConsent('analytics')).toBe(true);
    expect(page.querySelector('.cc-panel')).toBeNull();
    const link = TestBed.createComponent(CookieLink); link.detectChanges();
    (link.nativeElement as HTMLElement).querySelector('button')!.click(); fixture.detectChanges();
    expect(page.textContent).toContain('Cookie preferences');
    expect(page.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1].checked).toBe(true);
  });

  it('asks again when the consent version changes', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: CONSENT_VERSION - 1, decidedAt: '2026-10-01T00:00:00Z', categories: { essential: true, analytics: true } }));
    const { consent, page } = render();
    expect(consent.pending()).toBe(true);
    expect(consent.hasConsent('analytics')).toBe(false);
    expect(page.textContent).toContain('We use only essential cookies');
  });

  it('still renders defaults and the banner when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { fixture, page, button, consent } = render();
    expect(consent.hasConsent('analytics')).toBe(false);
    expect(page.textContent).toContain('We use only essential cookies');
    button('Accept').click(); fixture.detectChanges();
    expect(consent.pending()).toBe(false);
  });
});
