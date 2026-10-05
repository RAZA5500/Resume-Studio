import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { errorMessage } from '../../core/utils/http';

/** The name the API gives an account when the provider shared none and the email gave none either. */
const PLACEHOLDER_NAME = 'ResumeStudio user';
/** Same rule as the API (no links or angle brackets in names). */
const PLAIN_NAME = /^(?![\s\S]*(?:https?:\/\/|www\.|[<>]))[\s\S]*$/i;
const PROVIDER_NAMES = { google: 'Google', apple: 'Apple' } as const;

/**
 * Right after signing up with Google / Apple: the account took its name from the provider, so the
 * person keeps it with one tap or changes it before they start (it goes on their resumes). When the
 * provider shared no name (the API made one from the email address), they type it instead.
 */
@Component({
  selector: 'app-name-step',
  imports: [FormsModule],
  template: `
    <div class="name-step">
      <span class="ns-ic" aria-hidden="true"><span class="i">badge</span></span>
      <h1>{{ fromProvider() ? 'Is this your name?' : 'What is your name?' }}</h1>
      <p class="muted">
        @if (fromProvider()) {
          We took it from your {{ provider }} account. Keep it, or change it to the way you want it on your resumes.
        } @else {
          {{ provider }} did not share your name. Enter it the way you want it on your resumes.
        }
      </p>

      <form class="stack" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="ns-name">Full name</label>
          <input
            #nameInput
            id="ns-name"
            class="input"
            name="fullName"
            autocomplete="name"
            maxlength="120"
            placeholder="Sara Khan"
            [readonly]="busy()"
            [ngModel]="name()"
            (ngModelChange)="name.set($event); error.set('')" />
        </div>
        @if (error()) {
          <div class="alert danger" role="alert"><span class="i">error</span><span>{{ error() }}</span></div>
        }
        <button
          #submitButton
          class="btn btn-primary btn-lg btn-block"
          type="submit"
          [disabled]="busy()"
          [attr.aria-label]="changed() ? null : 'Keep the name ' + original">
          @if (busy()) {
            <span class="spinner"></span>
          }
          {{ changed() ? 'Save name' : 'Keep this name' }}
        </button>
      </form>
      @if (fromProvider() && changed()) {
        <button type="button" class="link" [disabled]="busy()" (click)="useProviderName()">
          Use my {{ provider }} name: {{ original }}
        </button>
      }
    </div>
  `,
  styles: `
    .name-step { display: flex; flex-direction: column; gap: 14px; }
    .ns-ic {
      width: 52px; height: 52px; display: grid; place-items: center; border-radius: 16px;
      color: #fff; background: var(--grad-brand); box-shadow: 0 14px 30px -14px rgba(37, 99, 235, 0.9);
      animation: pop-in 0.45s var(--ease-spring) both;
    }
    .ns-ic .i { font-size: 28px; }
    h1 { font-size: clamp(24px, 2.4vw, 28px); letter-spacing: -0.035em; }
    .link {
      align-self: flex-start; border: 0; background: none; padding: 4px 0; font: inherit; font-size: 13px;
      font-weight: 600; color: var(--primary-700); cursor: pointer; text-align: left; overflow-wrap: anywhere;
    }
    .link:hover:not(:disabled) { text-decoration: underline; }
    .link:disabled { opacity: 0.6; cursor: default; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NameStep {
  private readonly auth = inject(AuthService);

  /** From the API: the name is the one Google / Apple shared, not one made from the email address. */
  readonly nameFromProvider = input<boolean | undefined>(undefined);
  /** The name is settled (kept or saved); the sign-in continues. */
  readonly done = output<void>();

  /** The name the account was created with. */
  protected readonly original = this.auth.user()?.fullName ?? '';
  protected readonly provider = PROVIDER_NAMES[this.auth.user()?.providers?.[0] ?? 'google'];
  // An older API does not say where the name came from: then only its placeholder counts as "none".
  protected readonly fromProvider = computed(() => this.nameFromProvider() ?? (!!this.original && this.original !== PLACEHOLDER_NAME));
  protected readonly name = linkedSignal(() => (this.fromProvider() ? this.original : ''));
  protected readonly changed = computed(() => clean(this.name()) !== this.original);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly submitButton = viewChild<ElementRef<HTMLButtonElement>>('submitButton');

  constructor() {
    // A name to confirm: focus "Keep this name" (Enter keeps it, no phone keyboard pops up).
    // No name yet: the cursor goes into the field.
    afterNextRender(() => (this.fromProvider() ? this.submitButton() : this.nameInput())?.nativeElement.focus());
  }

  protected useProviderName(): void {
    if (this.busy()) return;
    this.name.set(this.original);
    this.error.set('');
  }

  protected submit(): void {
    if (this.busy()) return;
    if (!this.changed()) {
      // Settled: a second tap must not start the sign-in flow again.
      this.busy.set(true);
      this.done.emit();
      return;
    }
    const fullName = clean(this.name());
    if (nameLength(fullName) < 2) return this.error.set('Please enter your full name.');
    if (nameLength(fullName) > 120) return this.error.set('Please keep your name under 120 characters.');
    if (!PLAIN_NAME.test(fullName)) return this.error.set('Please enter your name without links or < > symbols.');
    this.busy.set(true);
    this.error.set('');
    this.auth.updateProfile({ fullName }).subscribe({
      next: () => this.done.emit(),
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

/** Like the API: no invisible characters, single spaces. */
function clean(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Length as the API counts it (validator.js isLength: a surrogate pair or emoji variation is one character). */
function nameLength(value: string): number {
  const pairs = value.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0;
  const variations = value.match(/[︎️]/g)?.length ?? 0;
  return value.length - pairs - variations;
}
