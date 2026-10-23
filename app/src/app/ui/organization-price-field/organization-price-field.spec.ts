import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrganizationService } from '../../services/organization.service';
import { OrganizationPriceField } from './organization-price-field';

describe('organization price field (US-O001-AC11)', () => {
  let fixture: ComponentFixture<OrganizationPriceField>;
  let saved: unknown[];

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    saved = [];
    const ok = <T>(body: T) => Promise.resolve({ ok: true as const, body });
    await TestBed.configureTestingModule({ imports: [OrganizationPriceField], providers: [
      { provide: OrganizationService, useValue: {
        prices: () => ok({ careers: { p1: 499 }, courses: {} }),
        setCareerPrice: (_t: string, id: string, price: number | null) => { saved.push(['career', id, price]); return ok({ careers: {}, courses: {} }); },
        setCoursePrice: (_t: string, id: string, price: number | null) => { saved.push(['course', id, price]); return ok({ careers: {}, courses: {} }); },
      } },
    ] }).compileComponents();
  });

  async function render(kind: 'career' | 'course', id: string) {
    fixture = TestBed.createComponent(OrganizationPriceField);
    fixture.componentRef.setInput('authToken', 'token');
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('resourceId', id);
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); }
    return fixture.nativeElement as HTMLElement;
  }
  const set = (page: HTMLElement, value: string) => {
    const input = page.querySelector('input')!; input.value = value; input.dispatchEvent(new Event('input'));
  };
  const save = async (page: HTMLElement) => {
    [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Save price')!.click();
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); }
  };

  it('shows the stored seat price and its label', async () => {
    const page = await render('career', 'p1');
    expect(page.querySelector('label')?.textContent).toContain('Organization seat price per month (DKK)');
    expect(page.querySelector('input')!.value).toBe('499');
  });

  it('saves an empty field as no price', async () => {
    const page = await render('course', 'c1');
    expect(page.querySelector('label')?.textContent).toContain('Organization add-on price per month (DKK)');
    set(page, '');
    await save(page);
    expect(saved).toEqual([['course', 'c1', null]]);
  });

  it('refuses a price outside 0 to 999,999 without saving', async () => {
    const page = await render('career', 'p1');
    set(page, '1000000');
    await save(page);
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Enter a whole number of DKK from 0 to 999,999, or leave it empty.');
    expect(saved).toEqual([]);
  });
});
