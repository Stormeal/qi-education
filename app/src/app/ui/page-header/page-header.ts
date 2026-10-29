import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Icon } from '../icon/icon';
import { NotificationBell } from '../notification-bell/notification-bell';
import { RouterLink } from '@angular/router';
import { Button } from '../button/button';
import { BrandLink } from '../brand-link/brand-link';
import { ProfileMenu } from '../profile-menu/profile-menu';

export type PageHeaderSection = 'home' | 'courses' | 'library' | 'admin' | 'editor' | 'profile' | 'career-path' | 'roadmap' | 'about';

@Component({
  selector: 'app-page-header',
  imports: [Button, BrandLink, ProfileMenu, RouterLink, Icon, NotificationBell],
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeMobileMenu()', '(document:click)': 'closeWhenOutside($event)' },
})
export class PageHeader {
  readonly displayName = input.required<string>();
  readonly email = input.required<string>();
  readonly roleLabel = input.required<string>();
  readonly canAccessAdmin = input(false);
  readonly activeSection = input<PageHeaderSection>('home');
  readonly otherPagesHref = input('#actions');
  readonly unreadCount = input<number | undefined>(undefined);
  readonly notificationsOpened = output<void>();
  protected readonly mobileMenuOpen = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly menuTrigger = viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');
  protected closeMobileMenu(restoreFocus = true): void {
    if (!this.mobileMenuOpen()) return;
    this.mobileMenuOpen.set(false);
    if (restoreFocus) this.menuTrigger()?.nativeElement.focus();
  }
  protected closeWhenOutside(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.closeMobileMenu(false);
  }
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
