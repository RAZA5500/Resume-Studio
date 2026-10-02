import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { loadFonts } from '../../../core/utils/fonts';

/** Modal to draw or type a signature; emits a trimmed transparent PNG data URL. */
@Component({
  selector: 'app-signature-pad',
  imports: [FormsModule],
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <div class="modal wide" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3><span class="i">signature</span> Add signature</h3>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="closed.emit()"><span class="i">close</span></button>
        </div>
        <div class="modal-body stack">
          <div class="segmented">
            <button type="button" [class.active]="mode() === 'draw'" (click)="mode.set('draw')"><span class="i">draw</span> Draw</button>
            <button type="button" [class.active]="mode() === 'type'" (click)="mode.set('type')"><span class="i">keyboard</span> Type</button>
          </div>
          <div class="row row-wrap">
            @for (c of colors; track c) {
              <button type="button" class="swatch" [style.background]="c" [class.active]="color() === c" (click)="color.set(c); redrawTyped()"></button>
            }
            @if (mode() === 'draw') {
              <label class="small muted row">Thickness <input class="range" type="range" min="1.5" max="6" step="0.5" [ngModel]="width()" (ngModelChange)="width.set(+$event)" style="width: 120px" /></label>
            } @else {
              <select class="select select-sm" style="width: 170px" [ngModel]="font()" (ngModelChange)="font.set($event); redrawTyped()">
                <option value="Great Vibes">Great Vibes</option>
                <option value="Dancing Script">Dancing Script</option>
                <option value="Playfair Display">Playfair (italic)</option>
              </select>
              <input class="input input-sm grow" placeholder="Type your name" [ngModel]="typed()" (ngModelChange)="typed.set($event); redrawTyped()" />
            }
          </div>
          <div class="pad">
            <canvas #pad width="1200" height="360"
              (pointerdown)="start($event)" (pointermove)="move($event)" (pointerup)="end()" (pointerleave)="end()"></canvas>
            <span class="line"></span>
            @if (empty()) {
              <span class="hint">{{ mode() === 'draw' ? 'Sign here with your mouse, finger or stylus' : 'Type your name above' }}</span>
            }
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" type="button" (click)="clear()"><span class="i">ink_eraser</span> Clear</button>
          <div class="grow"></div>
          <button class="btn" type="button" (click)="closed.emit()">Cancel</button>
          <button class="btn btn-primary" type="button" [disabled]="empty()" (click)="insert()"><span class="i">check</span> Insert signature</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .pad { position: relative; border: 1px dashed var(--border-strong); border-radius: 12px; background: #fff; overflow: hidden; }
    canvas { display: block; width: 100%; height: auto; touch-action: none; cursor: crosshair; }
    .line { position: absolute; left: 6%; right: 6%; bottom: 26%; border-bottom: 1px solid #cbd5e1; pointer-events: none; }
    .hint { position: absolute; inset: 0; display: grid; place-items: center; color: var(--text-3); pointer-events: none; }
    .swatch { width: 26px; height: 26px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px var(--border-strong); cursor: pointer; }
    .swatch.active { box-shadow: 0 0 0 2px var(--primary); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignaturePad {
  readonly inserted = output<string>();
  readonly closed = output<void>();

  protected readonly mode = signal<'draw' | 'type'>('draw');
  protected readonly color = signal('#0f172a');
  protected readonly width = signal(3);
  protected readonly font = signal('Great Vibes');
  protected readonly typed = signal('');
  protected readonly empty = signal(true);
  protected readonly colors = ['#0f172a', '#1d4ed8', '#7c3aed', '#b91c1c'];

  private readonly pad = viewChild.required<ElementRef<HTMLCanvasElement>>('pad');
  private drawing = false;
  private last: { x: number; y: number } | null = null;

  constructor() {
    loadFonts(['Great Vibes', 'Dancing Script']);
    afterNextRender(() => this.clear());
  }

  private point(event: PointerEvent): { x: number; y: number } {
    const canvas = this.pad().nativeElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  protected start(event: PointerEvent): void {
    if (this.mode() !== 'draw') return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.drawing = true;
    this.last = this.point(event);
  }

  protected move(event: PointerEvent): void {
    if (!this.drawing || !this.last) return;
    const ctx = this.pad().nativeElement.getContext('2d')!;
    const p = this.point(event);
    ctx.strokeStyle = this.color();
    ctx.lineWidth = this.width() * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.last.x, this.last.y);
    ctx.quadraticCurveTo(this.last.x, this.last.y, (this.last.x + p.x) / 2, (this.last.y + p.y) / 2);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    this.last = p;
    this.empty.set(false);
  }

  protected end(): void {
    this.drawing = false;
    this.last = null;
  }

  protected clear(): void {
    const canvas = this.pad().nativeElement;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    this.empty.set(true);
    if (this.mode() === 'type') this.typed.set('');
  }

  protected redrawTyped(): void {
    if (this.mode() !== 'type') return;
    const canvas = this.pad().nativeElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const text = this.typed().trim();
    this.empty.set(!text);
    if (!text) return;
    const italic = this.font() === 'Playfair Display' ? 'italic ' : '';
    let size = 150;
    do {
      ctx.font = `${italic}${size}px '${this.font()}'`;
      size -= 6;
    } while (ctx.measureText(text).width > canvas.width * 0.9 && size > 30);
    ctx.fillStyle = this.color();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, canvas.width / 2, canvas.height * 0.7);
  }

  protected insert(): void {
    const canvas = this.pad().nativeElement;
    const ctx = canvas.getContext('2d')!;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return;
    const pad = 8;
    const out = document.createElement('canvas');
    out.width = maxX - minX + pad * 2;
    out.height = maxY - minY + pad * 2;
    out.getContext('2d')!.drawImage(canvas, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height);
    this.inserted.emit(out.toDataURL('image/png'));
  }
}
