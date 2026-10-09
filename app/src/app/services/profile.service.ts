import { Injectable } from '@angular/core';
import { UserProfileDetails } from '../app.models';

const PROFILE_STORAGE_PREFIX = 'qiEducationProfile:';

/** Default initials-avatar color, matching the forest green used in the header. */
export const DEFAULT_AVATAR_COLOR = '#2f4f43';

/**
 * Stores the user-authored part of a profile (bio, role, goals, avatar color).
 *
 * This data is not yet part of the account record on the API, so it is kept on
 * the device keyed by user id. When a `PATCH /me` endpoint exists, swap the two
 * storage calls below for API requests. The rest of the app talks to this
 * service, not to localStorage directly.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  loadProfile(userId: string): UserProfileDetails {
    if (!userId) {
      return this.emptyProfile();
    }

    try {
      const raw = window.localStorage.getItem(this.storageKey(userId));

      if (!raw) {
        return this.emptyProfile();
      }

      const parsed = JSON.parse(raw) as Partial<UserProfileDetails>;

      return {
        bio: typeof parsed.bio === 'string' ? parsed.bio : '',
        jobTitle: typeof parsed.jobTitle === 'string' ? parsed.jobTitle : '',
        company: typeof parsed.company === 'string' ? parsed.company : '',
        learningGoals: typeof parsed.learningGoals === 'string' ? parsed.learningGoals : '',
        avatarColor:
          typeof parsed.avatarColor === 'string' && parsed.avatarColor
            ? parsed.avatarColor
            : DEFAULT_AVATAR_COLOR,
      };
    } catch {
      return this.emptyProfile();
    }
  }

  saveProfile(userId: string, details: UserProfileDetails): void {
    if (!userId) {
      return;
    }

    window.localStorage.setItem(this.storageKey(userId), JSON.stringify(details));
  }

  private emptyProfile(): UserProfileDetails {
    return {
      bio: '',
      jobTitle: '',
      company: '',
      learningGoals: '',
      avatarColor: DEFAULT_AVATAR_COLOR,
    };
  }

  private storageKey(userId: string): string {
    return `${PROFILE_STORAGE_PREFIX}${userId}`;
  }
}
