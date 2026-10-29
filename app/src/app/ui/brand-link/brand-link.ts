import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

type BrandLinkAppearance = 'dark' | 'light';
type BrandLinkSize = 'default' | 'large';

@Component({
  selector: 'app-brand-link',
  imports: [RouterLink],
  templateUrl: './brand-link.html',
  styleUrl: './brand-link.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandLink {
  readonly href = input('/');
  readonly label = input('QI Academy');
  readonly ariaLabel = input('QI Academy home');
  readonly appearance = input<BrandLinkAppearance>('dark');
  readonly size = input<BrandLinkSize>('default');
  readonly compact = input(false);
}
