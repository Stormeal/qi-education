import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { AppButton } from '../app-button/app-button';
import { BrandLink } from '../brand-link/brand-link';
import { ProfileMenu } from '../profile-menu/profile-menu';

export type PageHeaderSection = 'home' | 'courses' | 'library' | 'admin' | 'editor';

@Component({
  selector: 'app-page-header',
  imports: [AppButton, BrandLink, ProfileMenu],
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  private readonly document = inject(DOCUMENT);
  readonly displayName = input.required<string>();
  readonly email = input.required<string>();
  readonly roleLabel = input.required<string>();
  readonly canAccessAdmin = input(false);
  readonly activeSection = input<PageHeaderSection>('home');
  readonly aboutHref = input('#actions');
  readonly otherPagesHref = input('#actions');

  readonly homeClicked = output<void>();
  readonly coursesClicked = output<void>();
  readonly libraryClicked = output<void>();
  readonly feedbackOpened = output<void>();
  readonly loggedOut = output<void>();
  readonly adminClicked = output<void>();

  protected navigateToAnchor(event: MouseEvent, href: string): void {
    if (!href.startsWith('#')) {
      return;
    }

    event.preventDefault();
    const target = this.document.querySelector(href);

    if (!(target instanceof HTMLElement)) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const location = this.document.defaultView?.location;
    const nextUrl = location ? `${location.pathname}${location.search}${href}` : href;
    this.document.defaultView?.history.replaceState(null, '', nextUrl);
  }
}
