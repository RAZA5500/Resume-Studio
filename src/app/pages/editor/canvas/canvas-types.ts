export type PageSource =
  | { type: 'pdf'; index: number }
  | { type: 'image' }
  | { type: 'blank'; width: number; height: number };

export type ImageOp =
  | { type: 'rotate'; deg: 90 | -90 }
  | { type: 'flip'; axis: 'x' | 'y' }
  | { type: 'crop'; x: number; y: number; w: number; h: number };

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  grayscale: boolean;
  sepia: boolean;
  invert: boolean;
  vintage: boolean;
}

/** Persisted per page inside document.editorState. */
export interface PageState {
  source: PageSource;
  /** Extra rotation (degrees) applied to PDF pages. */
  rotation: number;
  background?: string;
  objects: Record<string, unknown>[] | null;
  adjust?: Adjustments;
  ops?: ImageOp[];
}

export interface CanvasEditorState {
  version: 1;
  pages: PageState[];
}

export type Tool =
  | 'select'
  | 'text'
  | 'edit-text'
  | 'draw'
  | 'highlight'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'whiteout'
  | 'crop';

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  blur: 0,
  grayscale: false,
  sepia: false,
  invert: false,
  vintage: false,
};

/** 1 PDF point = 1/72 in; the editor works in CSS pixels (1/96 in). */
export const PDF_SCALE = 96 / 72;

/** Largest side of an edited photo (keeps filters and exports fast). */
export const MAX_IMAGE_SIDE = 3000;

/** Extra properties stored with every Fabric object. */
export const EXTRA_PROPS = [
  'name',
  'selectable',
  'evented',
  'lockMovementX',
  'lockMovementY',
  'lockRotation',
  'lockScalingX',
  'lockScalingY',
  'hasControls',
];

export const STAMPS = [
  { label: 'APPROVED', color: '#16a34a' },
  { label: 'REJECTED', color: '#dc2626' },
  { label: 'DRAFT', color: '#6b7280' },
  { label: 'CONFIDENTIAL', color: '#b91c1c' },
  { label: 'PAID', color: '#2563eb' },
  { label: 'COPY', color: '#7c3aed' },
];

export const CANVAS_FONTS = [
  'Arial',
  'Inter',
  'Roboto',
  'Lato',
  'Poppins',
  'Montserrat',
  'Open Sans',
  'Times New Roman',
  'Merriweather',
  'Lora',
  'Playfair Display',
  'EB Garamond',
  'Courier New',
  'JetBrains Mono',
  'Great Vibes',
  'Dancing Script',
];

/** Fabric custom property used to tag special objects (hints, whiteouts, stamps…). */
declare module 'fabric' {
  interface FabricObject {
    name?: string;
  }
  interface FabricObjectProps {
    name?: string;
  }
  interface SerializedObjectProps {
    name?: string;
  }
}
