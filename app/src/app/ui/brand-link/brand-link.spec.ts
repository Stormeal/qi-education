import { APP_BASE_HREF } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BrandLink } from './brand-link';

describe('BrandLink', () => {
  it('uses the configured app base href for the home link', async () => {
    await TestBed.configureTestingModule({
      imports: [BrandLink],
      providers: [
        provideRouter([]),
        { provide: APP_BASE_HREF, useValue: '/qi-education/' },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(BrandLink);
    fixture.detectChanges();

    const anchor = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('/qi-education/');
  });
});
