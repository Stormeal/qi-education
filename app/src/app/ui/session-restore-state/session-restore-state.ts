import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-session-restore-state',
  templateUrl: './session-restore-state.html',
  styleUrl: './session-restore-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionRestoreState {}
