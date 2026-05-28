import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-profile-menu',
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileMenu {
  private readonly router = inject(Router);

  readonly displayName = input.required<string>();
  readonly email = input.required<string>();
  readonly roleLabel = input.required<string>();
  readonly canAccessAdmin = input(false);

  readonly loggedOut = output<void>();
  readonly settingsSelected = output<void>();
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

  protected selectProfile(): void {
    this.closeMenu();
    void this.router.navigateByUrl('/profile');
  }

  protected selectSettings(): void {
    this.settingsSelected.emit();
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
