import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AppButton } from '../../ui/app-button/app-button';
import { BrandLink } from '../../ui/brand-link/brand-link';

@Component({
  selector: 'app-login-page',
  imports: [AppButton, BrandLink],
  templateUrl: './login-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  readonly email = input.required<string>();
  readonly password = input.required<string>();
  readonly rememberMe = input.required<boolean>();
  readonly passwordVisible = input.required<boolean>();
  readonly isSubmitting = input.required<boolean>();
  readonly loginError = input.required<string>();
  readonly canSubmit = input.required<boolean>();
  readonly learningHighlights = input.required<string[]>();

  readonly emailChanged = output<string>();
  readonly passwordChanged = output<string>();
  readonly rememberMeToggled = output<void>();
  readonly passwordVisibilityToggled = output<void>();
  readonly loginSubmitted = output<void>();

  protected inputValue(event: Event): string {
    const input = event.target;

    return input instanceof HTMLInputElement ? input.value : '';
  }
}
