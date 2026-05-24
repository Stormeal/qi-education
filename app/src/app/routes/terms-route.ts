import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TermsPage } from '../pages/terms-page/terms-page';

@Component({
  selector: 'app-terms-route',
  imports: [TermsPage],
  template: '<app-terms-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsRoute {}
