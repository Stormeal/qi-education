import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TERMS_DOCUMENTS, type TermsDocumentId } from '../../legal/terms';
import { BrandLink } from '../../ui/brand-link/brand-link';

/** Renders the Terms of Service or the purchase terms, chosen by the route's `document` data. */
@Component({
  selector: 'app-terms-page',
  imports: [BrandLink, RouterLink],
  templateUrl: './terms-page.html',
  styleUrl: './terms-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsPage {
  protected readonly document = TERMS_DOCUMENTS[(inject(ActivatedRoute).snapshot.data['document'] as TermsDocumentId) ?? 'tos'];
}
