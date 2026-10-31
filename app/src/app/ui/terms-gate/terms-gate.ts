import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';
import { TERMS_DOCUMENTS } from '../../legal/terms';
import { Button } from '../button/button';

/** US-P022: blocks the app until the current Terms of Service are accepted. The page behind is inert. */
@Component({
  selector: 'app-terms-gate',
  imports: [Button],
  templateUrl: './terms-gate.html',
  styleUrl: './terms-gate.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsGate {
  readonly busy = input(false);
  readonly error = input('');
  readonly accepted = output<void>();
  readonly loggedOut = output<void>();
  protected readonly document = TERMS_DOCUMENTS.tos;
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
  }
}
