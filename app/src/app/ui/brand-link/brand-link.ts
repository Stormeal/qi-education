import { ChangeDetectionStrategy, Component, input } from '@angular/core';

type BrandLinkAppearance = 'dark' | 'light';
type BrandLinkSize = 'default' | 'large';

@Component({
  selector: 'app-brand-link',
  templateUrl: './brand-link.html',
  styleUrl: './brand-link.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandLink {
  readonly href = input('/');
  readonly label = input('QI-Education');
  readonly ariaLabel = input('QI-Education home');
  readonly appearance = input<BrandLinkAppearance>('dark');
  readonly size = input<BrandLinkSize>('default');
}
