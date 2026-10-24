import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '../button/button';
import { BrandLink } from '../brand-link/brand-link';
import { ProfileMenu } from '../profile-menu/profile-menu';

export type PageHeaderSection = 'home' | 'courses' | 'library' | 'admin' | 'editor' | 'profile' | 'career-path' | 'roadmap' | 'about';

@Component({
  selector: 'app-page-header',
  imports: [Button, BrandLink, ProfileMenu, RouterLink],
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
  readonly otherPagesHref = input('#actions');
  protected readonly homeHref = '/';
  protected readonly coursesHref = '/courses';
  protected readonly libraryHref = '/library';
  // The role label is the header's only role input (AppStateService.currentRoleLabel); teachers and admins see the roadmap.
  protected readonly canSeeRoadmap = computed(() => this.roleLabel() !== 'Student');

  readonly homeClicked = output<void>();
  readonly coursesClicked = output<void>();
  readonly libraryClicked = output<void>();
  readonly feedbackOpened = output<void>();
  readonly loggedOut = output<void>();
  readonly adminClicked = output<void>();
  readonly careerPathClicked = output<void>();
}
