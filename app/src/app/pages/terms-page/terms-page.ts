import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandLink } from '../../ui/brand-link/brand-link';

@Component({
  selector: 'app-terms-page',
  imports: [BrandLink, RouterLink],
  templateUrl: './terms-page.html',
  styleUrl: './terms-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsPage {}
