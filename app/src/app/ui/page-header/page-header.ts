import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
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
}
