import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppStateService } from '../../services/app-state.service';
import { BrandLink } from '../../ui/brand-link/brand-link';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { PageHeader } from '../../ui/page-header/page-header';

/** What QI Academy is and who makes it. Company facts are taken from testhuset.dk (read 2026-10-24). */
@Component({
  selector: 'app-about-page',
  imports: [BrandLink, FeedbackDialog, PageHeader, RouterLink],
  templateUrl: './about-page.html',
  styleUrls: ['../../app.scss', './about-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPage {
  protected readonly state = inject(AppStateService);
}
