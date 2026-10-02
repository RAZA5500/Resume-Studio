import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ActiveSelection,
  cache,
  Canvas,
  Ellipse,
  FabricImage,
  type FabricObject,
  filters,
  Group,
  IText,
  Line,
  Path,
  PencilBrush,
  Point,
  Rect,
  StaticCanvas,
  Textbox,
  type TPointerEventInfo,
  util,
} from 'fabric';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { firstValueFrom } from 'rxjs';
import type { DocumentFile, ImproveMode } from '../../../core/models/app.models';
import { AiService } from '../../../core/services/ai.service';
import { DocumentService } from '../../../core/services/document.service';
import { DialogService, ToastService } from '../../../core/services/ui.service';
import {
  canEncodeWebp,
  compactImageType,
  dataUrlToBlob,
  downloadBlob,
  pickFile,
  readAsDataUrl,
  safeFileName,
} from '../../../core/utils/files';
import { loadFonts } from '../../../core/utils/fonts';
import { errorMessage, isLimitReached } from '../../../core/utils/http';
import { loadPdfJs, openPdf, pdfBlob, renderPdfPage, textToHtml } from '../../../core/utils/pdf';
import { ClickOutside } from '../../../shared/ui/click-outside';
import {
  type Adjustments,
  CANVAS_FONTS,
  type CanvasEditorState,
  DEFAULT_ADJUSTMENTS,
  EXTRA_PROPS,
  type ImageOp,
  type PageState,
  PDF_SCALE,
  STAMPS,
  type Tool,
} from './canvas-types';
import { applyImageOps, loadImageElement } from './image-ops';
import { canVectorize, drawFabricText, drawInvisibleText, type PageBox, PdfFontCache } from './pdf-text-export';
import { SignaturePad } from './signature-pad';

interface TextItemBox {
  str: string;
  x: number;
  /** Top of the text line (scene px). */
  y: number;
  baseline: number;
  width: number;
  height: number;
  font: string;
  used?: boolean;
}

interface RuntimePage {
  state: PageState;
  width: number;
  height: number;
  /** Rendered base layer (PDF page or processed photo) as a data URL. */
  bg: string | null;
  bgImage: FabricImage | null;
  thumb: string | null;
  textItems?: TextItemBox[];
}

type AnyObject = FabricObject & Record<string, unknown>;

const SHAPE_TOOLS: Tool[] = ['rect', 'ellipse', 'line', 'arrow', 'whiteout'];

function mapPdfFont(family?: string): string {
  const f = (family ?? '').toLowerCase();
  if (f.includes('mono') || f.includes('courier')) return 'Courier New';
  if (f.includes('serif') && !f.includes('sans')) return 'Times New Roman';
  return 'Arial';
}

function toHex(value: unknown, fallback = '#000000'): string {
  if (typeof value !== 'string') return fallback;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value.slice(1).split('').map((c) => c + c).join('')}`;
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(value);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  return fallback;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

@Component({
  selector: 'app-canvas-editor',
  imports: [FormsModule, SignaturePad, ClickOutside],
  templateUrl: './canvas-editor.html',
  styleUrl: './canvas-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasEditor {
  private readonly documents = inject(DocumentService);
  protected readonly ai = inject(AiService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  readonly doc = input.required<DocumentFile>();

  protected readonly fonts = CANVAS_FONTS;
  protected readonly stamps = STAMPS;
  protected readonly toHex = toHex;

  protected readonly name = signal('');
  protected readonly loading = signal(true);
  protected readonly loadingText = signal('Loading…');
  protected readonly pages = signal<RuntimePage[]>([]);
  protected readonly current = signal(0);
  protected readonly tool = signal<Tool>('select');
  protected readonly zoom = signal(1);
  /** 'limit': the free daily document-edit limit was reached, so auto-save is paused. */
  protected readonly saveState = signal<'saved' | 'saving' | 'dirty' | 'error' | 'limit'>('saved');
  protected readonly selected = signal<AnyObject | null>(null);
  protected readonly selVersion = signal(0);
  protected readonly histVersion = signal(0);
  protected readonly exportMenu = signal(false);
  protected readonly stampMenu = signal(false);
  protected readonly aiMenu = signal(false);
  protected readonly signatureOpen = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly cropping = signal(false);
  protected readonly ocrText = signal<string | null>(null);

  protected readonly strokeColor = signal('#e11d48');
  protected readonly strokeWidth = signal(3);
  protected readonly highlightColor = signal('#facc15');
  protected readonly textColor = signal('#111827');
  protected readonly fontFamily = signal('Inter');
  protected readonly fontSize = signal(24);

  protected readonly currentPage = computed<RuntimePage | null>(() => this.pages()[this.current()] ?? null);
  protected readonly isPdf = computed(() => this.doc().kind === 'pdf');
  protected readonly pageKind = computed(() => this.currentPage()?.state.source.type ?? 'blank');
  protected readonly sel = computed(() => {
    this.selVersion();
    return this.selected();
  });
  protected readonly selIsText = computed(() => this.sel() instanceof IText);
  protected readonly selIsImage = computed(() => this.sel() instanceof FabricImage);
  protected readonly selIsMulti = computed(() => this.sel() instanceof ActiveSelection);
  protected readonly canUndo = computed(() => {
    this.histVersion();
    const page = this.currentPage();
    return !!page && (this.history.get(page)?.index ?? 0) > 0;
  });
  protected readonly canRedo = computed(() => {
    this.histVersion();
    const page = this.currentPage();
    const h = page ? this.history.get(page) : undefined;
    return !!h && h.index < h.stack.length - 1;
  });
  protected readonly adjust = computed<Adjustments>(() => {
    this.selVersion();
    return { ...DEFAULT_ADJUSTMENTS, ...(this.currentPage()?.state.adjust ?? {}) };
  });

  private readonly canvasEl = viewChild.required<ElementRef<HTMLCanvasElement>>('canvasEl');
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');

  private canvas: Canvas | null = null;
  private pdf: PDFDocumentProxy | null = null;
  private pdfBytes: ArrayBuffer | null = null;
  private baseImage: HTMLImageElement | null = null;
  private readonly history = new Map<RuntimePage, { stack: string[]; index: number }>();
  private recording = false;
  private recordTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Incremented on every change; compared with the last saved version. */
  private version = 0;
  private savedVersion = 0;
  private dragStart: Point | null = null;
  private dragShape: FabricObject | null = null;
  private clipboard: FabricObject | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    loadFonts(CANVAS_FONTS);
    afterNextRender(() => {
      // Native listener: a template (wheel) binding would run change detection on every scroll tick.
      const stage = this.stage().nativeElement;
      const onWheel = (event: WheelEvent) => this.onWheel(event);
      stage.addEventListener('wheel', onWheel, { passive: false });
      destroyRef.onDestroy(() => stage.removeEventListener('wheel', onWheel));
    });
    afterNextRender(() => void this.init());
    destroyRef.onDestroy(() => {
      this.flushRecord();
      if (this.unsaved && this.saveState() !== 'limit') void this.save();
      void this.canvas?.dispose();
      void this.pdf?.loadingTask.destroy();
    });
  }

  // ================================================================== setup
  private async init(): Promise<void> {
    const doc = this.doc();
    this.name.set(doc.name);
    this.canvas = new Canvas(this.canvasEl().nativeElement, {
      preserveObjectStacking: true,
      backgroundColor: '#ffffff',
      stopContextMenu: true,
    });
    this.bindCanvasEvents();

    try {
      const saved = doc.editorState as CanvasEditorState | null | undefined;
      let states: PageState[] = saved?.pages?.length ? saved.pages : [];

      if (doc.kind === 'pdf') {
        this.loadingText.set('Rendering PDF pages…');
        this.pdfBytes = await firstValueFrom(this.documents.file(doc.id));
        this.pdf = await openPdf(this.pdfBytes);
        if (!states.length) {
          states = Array.from({ length: this.pdf.numPages }, (_, index) => ({
            source: { type: 'pdf' as const, index },
            rotation: 0,
            objects: null,
          }));
        }
      } else if (doc.kind === 'image') {
        this.loadingText.set('Loading image…');
        const blob = await firstValueFrom(this.documents.fileBlob(doc.id));
        this.baseImage = await loadImageElement(await readAsDataUrl(blob));
        if (!states.length) {
          states = [{ source: { type: 'image' }, rotation: 0, objects: null, adjust: { ...DEFAULT_ADJUSTMENTS }, ops: [] }];
        }
      } else if (!states.length) {
        states = [{ source: { type: 'blank', width: 794, height: 1123 }, rotation: 0, objects: null, background: '#ffffff' }];
      }

      const pages: RuntimePage[] = [];
      for (const state of states) pages.push(await this.createRuntimePage(state));
      this.pages.set(pages);
      await this.showPage(0);
      this.fitZoom();
      void this.renderThumbnails();
    } catch (e) {
      this.toast.error(errorMessage(e, 'Could not open this document'));
    } finally {
      this.loading.set(false);
    }
  }

  private async createRuntimePage(state: PageState): Promise<RuntimePage> {
    const source = state.source;
    if (source.type === 'pdf') {
      const page = await this.pdf!.getPage(source.index + 1);
      const viewport = page.getViewport({ scale: PDF_SCALE, rotation: (page.rotate + state.rotation) % 360 });
      return { state, width: Math.round(viewport.width), height: Math.round(viewport.height), bg: null, bgImage: null, thumb: null };
    }
    if (source.type === 'image') {
      const processed = applyImageOps(this.baseImage!, state.ops ?? []);
      const png = (this.doc().mimeType ?? '').includes('png') || (this.doc().mimeType ?? '').includes('gif');
      return {
        state,
        width: processed.width,
        height: processed.height,
        bg: png ? processed.toDataURL('image/png') : processed.toDataURL('image/jpeg', 0.95),
        bgImage: null,
        thumb: null,
      };
    }
    return { state, width: source.width, height: source.height, bg: null, bgImage: null, thumb: null };
  }

  private bindCanvasEvents(): void {
    const c = this.canvas!;
    c.on('selection:created', () => this.syncSelection());
    c.on('selection:updated', () => this.syncSelection());
    c.on('selection:cleared', () => this.syncSelection());
    c.on('object:added', () => this.queueRecord());
    c.on('object:removed', () => this.queueRecord());
    c.on('object:modified', () => {
      this.queueRecord();
      this.selVersion.update((v) => v + 1);
    });
    c.on('text:changed', () => this.queueRecord());
    c.on('path:created', ({ path }) => {
      if (this.tool() === 'highlight') path.set({ globalCompositeOperation: 'multiply', name: 'highlight' });
    });
    c.on('mouse:down', (e) => this.onMouseDown(e));
    c.on('mouse:move', (e) => this.onMouseMove(e));
    c.on('mouse:up', () => this.onMouseUp());
  }

  private syncSelection(): void {
    this.selected.set((this.canvas?.getActiveObject() as AnyObject | undefined) ?? null);
    this.selVersion.update((v) => v + 1);
  }

  // ================================================================== pages & background
  private async ensureBackground(page: RuntimePage): Promise<void> {
    const source = page.state.source;
    if (source.type !== 'pdf' || page.bg) return;
    const canvas = await renderPdfPage(this.pdf!, source.index + 1, PDF_SCALE * 2, page.state.rotation);
    page.bg = canvas.toDataURL('image/jpeg', 0.92);
  }

  private async applyBackground(page: RuntimePage, target: Canvas | StaticCanvas = this.canvas!): Promise<void> {
    target.backgroundColor = page.state.background ?? '#ffffff';
    if (!page.bg) {
      target.backgroundImage = undefined;
      return;
    }
    let image = target === this.canvas ? page.bgImage : null;
    if (!image) {
      image = await FabricImage.fromURL(page.bg);
      image.set({ scaleX: page.width / image.width, scaleY: page.height / image.height, selectable: false, evented: false });
      image.setPositionByOrigin(new Point(0, 0), 'left', 'top');
      if (target === this.canvas) page.bgImage = image;
    }
    if (page.state.source.type === 'image') this.applyFilters(image, page.state.adjust);
    target.backgroundImage = image;
  }

  private applyFilters(image: FabricImage, adjust?: Partial<Adjustments>): void {
    const a = { ...DEFAULT_ADJUSTMENTS, ...(adjust ?? {}) };
    const list = [];
    if (a.brightness) list.push(new filters.Brightness({ brightness: a.brightness }));
    if (a.contrast) list.push(new filters.Contrast({ contrast: a.contrast }));
    if (a.saturation) list.push(new filters.Saturation({ saturation: a.saturation }));
    if (a.hue) list.push(new filters.HueRotation({ rotation: a.hue }));
    if (a.blur) list.push(new filters.Blur({ blur: a.blur }));
    if (a.grayscale) list.push(new filters.Grayscale());
    if (a.sepia) list.push(new filters.Sepia());
    if (a.invert) list.push(new filters.Invert());
    if (a.vintage) list.push(new filters.Vintage());
    image.filters = list;
    image.applyFilters();
  }

  private async showPage(index: number): Promise<void> {
    const page = this.pages()[index];
    const c = this.canvas;
    if (!page || !c) return;
    this.recording = false;
    c.discardActiveObject();
    await this.ensureBackground(page);
    await c.loadFromJSON({ objects: page.state.objects ?? [] });
    await this.applyBackground(page);
    this.current.set(index);
    this.applyZoom();
    c.requestRenderAll();
    this.recording = true;
    if (!this.history.has(page)) this.history.set(page, { stack: [JSON.stringify(page.state.objects ?? [])], index: 0 });
    this.histVersion.update((v) => v + 1);
    this.selected.set(null);
    if (this.tool() === 'edit-text') await this.showTextHints();
  }

  protected async goToPage(index: number): Promise<void> {
    if (index === this.current() || index < 0 || index >= this.pages().length) return;
    this.commitCurrentPage();
    if (this.cropping()) this.cancelCrop();
    await this.showPage(index);
  }

  private commitCurrentPage(): void {
    const page = this.currentPage();
    if (page && this.canvas) page.state.objects = this.serialize();
  }

  private serialize(): Record<string, unknown>[] {
    return (this.canvas!.toObject(EXTRA_PROPS) as { objects: Record<string, unknown>[] }).objects;
  }

  private refreshPages(): void {
    this.pages.set([...this.pages()]);
  }

  private async renderThumbnails(): Promise<void> {
    for (const page of this.pages()) {
      if (page.thumb) continue;
      if (page.state.source.type === 'pdf') {
        const canvas = await renderPdfPage(this.pdf!, page.state.source.index + 1, 0.3, page.state.rotation);
        page.thumb = canvas.toDataURL(compactImageType(), 0.7);
      } else if (page.bg) {
        page.thumb = page.bg;
      }
      this.refreshPages();
    }
  }

  protected async addPage(): Promise<void> {
    const ref = this.currentPage();
    this.commitCurrentPage();
    const state: PageState = {
      source: { type: 'blank', width: ref?.width ?? 794, height: ref?.height ?? 1123 },
      rotation: 0,
      objects: null,
      background: '#ffffff',
    };
    const page = await this.createRuntimePage(state);
    const list = [...this.pages()];
    list.splice(this.current() + 1, 0, page);
    this.pages.set(list);
    await this.showPage(this.current() + 1);
    this.markDirty();
  }

  protected async duplicatePage(): Promise<void> {
    const ref = this.currentPage();
    if (!ref) return;
    this.commitCurrentPage();
    const page: RuntimePage = { ...ref, state: structuredClone(ref.state), bgImage: null, textItems: undefined };
    const list = [...this.pages()];
    list.splice(this.current() + 1, 0, page);
    this.pages.set(list);
    await this.showPage(this.current() + 1);
    this.markDirty();
  }

  protected async deletePage(): Promise<void> {
    if (this.pages().length <= 1) return this.toast.info('A document needs at least one page.');
    const confirmed = await this.dialogs.confirm({ title: `Delete page ${this.current() + 1}?`, confirmText: 'Delete', danger: true });
    if (!confirmed) return;
    const list = this.pages().filter((_, i) => i !== this.current());
    this.pages.set(list);
    await this.showPage(Math.min(this.current(), list.length - 1));
    this.markDirty();
  }

  protected async movePage(delta: number): Promise<void> {
    const from = this.current();
    const to = from + delta;
    if (to < 0 || to >= this.pages().length) return;
    this.commitCurrentPage();
    const list = [...this.pages()];
    const [page] = list.splice(from, 1);
    list.splice(to, 0, page);
    this.pages.set(list);
    await this.showPage(to);
    this.markDirty();
  }

  protected async rotatePage(delta: 90 | -90): Promise<void> {
    const page = this.currentPage();
    if (!page) return;
    this.commitCurrentPage();
    if (page.state.source.type === 'pdf') {
      page.state.rotation = (page.state.rotation + delta + 360) % 360;
      Object.assign(page, await this.createRuntimePage(page.state), { thumb: null, bgImage: null, textItems: undefined });
    } else if (page.state.source.type === 'image') {
      await this.applyImageOp({ type: 'rotate', deg: delta });
      return;
    } else {
      page.state.source = { type: 'blank', width: page.height, height: page.width };
      page.width = page.state.source.width;
      page.height = page.state.source.height;
    }
    await this.showPage(this.current());
    void this.renderThumbnails();
    this.markDirty();
  }

  // ================================================================== zoom
  protected applyZoom(): void {
    const page = this.currentPage();
    const c = this.canvas;
    if (!page || !c) return;
    const z = this.zoom();
    c.setDimensions({ width: Math.round(page.width * z), height: Math.round(page.height * z) });
    c.setZoom(z);
    c.requestRenderAll();
  }

  protected fitZoom(): void {
    const page = this.currentPage();
    if (!page) return;
    const stage = this.stage().nativeElement;
    const z = Math.min((stage.clientWidth - 64) / page.width, (stage.clientHeight - 64) / page.height, 2);
    this.zoom.set(Math.max(0.1, Math.round(z * 100) / 100));
    this.applyZoom();
  }

  protected zoomBy(delta: number): void {
    this.zoom.set(Math.min(4, Math.max(0.1, Math.round((this.zoom() + delta) * 100) / 100)));
    this.applyZoom();
  }

  private onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    this.zoomBy(event.deltaY < 0 ? 0.1 : -0.1);
  }

  // ================================================================== tools
  protected setTool(tool: Tool): void {
    const c = this.canvas;
    if (!c) return;
    if (this.cropping() && tool !== 'crop') this.cancelCrop();
    this.tool.set(tool);
    c.isDrawingMode = tool === 'draw' || tool === 'highlight';
    if (c.isDrawingMode) {
      const brush = new PencilBrush(c);
      brush.color = tool === 'highlight' ? hexToRgba(this.highlightColor(), 0.38) : this.strokeColor();
      brush.width = tool === 'highlight' ? 18 : this.strokeWidth();
      c.freeDrawingBrush = brush;
    }
    c.selection = tool === 'select';
    c.skipTargetFind = !(tool === 'select' || tool === 'text');
    c.defaultCursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';
    c.discardActiveObject();
    c.requestRenderAll();
    if (tool === 'edit-text') void this.showTextHints();
    else this.clearHints();
  }

  protected updateBrush(): void {
    if (this.tool() === 'draw' || this.tool() === 'highlight') this.setTool(this.tool());
  }

  private onMouseDown(event: TPointerEventInfo): void {
    const tool = this.tool();
    const point = event.scenePoint;
    if (tool === 'text') {
      if (event.target instanceof IText) return;
      this.addText(point);
    } else if (tool === 'edit-text') {
      void this.editPdfTextAt(point);
    } else if (SHAPE_TOOLS.includes(tool)) {
      this.startShape(tool, point);
    }
  }

  private startShape(tool: Tool, point: Point): void {
    const stroke = this.strokeColor();
    const strokeWidth = this.strokeWidth();
    let shape: FabricObject;
    if (tool === 'rect') {
      shape = new Rect({ width: 1, height: 1, fill: 'transparent', stroke, strokeWidth, strokeUniform: true, rx: 2, ry: 2 });
    } else if (tool === 'whiteout') {
      shape = new Rect({ width: 1, height: 1, fill: '#ffffff', stroke: '', strokeWidth: 0, name: 'whiteout' });
    } else if (tool === 'ellipse') {
      shape = new Ellipse({ rx: 1, ry: 1, fill: 'transparent', stroke, strokeWidth, strokeUniform: true });
    } else {
      shape = new Line([point.x, point.y, point.x, point.y], { stroke, strokeWidth, strokeLineCap: 'round' });
    }
    if (!(shape instanceof Line)) shape.setPositionByOrigin(point, 'left', 'top');
    this.dragStart = point;
    this.dragShape = shape;
    this.recording = false;
    this.canvas!.add(shape);
  }

  private onMouseMove(event: TPointerEventInfo): void {
    const shape = this.dragShape;
    const start = this.dragStart;
    if (!shape || !start) return;
    const p = event.scenePoint;
    if (shape instanceof Line) {
      shape.set({ x2: p.x, y2: p.y });
    } else {
      const left = Math.min(start.x, p.x);
      const top = Math.min(start.y, p.y);
      const w = Math.max(1, Math.abs(p.x - start.x));
      const h = Math.max(1, Math.abs(p.y - start.y));
      if (shape instanceof Ellipse) shape.set({ rx: w / 2, ry: h / 2 });
      else shape.set({ width: w, height: h });
      shape.setPositionByOrigin(new Point(left, top), 'left', 'top');
    }
    shape.setCoords();
    this.canvas!.requestRenderAll();
  }

  private onMouseUp(): void {
    const shape = this.dragShape;
    const start = this.dragStart;
    this.dragShape = null;
    this.dragStart = null;
    if (!shape || !start) return;
    const c = this.canvas!;
    let result: FabricObject = shape;

    if (shape instanceof Line) {
      let { x1, y1, x2, y2 } = shape;
      if (Math.hypot(x2 - x1, y2 - y1) < 5) {
        x2 = x1 + 160;
        y2 = y1;
        shape.set({ x2, y2 });
      }
      if (this.tool() === 'arrow') {
        c.remove(shape);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = 12 + this.strokeWidth() * 2.5;
        const a1 = angle + Math.PI * 0.82;
        const a2 = angle - Math.PI * 0.82;
        result = new Path(
          `M ${x1} ${y1} L ${x2} ${y2} M ${x2 + head * Math.cos(a1)} ${y2 + head * Math.sin(a1)} L ${x2} ${y2} L ${x2 + head * Math.cos(a2)} ${y2 + head * Math.sin(a2)}`,
          { stroke: this.strokeColor(), strokeWidth: this.strokeWidth(), fill: '', strokeLineCap: 'round', strokeLineJoin: 'round' },
        );
        c.add(result);
      }
    } else if ((shape.width ?? 0) * (shape.scaleX ?? 1) < 5 && (shape.height ?? 0) * (shape.scaleY ?? 1) < 5) {
      if (shape instanceof Ellipse) shape.set({ rx: 70, ry: 45 });
      else shape.set({ width: 180, height: 90 });
      shape.setPositionByOrigin(start, 'left', 'top');
    }

    result.setCoords();
    this.recording = true;
    this.setTool('select');
    c.setActiveObject(result);
    c.requestRenderAll();
    this.queueRecord();
  }

  private addText(point: Point): void {
    const c = this.canvas!;
    const text = new Textbox('Type something', {
      width: 260,
      fontSize: this.fontSize(),
      fontFamily: this.fontFamily(),
      fill: this.textColor(),
    });
    text.setPositionByOrigin(point, 'left', 'top');
    c.add(text);
    this.setTool('select');
    c.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    c.requestRenderAll();
  }

  protected async insertImage(): Promise<void> {
    const [file] = await pickFile('image/*');
    if (!file) return;
    await this.placeImage(await readAsDataUrl(file), 0.5);
  }

  protected async insertSignature(dataUrl: string): Promise<void> {
    this.signatureOpen.set(false);
    await this.placeImage(dataUrl, 0.3, 'signature');
  }

  private async placeImage(src: string, maxShare: number, name?: string): Promise<void> {
    const page = this.currentPage();
    const c = this.canvas;
    if (!page || !c) return;
    const image = await FabricImage.fromURL(src);
    const scale = Math.min(1, (page.width * maxShare) / image.width, (page.height * maxShare) / image.height);
    image.set({ scaleX: scale, scaleY: scale, ...(name ? { name } : {}) });
    image.setPositionByOrigin(new Point(page.width / 2, page.height / 2), 'center', 'center');
    this.setTool('select');
    c.add(image);
    c.setActiveObject(image);
    c.requestRenderAll();
  }

  protected addStamp(label: string, color: string): void {
    this.stampMenu.set(false);
    const page = this.currentPage();
    const c = this.canvas;
    if (!page || !c) return;
    const text = new IText(label, { fontFamily: 'Arial', fontWeight: 'bold', fontSize: 30, fill: color, charSpacing: 120 });
    const box = new Rect({
      width: (text.width ?? 100) + 36,
      height: (text.height ?? 30) + 16,
      rx: 8,
      ry: 8,
      fill: hexToRgba(color, 0.06),
      stroke: color,
      strokeWidth: 3,
    });
    const stamp = new Group([box, text], { angle: -8, name: 'stamp' });
    stamp.setPositionByOrigin(new Point(page.width / 2, page.height / 3), 'center', 'center');
    this.setTool('select');
    c.add(stamp);
    c.setActiveObject(stamp);
    c.requestRenderAll();
  }

  protected addDateStamp(): void {
    const page = this.currentPage();
    const c = this.canvas;
    if (!page || !c) return;
    this.stampMenu.set(false);
    const text = new IText(new Date().toLocaleDateString(), { fontFamily: 'Arial', fontSize: 18, fill: this.textColor() });
    text.setPositionByOrigin(new Point(page.width / 2, page.height / 2), 'center', 'center');
    c.add(text);
    c.setActiveObject(text);
  }

  // ================================================================== PDF text editing
  private async pdfTextItems(page: RuntimePage): Promise<TextItemBox[]> {
    if (page.textItems) return page.textItems;
    const source = page.state.source;
    if (source.type !== 'pdf' || !this.pdf) return [];
    const { Util } = await loadPdfJs();
    const pdfPage = await this.pdf.getPage(source.index + 1);
    const viewport = pdfPage.getViewport({ scale: PDF_SCALE, rotation: (pdfPage.rotate + page.state.rotation) % 360 });
    const content = await pdfPage.getTextContent();
    const items: TextItemBox[] = [];
    for (const raw of content.items) {
      if (!('str' in raw) || !raw.str.trim()) continue;
      const tx = Util.transform(viewport.transform, raw.transform) as number[];
      if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01) continue;
      const height = Math.hypot(tx[2], tx[3]);
      const style = content.styles[raw.fontName];
      const ascent = style?.ascent ? Math.min(1, Math.max(0.6, style.ascent)) : 0.82;
      items.push({
        str: raw.str,
        x: tx[4],
        y: tx[5] - height * ascent,
        baseline: tx[5],
        width: raw.width * viewport.scale,
        height,
        font: mapPdfFont(style?.fontFamily),
      });
    }
    // Lines that were already converted in a previous session are covered by a whiteout.
    const covers = (page.state.objects ?? []).filter((o) => o['name'] === 'pdf-whiteout');
    for (const item of items) {
      const cx = item.x + item.width / 2;
      const cy = item.y + item.height / 2;
      item.used = covers.some((o) => {
        const w = Number(o['width']) * Number(o['scaleX'] ?? 1);
        const h = Number(o['height']) * Number(o['scaleY'] ?? 1);
        const left = Number(o['left']) - w / 2;
        const top = Number(o['top']) - h / 2;
        return cx >= left && cx <= left + w && cy >= top && cy <= top + h;
      });
    }
    page.textItems = items;
    return items;
  }

  private async showTextHints(): Promise<void> {
    this.clearHints();
    const page = this.currentPage();
    const c = this.canvas;
    if (!page || !c) return;
    if (page.state.source.type !== 'pdf') {
      this.toast.info('Existing-text editing works on PDF pages. Use the Text tool to add new text.');
      return;
    }
    this.commitCurrentPage();
    const items = await this.pdfTextItems(page);
    if (!items.length) {
      this.toast.warning('No selectable text found on this page (it may be scanned). Use Whiteout + Text instead.');
      return;
    }
    const hints = items
      .filter((i) => !i.used)
      .map((i) => {
        const hint = new Rect({
          width: i.width,
          height: i.height,
          fill: 'rgba(29, 78, 216, 0.06)',
          stroke: 'rgba(29, 78, 216, 0.5)',
          strokeWidth: 1,
          strokeDashArray: [3, 3],
          strokeUniform: true,
          selectable: false,
          evented: false,
          excludeFromExport: true,
          name: 'hint',
        });
        hint.setPositionByOrigin(new Point(i.x, i.y), 'left', 'top');
        return hint;
      });
    this.recording = false;
    c.add(...hints);
    c.requestRenderAll();
    this.recording = true;
  }

  private clearHints(): void {
    const c = this.canvas;
    if (!c) return;
    const hints = c.getObjects().filter((o) => o.name === 'hint');
    if (!hints.length) return;
    this.recording = false;
    c.remove(...hints);
    c.requestRenderAll();
    this.recording = true;
  }

  private async editPdfTextAt(point: Point): Promise<void> {
    const page = this.currentPage();
    const c = this.canvas;
    if (!page || !c) return;
    const items = await this.pdfTextItems(page);
    const item = items.find(
      (i) => !i.used && point.x >= i.x - 2 && point.x <= i.x + i.width + 2 && point.y >= i.y - 2 && point.y <= i.y + i.height + 2,
    );
    if (!item) return;
    item.used = true;
    const cover = new Rect({
      width: item.width + 6,
      height: item.height * 1.2 + 4,
      fill: page.state.background ?? '#ffffff',
      strokeWidth: 0,
      selectable: false,
      evented: false,
      name: 'pdf-whiteout',
    });
    cover.setPositionByOrigin(new Point(item.x - 3, item.y - 2), 'left', 'top');
    const text = new IText(item.str, { fontSize: item.height, fontFamily: item.font, fill: '#111111' });
    text.setPositionByOrigin(new Point(item.x, item.y - item.height * 0.05), 'left', 'top');
    this.clearHints();
    c.add(cover, text);
    this.setTool('select');
    c.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    c.requestRenderAll();
  }

  // ================================================================== history
  private queueRecord(): void {
    if (!this.recording) return;
    if (this.recordTimer) clearTimeout(this.recordTimer);
    this.recordTimer = setTimeout(() => {
      this.recordTimer = null;
      this.recordHistory();
    }, 250);
  }

  /** Records a pending (debounced) change right away — used before leaving or saving. */
  private flushRecord(): void {
    if (!this.recordTimer) return;
    clearTimeout(this.recordTimer);
    this.recordTimer = null;
    this.recordHistory();
  }

  private recordHistory(): void {
    const page = this.currentPage();
    if (!page || !this.canvas) return;
    const json = JSON.stringify(this.serialize());
    const h = this.history.get(page) ?? { stack: [], index: -1 };
    if (h.stack[h.index] === json) return;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(json);
    if (h.stack.length > 80) h.stack.shift();
    h.index = h.stack.length - 1;
    this.history.set(page, h);
    page.state.objects = JSON.parse(json) as Record<string, unknown>[];
    this.histVersion.update((v) => v + 1);
    this.markDirty();
  }

  protected async undo(): Promise<void> {
    const page = this.currentPage();
    const h = page && this.history.get(page);
    if (!page || !h || h.index <= 0) return;
    h.index--;
    await this.restore(page, h.stack[h.index]);
  }

  protected async redo(): Promise<void> {
    const page = this.currentPage();
    const h = page && this.history.get(page);
    if (!page || !h || h.index >= h.stack.length - 1) return;
    h.index++;
    await this.restore(page, h.stack[h.index]);
  }

  private async restore(page: RuntimePage, json: string): Promise<void> {
    const c = this.canvas!;
    this.recording = false;
    page.state.objects = JSON.parse(json) as Record<string, unknown>[];
    await c.loadFromJSON({ objects: page.state.objects });
    await this.applyBackground(page);
    c.requestRenderAll();
    this.recording = true;
    this.selected.set(null);
    this.histVersion.update((v) => v + 1);
    this.markDirty();
  }

  // ================================================================== object properties
  protected prop(key: string): unknown {
    return this.sel()?.[key];
  }

  protected setProp(key: string, value: unknown): void {
    const c = this.canvas;
    if (!c) return;
    for (const object of c.getActiveObjects()) object.set(key as keyof FabricObject, value as never);
    c.requestRenderAll();
    this.selVersion.update((v) => v + 1);
    this.queueRecord();
  }

  protected toggleProp(key: string, on: unknown, off: unknown): void {
    this.setProp(key, this.prop(key) === on ? off : on);
  }

  protected async setFont(family: string): Promise<void> {
    try {
      await document.fonts.load(`24px "${family}"`);
    } catch {
      // system fonts resolve instantly
    }
    cache.clearFontCache(family);
    this.setProp('fontFamily', family);
    this.fontFamily.set(family);
  }

  protected deleteSelection(): void {
    const c = this.canvas;
    if (!c) return;
    const objects = c.getActiveObjects();
    if (!objects.length) return;
    c.discardActiveObject();
    c.remove(...objects);
    c.requestRenderAll();
  }

  protected async duplicateSelection(): Promise<void> {
    const c = this.canvas;
    const active = c?.getActiveObject();
    if (!c || !active) return;
    await this.pasteObject(active);
  }

  private async pasteObject(source: FabricObject): Promise<void> {
    const c = this.canvas!;
    const clone = await source.clone(EXTRA_PROPS);
    c.discardActiveObject();
    clone.set({ left: (clone.left ?? 0) + 18, top: (clone.top ?? 0) + 18, evented: true });
    if (clone instanceof ActiveSelection) {
      clone.canvas = c;
      clone.forEachObject((object) => c.add(object));
      clone.setCoords();
    } else {
      c.add(clone);
    }
    c.setActiveObject(clone);
    c.requestRenderAll();
  }

  protected arrange(action: 'front' | 'forward' | 'backward' | 'back'): void {
    const c = this.canvas;
    const active = c?.getActiveObject();
    if (!c || !active) return;
    if (action === 'front') c.bringObjectToFront(active);
    else if (action === 'forward') c.bringObjectForward(active);
    else if (action === 'backward') c.sendObjectBackwards(active);
    else c.sendObjectToBack(active);
    c.requestRenderAll();
    this.queueRecord();
  }

  protected align(position: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    const page = this.currentPage();
    const active = this.canvas?.getActiveObject();
    if (!page || !active) return;
    const current = active.getPositionByOrigin('center', 'center');
    const box = active.getBoundingRect();
    let x = current.x;
    let y = current.y;
    if (position === 'left') x = box.width / 2;
    if (position === 'center') x = page.width / 2;
    if (position === 'right') x = page.width - box.width / 2;
    if (position === 'top') y = box.height / 2;
    if (position === 'middle') y = page.height / 2;
    if (position === 'bottom') y = page.height - box.height / 2;
    active.setPositionByOrigin(new Point(x, y), 'center', 'center');
    active.setCoords();
    this.canvas!.requestRenderAll();
    this.queueRecord();
  }

  protected toggleLock(): void {
    const locked = !this.prop('lockMovementX');
    for (const object of this.canvas?.getActiveObjects() ?? []) {
      object.set({
        lockMovementX: locked,
        lockMovementY: locked,
        lockRotation: locked,
        lockScalingX: locked,
        lockScalingY: locked,
        hasControls: !locked,
      });
    }
    this.canvas?.requestRenderAll();
    this.selVersion.update((v) => v + 1);
    this.queueRecord();
  }

  protected rewriteText(mode: ImproveMode): void {
    this.aiMenu.set(false);
    const object = this.sel();
    if (!(object instanceof IText) || !object.text.trim()) return;
    this.busy.set('ai');
    this.ai.improve(object.text, mode).subscribe({
      next: (result) => {
        object.set('text', result.text);
        this.canvas?.requestRenderAll();
        this.busy.set(null);
        this.queueRecord();
      },
      error: (e: unknown) => {
        this.busy.set(null);
        this.toast.error(errorMessage(e));
      },
    });
  }

  // ================================================================== page / image adjustments
  protected setPageBackground(color: string): void {
    const page = this.currentPage();
    if (!page) return;
    page.state.background = color;
    this.canvas!.backgroundColor = color;
    this.canvas!.requestRenderAll();
    this.markDirty();
  }

  protected setAdjust(key: keyof Adjustments, value: number | boolean): void {
    const page = this.currentPage();
    if (!page || !page.bgImage) return;
    page.state.adjust = { ...DEFAULT_ADJUSTMENTS, ...(page.state.adjust ?? {}), [key]: value };
    this.applyFilters(page.bgImage, page.state.adjust);
    this.canvas!.requestRenderAll();
    this.selVersion.update((v) => v + 1);
    this.markDirty();
  }

  protected resetAdjust(): void {
    const page = this.currentPage();
    if (!page?.bgImage) return;
    page.state.adjust = { ...DEFAULT_ADJUSTMENTS };
    this.applyFilters(page.bgImage, page.state.adjust);
    this.canvas!.requestRenderAll();
    this.selVersion.update((v) => v + 1);
    this.markDirty();
  }

  protected async applyImageOp(op: ImageOp): Promise<void> {
    const page = this.currentPage();
    if (!page || page.state.source.type !== 'image') return;
    this.commitCurrentPage();
    page.state.ops = [...(page.state.ops ?? []), op];
    const rebuilt = await this.createRuntimePage(page.state);
    Object.assign(page, { width: rebuilt.width, height: rebuilt.height, bg: rebuilt.bg, bgImage: null, thumb: rebuilt.bg });
    await this.showPage(this.current());
    this.fitZoom();
    this.refreshPages();
    this.markDirty();
  }

  protected startCrop(): void {
    const page = this.currentPage();
    const c = this.canvas;
    if (!page || !c) return;
    this.setTool('select');
    const crop = new Rect({
      width: page.width * 0.8,
      height: page.height * 0.8,
      fill: 'rgba(29, 78, 216, 0.06)',
      stroke: '#1d4ed8',
      strokeWidth: 2,
      strokeDashArray: [8, 6],
      strokeUniform: true,
      lockRotation: true,
      excludeFromExport: true,
      name: 'crop',
      cornerColor: '#1d4ed8',
      transparentCorners: false,
    });
    crop.setPositionByOrigin(new Point(page.width / 2, page.height / 2), 'center', 'center');
    this.recording = false;
    c.add(crop);
    c.setActiveObject(crop);
    c.requestRenderAll();
    this.recording = true;
    this.cropping.set(true);
  }

  protected cancelCrop(): void {
    const c = this.canvas;
    const crop = c?.getObjects().find((o) => o.name === 'crop');
    this.recording = false;
    if (crop) c!.remove(crop);
    this.recording = true;
    this.cropping.set(false);
    c?.requestRenderAll();
  }

  protected async applyCrop(): Promise<void> {
    const c = this.canvas;
    const page = this.currentPage();
    const crop = c?.getObjects().find((o) => o.name === 'crop');
    if (!c || !page || !crop) return;
    const box = crop.getBoundingRect();
    const x = Math.max(0, box.left);
    const y = Math.max(0, box.top);
    const w = Math.min(page.width - x, box.width);
    const h = Math.min(page.height - y, box.height);
    this.cancelCrop();
    this.recording = false;
    for (const object of c.getObjects()) {
      object.set({ left: (object.left ?? 0) - x, top: (object.top ?? 0) - y });
      object.setCoords();
    }
    this.recording = true;
    await this.applyImageOp({ type: 'crop', x, y, w, h });
  }

  // ================================================================== OCR
  protected extractText(): void {
    this.busy.set('ocr');
    this.documents.extractText(this.doc().id).subscribe({
      next: (result) => {
        this.ocrText.set(result.text);
        this.busy.set(null);
      },
      error: (e: unknown) => {
        this.busy.set(null);
        this.toast.error(errorMessage(e));
      },
    });
  }

  protected async copyOcr(): Promise<void> {
    await navigator.clipboard.writeText(this.ocrText() ?? '').catch(() => undefined);
    this.toast.success('Text copied');
  }

  protected openOcrAsDocument(): void {
    const text = this.ocrText();
    if (!text) return;
    this.documents.create({ name: `${this.name()} (text)`, kind: 'rich', html: textToHtml(text) }).subscribe({
      next: (doc) => void this.router.navigate(['/editor', doc.id]),
      error: (e: unknown) => this.toast.error(errorMessage(e)),
    });
  }

  // ================================================================== export
  /** Renders a page to an image using an offscreen canvas (keeps the editor untouched). */
  private async renderPageImage(
    page: RuntimePage,
    options: {
      background: boolean;
      multiplier: number;
      format?: 'png' | 'jpeg' | 'webp';
      quality?: number;
      /** Indices of objects to leave out (e.g. text drawn as vector PDF text). */
      exclude?: Set<number>;
    },
  ): Promise<string> {
    await this.ensureBackground(page);
    const sc = new StaticCanvas(undefined, { width: page.width, height: page.height, enableRetinaScaling: false });
    const objects = (page.state.objects ?? []).filter((_, index) => !options.exclude?.has(index));
    await sc.loadFromJSON({ objects });
    if (options.background) await this.applyBackground(page, sc);
    else {
      sc.backgroundColor = '';
      sc.backgroundImage = undefined;
    }
    sc.renderAll();
    const url = sc.toDataURL({ format: options.format ?? 'png', multiplier: options.multiplier, quality: options.quality ?? 0.92 });
    void sc.dispose();
    return url;
  }

  /**
   * Builds the output PDF.
   * - flatten: every page becomes one image (content under whiteouts is truly gone).
   * - smart (default): untouched pages keep their original vector content; text
   *   objects are written as real selectable PDF text; pages with whiteouts are
   *   re-rendered so hidden words disappear from the text layer too, while the
   *   remaining original words stay searchable through an invisible text layer.
   */
  private async buildPdf(flatten: boolean): Promise<Uint8Array> {
    this.commitCurrentPage();
    const lib = await import('pdf-lib');
    const out = await lib.PDFDocument.create();
    const source = this.pdfBytes && !flatten ? await lib.PDFDocument.load(this.pdfBytes, { ignoreEncryption: true }) : null;
    const fonts = new PdfFontCache(out, lib);

    for (const page of this.pages()) {
      const scene = { width: page.width, height: page.height };
      const fullBox = { x: 0, y: 0, width: page.width * 0.75, height: page.height * 0.75 };

      if (flatten) {
        const composite = await this.renderPageImage(page, { background: true, multiplier: 2, format: 'jpeg' });
        const pdfPage = out.addPage([fullBox.width, fullBox.height]);
        pdfPage.drawImage(await out.embedJpg(composite), fullBox);
        continue;
      }

      const live = await util.enlivenObjects<FabricObject>(page.state.objects ?? []);
      const vectorText = new Set<number>();
      live.forEach((object, index) => {
        if (canVectorize(object)) vectorText.add(index);
      });
      const covers = live.filter((o) => o.name === 'whiteout' || o.name === 'pdf-whiteout').map((o) => o.getBoundingRect());
      const s = page.state.source;
      const intrinsicRotation = source && s.type === 'pdf' ? source.getPage(s.index).getRotation().angle : 0;
      const keepOriginal = !!source && s.type === 'pdf' && page.state.rotation === 0 && intrinsicRotation % 360 === 0 && !covers.length;

      let pdfPage: import('pdf-lib').PDFPage;
      let box: PageBox = fullBox;
      if (keepOriginal && s.type === 'pdf') {
        const [copied] = await out.copyPages(source!, [s.index]);
        pdfPage = out.addPage(copied);
        box = copied.getCropBox();
        if (live.length > vectorText.size) {
          const overlay = await this.renderPageImage(page, { background: false, multiplier: 2.5, exclude: vectorText });
          pdfPage.drawImage(await out.embedPng(overlay), box);
        }
      } else {
        const raster = await this.renderPageImage(page, { background: true, multiplier: 2, format: 'jpeg', exclude: vectorText });
        pdfPage = out.addPage([fullBox.width, fullBox.height]);
        pdfPage.drawImage(await out.embedJpg(raster), fullBox);
      }

      // Emit text in reading order (top → bottom, left → right) so copy-paste and
      // ATS parsers read edited lines where they visually appear.
      const runs: Array<{ top: number; left: number; draw: (target: import('pdf-lib').PDFPage) => Promise<void> }> = [];
      if (!keepOriginal && s.type === 'pdf') {
        for (const item of await this.pdfTextItems(page)) {
          const cx = item.x + item.width / 2;
          const cy = item.y + item.height / 2;
          const hidden = covers.some((c) => cx >= c.left && cx <= c.left + c.width && cy >= c.top && cy <= c.top + c.height);
          if (hidden) continue;
          const font = await fonts.forFamily(item.font);
          runs.push({ top: item.y, left: item.x, draw: async (target) => drawInvisibleText(lib, target, font, item, scene, box) });
        }
      }
      for (const index of vectorText) {
        const object = live[index] as IText;
        const rect = object.getBoundingRect();
        runs.push({ top: rect.top, left: rect.left, draw: (target) => drawFabricText(lib, target, fonts, object, scene, box) });
      }
      runs.sort((a, b) => (Math.abs(a.top - b.top) < 3 ? a.left - b.left : a.top - b.top));
      for (const run of runs) await run.draw(pdfPage);
    }
    return out.save();
  }

  protected async exportPdf(flatten: boolean): Promise<void> {
    this.exportMenu.set(false);
    this.busy.set('export');
    try {
      downloadBlob(pdfBlob(await this.buildPdf(flatten)), `${safeFileName(this.name())}.pdf`);
    } catch (e) {
      this.toast.error(errorMessage(e, 'PDF export failed'));
    } finally {
      this.busy.set(null);
    }
  }

  protected async exportImage(format: 'png' | 'jpeg' | 'webp', allPages = false): Promise<void> {
    this.exportMenu.set(false);
    this.busy.set('export');
    this.commitCurrentPage();
    try {
      const pages = allPages ? this.pages() : [this.currentPage()!];
      const multiplier = this.pageKind() === 'image' ? 1 : 2;
      for (const [i, page] of pages.entries()) {
        const url = await this.renderPageImage(page, { background: true, multiplier, format, quality: 0.92 });
        const suffix = pages.length > 1 ? `-page-${i + 1}` : '';
        downloadBlob(dataUrlToBlob(url), `${safeFileName(this.name())}${suffix}.${format === 'jpeg' ? 'jpg' : format}`);
      }
    } catch (e) {
      this.toast.error(errorMessage(e, 'Export failed'));
    } finally {
      this.busy.set(null);
    }
  }

  protected async saveAsCopy(): Promise<void> {
    this.exportMenu.set(false);
    this.busy.set('export');
    try {
      const blob = pdfBlob(await this.buildPdf(false));
      const copy = await firstValueFrom(this.documents.upload(blob, `${safeFileName(this.name())} (edited).pdf`));
      this.toast.success('Saved as a new PDF in My Documents');
      void this.router.navigate(['/editor', copy.id]);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }

  // ================================================================== saving
  private markDirty(): void {
    this.version++;
    if (this.saveState() === 'limit') return;
    this.saveState.set('dirty');
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), 1500);
  }

  private get unsaved(): boolean {
    return this.version !== this.savedVersion;
  }

  protected async save(): Promise<void> {
    if (!this.canvas || this.loading()) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.commitCurrentPage();
    const version = this.version;
    this.saveState.set('saving');
    try {
      const first = this.pages()[0];
      const thumbnail = first
        ? await this.renderPageImage(first, {
            background: true,
            multiplier: Math.min(1, 320 / first.width),
            // Shown in the documents list only, so the smallest format wins.
            format: canEncodeWebp() ? 'webp' : 'jpeg',
            quality: 0.7,
          })
        : undefined;
      const state: CanvasEditorState = { version: 1, pages: this.pages().map((p) => p.state) };
      await firstValueFrom(
        this.documents.update(this.doc().id, {
          name: this.name().trim() || 'Untitled',
          editorState: state as unknown as Record<string, unknown>,
          thumbnail,
          pageCount: this.pages().length,
        }),
      );
      this.savedVersion = Math.max(this.savedVersion, version);
      // Edits made while the request was in flight keep the document unsaved.
      this.saveState.set(this.version === version ? 'saved' : 'dirty');
    } catch (e) {
      this.saveState.set(isLimitReached(e) ? 'limit' : 'error');
    }
  }

  protected rename(value: string): void {
    this.name.set(value);
    this.markDirty();
  }

  protected async back(): Promise<void> {
    this.flushRecord();
    if (this.unsaved && this.saveState() !== 'limit') await this.save();
    void this.router.navigateByUrl('/app/documents');
  }

  // ================================================================== keyboard
  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    const c = this.canvas;
    if (!c || this.loading()) return;
    const target = event.target as HTMLElement | null;
    if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
    const active = c.getActiveObject();
    if (active instanceof IText && active.isEditing) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (mod && key === 'z') {
      event.preventDefault();
      void (event.shiftKey ? this.redo() : this.undo());
    } else if (mod && key === 'y') {
      event.preventDefault();
      void this.redo();
    } else if (mod && key === 's') {
      event.preventDefault();
      void this.save();
    } else if (mod && key === 'c' && active) {
      this.clipboard = active;
    } else if (mod && key === 'v' && this.clipboard) {
      event.preventDefault();
      void this.pasteObject(this.clipboard);
    } else if (mod && key === 'd' && active) {
      event.preventDefault();
      void this.duplicateSelection();
    } else if ((key === 'delete' || key === 'backspace') && active) {
      event.preventDefault();
      this.deleteSelection();
    } else if (key.startsWith('arrow') && active) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
      const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
      active.set({ left: (active.left ?? 0) + dx, top: (active.top ?? 0) + dy });
      active.setCoords();
      c.requestRenderAll();
      this.queueRecord();
    } else if (key === 'escape') {
      if (this.cropping()) this.cancelCrop();
      this.setTool('select');
    } else if (!mod) {
      const shortcuts: Record<string, Tool> = { v: 'select', t: 'text', e: 'edit-text', p: 'draw', h: 'highlight', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', w: 'whiteout' };
      const tool = shortcuts[key];
      if (tool && (tool !== 'edit-text' || this.isPdf())) this.setTool(tool);
    }
  }
}
