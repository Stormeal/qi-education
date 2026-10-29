import { TestBed } from '@angular/core/testing';
import { TurnstileChallenge } from './turnstile-challenge';
import { TurnstileService, type TurnstileApi, type TurnstileOptions } from '../../services/turnstile.service';

describe('US-P020 signup challenge lifecycle', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });
  it('renders lazily, emits/clears tokens, resets after failure and removes on destruction', async () => {
    let options!: TurnstileOptions;
    const api: TurnstileApi = { render: vi.fn((_host, input) => { options = input; return 'widget'; }), reset: vi.fn(), remove: vi.fn() };
    TestBed.configureTestingModule({ imports: [TurnstileChallenge] });
    const load = vi.spyOn(TestBed.inject(TurnstileService), 'load').mockResolvedValue(api);
    const fixture = TestBed.createComponent(TurnstileChallenge), tokens: string[] = [];
    fixture.componentInstance.tokenChanged.subscribe(token => tokens.push(token));
    fixture.detectChanges(); await fixture.whenStable();
    expect(load).not.toHaveBeenCalled();
    fixture.componentRef.setInput('siteKey', 'public-key');
    fixture.detectChanges(); await fixture.whenStable();
    expect(api.render).toHaveBeenCalled();
    options.callback('solved'); options['expired-callback']();
    expect(tokens.slice(-2)).toEqual(['solved', '']);
    fixture.componentRef.setInput('resetVersion', 1); fixture.detectChanges();
    expect(api.reset).toHaveBeenCalledWith('widget');
    options['error-callback'](); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Human check unavailable');
    fixture.destroy();
    expect(api.remove).toHaveBeenCalledWith('widget');
  });
});
