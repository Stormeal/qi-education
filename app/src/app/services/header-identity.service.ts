import { Injectable, signal } from '@angular/core';
import { DEFAULT_AVATAR_COLOR } from './profile.service';

/**
 * What the page header shows about the signed-in account. `AppStateService` writes it; the header only
 * reads it, because the header must not inject `AppStateService` (page specs fake its dependencies).
 */
@Injectable({ providedIn: 'root' })
export class HeaderIdentityService {
  /** The saved avatar colour, not one only picked in the profile form. */
  readonly avatarColor = signal(DEFAULT_AVATAR_COLOR);
  /** The organization the account belongs to; empty without one. */
  readonly organizationName = signal('');
}
