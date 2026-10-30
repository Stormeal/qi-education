import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialog } from './ui/confirm-dialog/confirm-dialog';
import { AppStateService } from './services/app-state.service';
import { FeedbackDialog } from './ui/feedback-dialog/feedback-dialog';
import { Button } from './ui/button/button';
import { NavigationRecoveryService } from './services/navigation-recovery.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmDialog, FeedbackDialog, Button],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly state = inject(AppStateService);
  protected readonly navigationRecovery = inject(NavigationRecoveryService);
}
