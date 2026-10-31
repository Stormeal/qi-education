import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** Five stars: a read-only display, or (editable) five buttons that pick 1-5 (US-L028). */
@Component({
  selector: 'app-star-rating',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (editable()) {
      <div class="stars" role="group" [attr.aria-label]="label()">
        @for (n of steps; track n) {
          <button type="button" class="star" [class.filled]="n <= value()" [attr.aria-pressed]="n === value()"
            [attr.aria-label]="n + (n === 1 ? ' star' : ' stars')" [disabled]="disabled()" (click)="valueChange.emit(n)">★</button>
        }
      </div>
    } @else {
      <span class="stars" role="img" [attr.aria-label]="rounded() + ' out of 5 stars'">
        @for (n of steps; track n) { <span class="star" [class.filled]="n <= rounded()" aria-hidden="true">★</span> }
      </span>
    }
  `,
  styles: `
    :host { display: inline-flex; }
    .stars { display: inline-flex; gap: 2px; line-height: 1; }
    .star { color: var(--color-border-strong); font-size: 1em; }
    .star.filled { color: var(--color-highlight-ink); }
    button.star {
      border: 0; background: none; padding: 4px; border-radius: var(--radius-control);
      font-size: 1.6em; cursor: pointer; transition: transform 120ms ease;
    }
    button.star:hover:not(:disabled) { transform: scale(1.12); }
    button.star:disabled { cursor: default; }
    @media (prefers-reduced-motion: reduce) { button.star { transition: none; } }
  `,
})
export class StarRating {
  readonly value = input(0);
  readonly editable = input(false);
  readonly disabled = input(false);
  readonly label = input('Rating');
  readonly valueChange = output<number>();
  protected readonly steps = [1, 2, 3, 4, 5];
  protected readonly rounded = computed(() => Math.round(this.value()));
}
