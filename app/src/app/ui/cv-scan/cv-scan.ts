import { ChangeDetectionStrategy, Component, DestroyRef, inject, output, signal } from '@angular/core';
import { CareerPathService } from '../../services/career-path.service';
import { CvReadResult, CvTextService } from '../../services/cv-text.service';
import { CvMatch, matchCvText } from '../../utils/cv-match';
import { Button } from '../button/button';

const WRONG_FILE = 'Choose a PDF or Word (.docx) file up to 10 MB.';
const READ_ERRORS: Record<Extract<CvReadResult, { ok: false }>['reason'], string> = {
  type: WRONG_FILE,
  size: WRONG_FILE,
  unreadable: "We couldn't open this file.",
  'no-text': "We couldn't read text from this file (it may be a scanned image).",
};

/**
 * Reads a CV on this device, lists the career actions it mentions and saves the ones the learner confirms.
 * Only action IDs leave the browser; the file and its text are dropped once the matches are known.
 */
@Component({
  selector: 'app-cv-scan',
  imports: [Button],
  templateUrl: './cv-scan.html',
  styleUrl: './cv-scan.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CvScan {
  /** Emits the number of achievements saved; 0 when the learner cancels. */
  readonly done = output<number>();
  private readonly careerPath = inject(CareerPathService);
  private readonly cvText = inject(CvTextService);

  protected readonly state = signal<'choose' | 'reading' | 'results'>('choose');
  protected readonly problem = signal('');
  protected readonly dragging = signal(false);
  protected readonly found = signal<CvMatch[]>([]);
  protected readonly alreadyRecorded = signal<CvMatch[]>([]);
  protected readonly ticked = signal<ReadonlySet<string>>(new Set());
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');

  constructor() {
    // Matched CV snippets must not outlive the panel.
    inject(DestroyRef).onDestroy(() => this.reset());
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Lets the same file be chosen again, and keeps no reference to it.
    input.value = '';
    if (file) void this.scan(file);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.scan(file);
  }

  protected toggle(actionId: string, checked: boolean): void {
    this.ticked.update((ids) => {
      const next = new Set(ids);
      if (checked) next.add(actionId); else next.delete(actionId);
      return next;
    });
  }

  protected async save(): Promise<void> {
    const ids = this.found().map((match) => match.actionId).filter((id) => this.ticked().has(id));
    this.saving.set(true);
    this.saveError.set('');
    const result = await this.careerPath.recogniseFromCv(ids);
    this.saving.set(false);
    if (!result.ok) {
      this.saveError.set(result.message);
      return;
    }
    this.reset();
    this.done.emit(ids.length);
  }

  protected cancel(): void {
    this.reset();
    this.done.emit(0);
  }

  private async scan(file: File): Promise<void> {
    this.reset();
    this.state.set('reading');
    const result = await this.cvText.read(file);
    if (!result.ok) {
      this.showProblem(READ_ERRORS[result.reason]);
      return;
    }
    const { found, alreadyRecorded } = matchCvText(result.text, this.careerPath.paths(),
      this.careerPath.careers()?.satisfiedActionIds ?? []);
    if (!found.length && !alreadyRecorded.length) {
      this.showProblem("We didn't find any certifications we recognise.");
      return;
    }
    this.found.set(found);
    this.alreadyRecorded.set(alreadyRecorded);
    this.ticked.set(new Set(found.map((match) => match.actionId)));
    this.state.set('results');
  }

  private showProblem(message: string): void {
    this.problem.set(message);
    this.state.set('choose');
  }

  private reset(): void {
    this.state.set('choose');
    this.problem.set('');
    this.found.set([]);
    this.alreadyRecorded.set([]);
    this.ticked.set(new Set());
    this.saveError.set('');
  }
}
