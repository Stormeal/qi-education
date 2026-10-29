import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { lucideBell, lucideMenu, lucideMessageSquare, lucideSettings, lucideChevronDown, lucideChevronUp,
  lucideChevronLeft, lucideChevronRight, lucideX, lucideUser, lucideMail, lucideLockKeyhole, lucideCompass,
  lucideLogOut, lucideShield, lucideBriefcase, lucideBookOpen, lucideCheck, lucidePlus, lucideArrowRight,
  lucideArrowLeft, lucideUpload, lucideDownload, lucideEye, lucideEyeOff, lucideExternalLink, lucideSearch,
  lucideVideo, lucideTriangleAlert, lucideFileText, lucideAward, lucideUsers } from '@ng-icons/lucide';

const icons = { bell: lucideBell, menu: lucideMenu, message: lucideMessageSquare, settings: lucideSettings,
  chevronDown: lucideChevronDown, chevronUp: lucideChevronUp, chevronLeft: lucideChevronLeft, chevronRight: lucideChevronRight,
  close: lucideX, user: lucideUser, mail: lucideMail, lock: lucideLockKeyhole, compass: lucideCompass,
  logout: lucideLogOut, shield: lucideShield, briefcase: lucideBriefcase, book: lucideBookOpen, check: lucideCheck,
  plus: lucidePlus, arrowRight: lucideArrowRight, arrowLeft: lucideArrowLeft, upload: lucideUpload,
  download: lucideDownload, eye: lucideEye, eyeOff: lucideEyeOff, external: lucideExternalLink, search: lucideSearch,
  video: lucideVideo, alert: lucideTriangleAlert, file: lucideFileText, award: lucideAward, users: lucideUsers } as const;
export type IconName = keyof typeof icons;

/** Trusted package SVGs only; no user-provided markup. Matches the existing builder renderer. */
@Component({
  selector: 'app-icon', changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' }, template: `<span [innerHTML]="svg()"></span>`,
  styles: `:host { display: inline-flex; width: 1em; height: 1em; flex: 0 0 auto; line-height: 1; } span { display: inline-flex; width: 100%; height: 100%; }`,
})
export class Icon {
  readonly name = input.required<IconName>();
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly svg = computed(() => this.sanitizer.bypassSecurityTrustHtml(icons[this.name()].replace('<svg ', '<svg width="100%" height="100%" ')));
}
