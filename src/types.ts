/**
 * Shared widget types (type-only — erased at build time, no runtime cost).
 */

/** Widget theme config as served by GET /w/:projectId/config (PRD §6). */
export interface WidgetConfig {
  primaryColor?: string;
  textColor?: string;
  background?: string;
  position?: 'bottom-right' | 'bottom-left';
  launcherLabel?: string;
  customCss?: string;
  showPoweredBy?: boolean;
}

/** Entry shape served by GET /w/:projectId/entries (pre-sanitized HTML). */
export interface WidgetEntry {
  id: string;
  title: string;
  category: string;
  publishedAt: string | null;
  reactions: Record<string, number>;
  html: string;
}

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** Context handed from the core loader to the lazy panel chunk. */
export interface PanelContext {
  root: HTMLElement;
  launcher: HTMLButtonElement;
  config: WidgetConfig;
  apiBase: string;
  projectId: string;
  clientId: string;
  store: Store;
}

/** API the lazy panel chunk registers on window.__bellnotePanel. */
export interface PanelApi {
  open(ctx: PanelContext): void;
  close(): void;
}
