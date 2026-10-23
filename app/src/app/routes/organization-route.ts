import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { OrganizationPage } from '../pages/organization-page/organization-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';

@Component({
  selector: 'app-organization-route',
  imports: [OrganizationPage, LoginPage],
  templateUrl: './organization-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationRoute {
  protected readonly state = inject(AppStateService);
}
