import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { OrganizationService } from '../../services/organization.service';
import { Button } from '../button/button';

/** US-O001-AC11: a display-only organization price, saved on its own. Nothing is charged. */
@Component({
  selector: 'app-organization-price-field',
  imports: [Button],
  template: `
    <div class="price-field org-price">
      <label [for]="fieldId()">{{ kind() === 'career' ? 'Organization seat price per month (DKK)' : 'Organization add-on price per month (DKK)' }}</label>
      <div class="org-price-row">
        <input [id]="fieldId()" type="text" inputmode="numeric" [value]="value()" (input)="update($event)"
          [attr.aria-describedby]="fieldId() + '-help'" />
        <button appButton="secondary" size="sm" type="button" [disabled]="saving()" (click)="save()">Save price</button>
      </div>
      @if (error()) {
        <small [id]="fieldId() + '-help'" role="alert" class="org-price-error">{{ error() }}</small>
      } @else {
        <small [id]="fieldId() + '-help'">{{ saved() ? 'Saved.' : 'Shown to organization owners. Nothing is charged yet. Leave empty for no price.' }}</small>
      }
    </div>
  `,
  styles: `
    .org-price { display: grid; gap: 6px; }
    .org-price-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .org-price-row input { max-width: 160px; }
    .org-price small { color: var(--color-text-muted); font-size: var(--text-caption); }
    .org-price .org-price-error { color: var(--color-danger); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationPriceField {
  readonly authToken = input.required<string>();
  readonly kind = input.required<'career' | 'course'>();
  readonly resourceId = input.required<string>();

  private readonly organizations = inject(OrganizationService);
  protected readonly value = signal('');
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly fieldId = () => `org-price-${this.kind()}-${this.resourceId()}`;

  constructor() {
    effect(() => {
      const [token, kind, id] = [this.authToken(), this.kind(), this.resourceId()];
      if (token && id) untracked(() => void this.load(token, kind, id));
    });
  }

  private async load(token: string, kind: 'career' | 'course', id: string): Promise<void> {
    const result = await this.organizations.prices(token);
    if (!result.ok) return;
    const price = (kind === 'career' ? result.body.careers : result.body.courses)[id];
    this.value.set(price == null ? '' : String(price));
  }

  protected update(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
    this.saved.set(false);
  }

  protected async save(): Promise<void> {
    const text = this.value().trim();
    const price = text === '' ? null : Number(text);
    if (price !== null && !(Number.isInteger(price) && price >= 0 && price <= 999_999 && /^\d+$/.test(text))) {
      this.error.set('Enter a whole number of DKK from 0 to 999,999, or leave it empty.');
      return;
    }
    this.error.set('');
    this.saving.set(true);
    const result = this.kind() === 'career'
      ? await this.organizations.setCareerPrice(this.authToken(), this.resourceId(), price)
      : await this.organizations.setCoursePrice(this.authToken(), this.resourceId(), price);
    this.saving.set(false);
    if (result.ok) this.saved.set(true);
    else this.error.set(result.message);
  }
}
