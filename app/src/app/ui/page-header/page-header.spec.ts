import { APP_BASE_HREF } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('uses the configured app base href for navbar CTA links', async () => {
    await TestBed.configureTestingModule({
      imports: [PageHeader],
      providers: [
        provideRouter([]),
        { provide: APP_BASE_HREF, useValue: '/qi-education/' },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PageHeader);
    fixture.componentRef.setInput('displayName', 'Alex');
    fixture.componentRef.setInput('email', 'alex@example.com');
    fixture.componentRef.setInput('roleLabel', 'Admin');
    fixture.detectChanges();

    const links = Array.from(fixture.nativeElement.querySelectorAll('.tabs a')) as HTMLAnchorElement[];
    const hrefs = links.map((link) => link.getAttribute('href'));

    expect(hrefs).toContain('/qi-education/');
    expect(hrefs).toContain('/qi-education/courses');
    expect(hrefs).toContain('/qi-education/library');
  });
});
