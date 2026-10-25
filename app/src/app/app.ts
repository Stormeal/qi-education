import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialog } from './ui/confirm-dialog/confirm-dialog';
import { AppStateService } from './services/app-state.service';
import { FeedbackDialog } from './ui/feedback-dialog/feedback-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmDialog, FeedbackDialog],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly state = inject(AppStateService);
}
