import { type ImageOp, MAX_IMAGE_SIDE } from './canvas-types';

/** Applies rotate / flip / crop operations (in order) and returns the resulting canvas. */
export function applyImageOps(source: CanvasImageSource & { width: number; height: number }, ops: ImageOp[] = []): HTMLCanvasElement {
  let canvas = document.createElement('canvas');
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(source.width, source.height));
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  let ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  for (const op of ops) {
    const next = document.createElement('canvas');
    const nctx = next.getContext('2d')!;
    if (op.type === 'rotate') {
      next.width = canvas.height;
      next.height = canvas.width;
      nctx.translate(next.width / 2, next.height / 2);
      nctx.rotate((op.deg * Math.PI) / 180);
      nctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    } else if (op.type === 'flip') {
      next.width = canvas.width;
      next.height = canvas.height;
      nctx.translate(op.axis === 'x' ? next.width : 0, op.axis === 'y' ? next.height : 0);
      nctx.scale(op.axis === 'x' ? -1 : 1, op.axis === 'y' ? -1 : 1);
      nctx.drawImage(canvas, 0, 0);
    } else {
      const x = Math.max(0, Math.round(op.x));
      const y = Math.max(0, Math.round(op.y));
      const w = Math.max(1, Math.min(canvas.width - x, Math.round(op.w)));
      const h = Math.max(1, Math.min(canvas.height - y, Math.round(op.h)));
      next.width = w;
      next.height = h;
      nctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
    }
    canvas = next;
    ctx = nctx;
  }
  return canvas;
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}
