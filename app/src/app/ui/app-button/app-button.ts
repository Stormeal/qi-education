import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

type AppButtonType = 'button' | 'submit' | 'reset';
type AppButtonVariant = 'outline' | 'primary' | 'ghost' | 'login-submit';

@Component({
  selector: 'app-button',
  templateUrl: './app-button.html',
  styleUrl: './app-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppButton {
  readonly type = input<AppButtonType>('button');
  readonly variant = input<AppButtonVariant>('outline');
  readonly disabled = input(false);
  readonly ariaLabel = input<string | null>(null);

  readonly buttonClicked = output<void>();
}
