import { Icon } from '../icon/icon';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HeaderIdentityService } from '../../services/header-identity.service';

@Component({
  selector: 'app-profile-menu',
  imports: [Icon],
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // An open menu closes on a click or tap anywhere else, and on Escape.
  host: { '(document:click)': 'closeWhenOutside($event)', '(document:keydown.escape)': 'closeWithEscape()' },
})
export class ProfileMenu {
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly identity = inject(HeaderIdentityService);

  readonly displayName = input.required<string>();
  readonly email = input.required<string>();
  readonly roleLabel = input.required<string>();
  readonly canAccessAdmin = input(false);

  readonly loggedOut = output<void>();
  readonly settingsSelected = output<void>();
  readonly careerPathSelected = output<void>();
  readonly adminSelected = output<void>();

  protected readonly isOpen = signal(false);
  protected readonly initials = computed(() =>
    this.displayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((namePart) => namePart[0]?.toUpperCase())
      .join(''),
  );

  protected toggleMenu(): void {
    this.isOpen.update((value) => !value);
  }

  protected closeMenu(): void {
    this.isOpen.set(false);
  }

  protected closeWhenOutside(event: Event): void {
    if (this.isOpen() && !this.host.nativeElement.contains(event.target as Node)) this.closeMenu();
  }

  protected closeWithEscape(): void {
    if (!this.isOpen()) return;
    this.closeMenu();
    // Keyboard focus was inside the menu that just disappeared.
    this.host.nativeElement.querySelector<HTMLButtonElement>('.profile-trigger')?.focus();
  }

  protected selectProfile(): void {
    this.closeMenu();
    void this.router.navigateByUrl('/profile');
  }

  protected selectOrganization(): void {
    this.closeMenu();
    void this.router.navigateByUrl('/organization');
  }

  protected selectSettings(): void {
    this.settingsSelected.emit();
    this.closeMenu();
    void this.router.navigateByUrl('/settings');
  }

  protected selectCareerPath(): void {
    this.careerPathSelected.emit();
    this.closeMenu();
  }

  protected selectAdmin(): void {
    this.adminSelected.emit();
    this.closeMenu();
  }

  protected logout(): void {
    this.loggedOut.emit();
    this.closeMenu();
  }
}
