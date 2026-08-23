// The loader: socket lifecycle, handshake, heartbeat and menu glue for the
// MCP bridge extension. Every actual EasyEDA API interaction lives in the
// dispatcher module (dispatcher.ts), which is baked in here as the fallback
// and can be hot-swapped over the bridge in dev mode without re-importing
// the .eext.
import {
  BRIDGE_PORT,
  getLocalBridgeConnectionAttempts,
  hasHeartbeatTimedOut,
  HEARTBEAT_INTERVAL_MS,
  isServerActivityMessage,
  reconnectDelayMs,
  REGISTER_OPEN_CALLBACK_TIMEOUT_MS,
  shouldReconnectAfterSocketFailure,
} from './connection-policy.js';
import {
  RemoteRelayClient,
  type RemoteApprovalDecision,
  type RemoteApprovalPrompt,
  type RemoteRelayMode,
} from './remote-client.js';
import { createDispatcher } from './dispatcher.js';
import { normalizeCanvasBinaryResult } from './capture-binary-result.js';
import type { Dispatcher, DispatcherToolkit } from './toolkit.js';
import {
  createRuntimeTimers,
  type EasyedaTimerApi,
  type RuntimeTimerHandle,
} from './runtime-timers.js';
import { isRecord, log, readPath, readPathParent, type JsonValue } from './utils.js';

declare const eda: EasyedaGlobal | undefined;
declare const EDA: unknown | undefined;
declare const api: unknown | undefined;
declare const ESYS_ToastMessageType: { INFO?: unknown } | undefined;
declare const SYS_WebSocket: EasyedaWebSocketApi | undefined;
declare const SYS_Message: EasyedaMessageApi | undefined;

// Injected at build time via environment variable or build script
declare const BRIDGE_SESSION_TOKEN: string | undefined;
// Compile-time hot-swap gate: true only in dev builds (scripts/build.mjs with
// MCP_DEV_HOTSWAP=true). In marketplace builds the whole hot-swap path is dead
// code, so a published .eext can never eval a pushed bundle.
declare const __MCP_DEV_HOTSWAP__: boolean | undefined;

// Single source for the extension version; sync-versions.mjs patches the
// literal below (first `extensionVersion: '...'` match in this file).
const EXTENSION_INFO = {
  extensionVersion: '1.0.0-rc.6', // x-release-please-version
};

// Safe accessors for optional EasyEDA Pro runtime globals.
// Never reference optional globals directly; they may not exist in the eval context.

function getWsApi(): EasyedaWebSocketApi | undefined {
  return typeof SYS_WebSocket !== 'undefined'
    ? SYS_WebSocket
    : readPath<EasyedaWebSocketApi>(getGlobal(), 'sys_WebSocket');
}

function getSysMessage(): EasyedaMessageApi | undefined {
  return typeof SYS_Message !== 'undefined'
    ? SYS_Message
    : readPath<EasyedaMessageApi>(getGlobal(), 'sys_Message');
}

function getInfoToastType(): string {
  const info =
    typeof ESYS_ToastMessageType !== 'undefined' ? ESYS_ToastMessageType.INFO : undefined;
  return typeof info === 'string' ? info : 'info';
}

type ConnectMode = 'manual' | 'auto';
type ConnectionState = 'disconnected' | 'connecting' | 'connected';
type InboundMessageType = 'hello' | 'heartbeat' | 'request' | 'ignored';

interface EasyedaGlobal {
  [key: string]: unknown;
  activate?: () => Promise<void>;
  deactivate?: () => void;
  connect?: (mode?: ConnectMode) => Promise<void>;
  disconnect?: () => void;
  showStatus?: () => void;
  enableAutoConnect?: () => Promise<void>;
  disableAutoConnect?: () => Promise<void>;
  connectRemoteRelay?: (
    mode?: Exclude<RemoteRelayMode, 'disabled'>,
    relayUrl?: string,
    pairingCode?: string,
  ) => void;
  disconnectRemoteRelay?: () => void;
  showRemoteRelayStatus?: () => void;
}

interface EasyedaWebSocketApi {
  register?: (
    id: string,
    url: string,
    onMessage: (event: unknown) => void,
    onOpen?: () => void,
  ) => void;
  send?: (id: string, data: string) => void;
  close?: (id: string) => void;
  create?: (url: string) => EasyedaSocket;
}

interface EasyedaMessageApi {
  showToastMessage?: (message: string, messageType?: string) => void;
}

interface EasyedaDialogApi {
  showConfirmationMessage?: (
    content: string,
    title?: string,
    mainButtonTitle?: string,
    buttonTitle?: string,
    callbackFn?: (mainButtonClicked: boolean) => void,
  ) => void;
}

interface EasyedaToastApi {
  showMessage?: (message: string, messageType?: string) => void;
}

interface EasyedaSocket {
  onopen?: () => void;
  onmessage?: (event: { data?: unknown } | unknown) => void;
  onclose?: () => void;
  onerror?: (error: unknown) => void;
  send?: (data: string) => void;
  close?: () => void;
}

interface BridgeRequest {
  id: string;
  type: 'request';
  method: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
}

interface BridgeResponse {
  id: string;
  type: 'response';
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    suggestion: string;
    data?: unknown;
  };
  durationMs: number;
}

interface SocketHandle {
  type: 'easyeda-register' | 'easyeda-create' | 'browser';
  id?: string;
  raw?: EasyedaSocket | WebSocket;
}

interface CreateSocketOptions {
  skipRegister?: boolean;
}

type LocalConnectionPhase =
  | 'register-open-timeout'
  | 'socket-api-unavailable'
  | 'socket-open-timeout'
  | 'hello-timeout'
  | 'socket-closed'
  | 'socket-error';

interface LocalConnectionDiagnostic {
  phase: LocalConnectionPhase;
  port: number;
  transport?: SocketHandle['type'];
  message: string;
  priority: number;
}

const BRIDGE_PROTOCOL = 'easyeda-mcp-pro.bridge';
const BRIDGE_VERSION = '1.0.0';
const BRIDGE_CONTRACT_VERSION = 1;
const LOOPBACK_HOST = ['127', '0', '0', '1'].join('.');
const SOCKET_ID = 'easyeda-mcp-pro-bridge';

let socketHandle: SocketHandle | null = null;
let connectedPort: number | null = null;
let preferredPort = BRIDGE_PORT;
let connectionState: ConnectionState = 'disconnected';
let activeConnectPromise: Promise<void> | null = null;
let reconnectAttempts = 0;
let connectRunId = 0;
let manualDisconnectRequested = false;
let reconnectTimer: RuntimeTimerHandle | null = null;
let heartbeatTimer: RuntimeTimerHandle | null = null;
let lastServerActivityMs = 0;
let lastLocalConnectionDiagnostic: LocalConnectionDiagnostic | null = null;
let externalInteractionWarningShown = false;
// Updated from the server's `hello` message; matches BRIDGE_MAX_PAYLOAD_SIZE default
// until the handshake completes.
let bridgeMaxPayloadSize = 1_048_576;
// From the server's hello: whether it reassembles chunked frames (A5) and the
// aggregate cap for one chunked payload. When unset, fall back to single-frame
// sends limited by bridgeMaxPayloadSize, exactly as before.
let serverSupportsChunking = false;
let maxAggregatePayloadSize = 1_048_576;
// From the server's hello: whether it accepts hot-swap pushes (dev mode only).
let serverHotSwapEnabled = false;

function getGlobal(): EasyedaGlobal | null {
  if (typeof eda !== 'undefined' && eda) return eda;
  return globalThis as unknown as EasyedaGlobal;
}

const runtimeTimers = createRuntimeTimers(
  () => readPath<EasyedaTimerApi>(getGlobal(), 'sys_Timer'),
  globalThis as any,
  SOCKET_ID,
);

function recordLocalConnectionDiagnostic(diagnostic: LocalConnectionDiagnostic): void {
  log(`Local bridge connection phase ${diagnostic.phase}`, {
    port: diagnostic.port,
    transport: diagnostic.transport,
    message: diagnostic.message,
  });
  const effectivePriority = diagnostic.priority + (diagnostic.port === preferredPort ? 1_000 : 0);
  if (
    !lastLocalConnectionDiagnostic ||
    effectivePriority >= lastLocalConnectionDiagnostic.priority
  ) {
    lastLocalConnectionDiagnostic = { ...diagnostic, priority: effectivePriority };
  }
}

function localConnectionDiagnosticSuffix(): string {
  if (!lastLocalConnectionDiagnostic) return '';
  return ` — ${lastLocalConnectionDiagnostic.message}`;
}

function showToast(message: string): void {
  const safeMessage = String(message);
  const messageType = getInfoToastType();

  const sysMessage = getSysMessage();
  if (sysMessage?.showToastMessage) {
    try {
      sysMessage.showToastMessage(safeMessage, messageType);
      return;
    } catch (error) {
      log('sysMessage.showToastMessage failed', { message: safeMessage, error: String(error) });
    }
  }

  const toastMessage = readPath<EasyedaToastApi>(getGlobal(), 'sys_ToastMessage');
  if (toastMessage?.showMessage) {
    try {
      toastMessage.showMessage(safeMessage, messageType);
      return;
    } catch (error) {
      log('toastMessage.showMessage failed', { message: safeMessage, error: String(error) });
    }
  }

  log(safeMessage);
}

function showExternalInteractionHintOnce(error?: unknown): void {
  const message =
    'MCP Bridge needs EasyEDA External Interactions permission. Enable it in Extension Manager for MCP Pro Bridge.';
  log(message, error);
  if (externalInteractionWarningShown) return;
  externalInteractionWarningShown = true;
  showToast(message);
}

// ── Dispatcher wiring ────────────────────────────────────────────────────────
// The toolkit hands the dispatcher everything it needs from the loader. All
// runtime globals go through it so the identical dispatcher code works baked
// (extension script scope) and hot-swapped (AsyncFunction eval scope).

const dispatcherToolkit: DispatcherToolkit = {
  getEda: () => {
    if (typeof eda !== 'undefined' && eda) return eda;
    return (globalThis as { eda?: unknown }).eda;
  },
  getEDA: () => {
    if (typeof EDA !== 'undefined' && EDA) return EDA;
    return (globalThis as { EDA?: unknown }).EDA;
  },
  getApi: () => {
    if (typeof api !== 'undefined' && api) return api;
    return (globalThis as { api?: unknown }).api;
  },
  getGlobal: () => getGlobal(),
  log,
  showToast,
  // With chunked sends (A5) a single logical payload may span many frames, so
  // the dispatcher's binary self-limit is the aggregate cap, not the frame cap.
  getBridgeMaxPayloadSize: () =>
    serverSupportsChunking ? maxAggregatePayloadSize : bridgeMaxPayloadSize,
  normalizeCanvasBinaryResult: (value, fallbackFileName) =>
    normalizeCanvasBinaryResult(value, fallbackFileName, bridgeMaxPayloadSize),
  getBridgeVersion: () => BRIDGE_VERSION,
};

const bakedDispatcher: Dispatcher = createDispatcher(dispatcherToolkit);
let activeDispatcher: Dispatcher = bakedDispatcher;

function dispatchViaActive(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return activeDispatcher.dispatch(method, params);
}

// ── Local full-access extensions (fork-only) ─────────────────────────────────
// The upstream modular dispatcher does not implement the editor/tab
// orchestration methods (headless multi-tab navigation + document targeting) or
// the native PCB-authoring methods this fork exposes through src/tools/L1_editor.ts
// and src/tools/L1_pcb_write.ts. They are handled here in the loader — alongside
// handleLoaderMethod and BEFORE the dispatcher — so they survive a dispatcher
// hot swap. Every entry below must also be present in EasyedaApiMethodSchema on
// the server, otherwise the methodListHash comparison reports a registry mismatch.

const LOCAL_EXTENSION_METHODS = [
  'editor.activateDocument',
  'editor.closeDocument',
  'editor.listTabs',
  'editor.openDocument',
  'editor.screenshot',
  'editor.tileAll',
  'editor.zoomToAll',
  'pcb.addBoardOutline',
  'pcb.addHole',
  'pcb.addPad',
  'pcb.addSilkLine',
  'pcb.addSilkText',
  'pcb.addSolidRegion',
  'pcb.importProjectFile',
  'pcb.importSesRoute',
  'pcb.save',
  'project.getInfo',
] as const;

const LOCAL_EXTENSION_METHOD_SET: ReadonlySet<string> = new Set(LOCAL_EXTENSION_METHODS);

function newBridgeError(
  code: string,
  message: string,
  suggestion: string,
  data?: unknown,
): Error {
  const error = new Error(message) as Error & {
    code?: string;
    suggestion?: string;
    data?: unknown;
  };
  error.code = code;
  error.suggestion = suggestion;
  if (data !== undefined) error.data = data;
  return error;
}

function localApiRoots(): unknown[] {
  const roots: unknown[] = [];
  const edaRoot = dispatcherToolkit.getEda();
  const edaUpper = dispatcherToolkit.getEDA();
  const apiRoot = dispatcherToolkit.getApi();
  if (edaRoot) roots.push(edaRoot);
  if (edaUpper) roots.push(edaUpper);
  if (apiRoot) roots.push(apiRoot);
  roots.push(globalThis);
  return roots;
}

// EasyEDA Pro exposes the same class under both `pcb_Foo` and `PCB_Foo`
// depending on build; try both casings for every candidate path.
function withClassNameVariants(paths: readonly string[]): string[] {
  const variants: string[] = [];
  for (const path of paths) {
    variants.push(path);
    const parts = path.split('.');
    const className = parts[0];
    if (!className) continue;
    const rest = parts.slice(1).join('.');
    const suffix = rest ? `.${rest}` : '';
    const lowerPrefixMatch = className.match(/^([a-z]+)_(.+)$/);
    const upperPrefixMatch = className.match(/^([A-Z]+)_(.+)$/);
    if (lowerPrefixMatch?.[1] && lowerPrefixMatch[2]) {
      variants.push(`${lowerPrefixMatch[1].toUpperCase()}_${lowerPrefixMatch[2]}${suffix}`);
    }
    if (upperPrefixMatch?.[1] && upperPrefixMatch[2]) {
      variants.push(`${upperPrefixMatch[1].toLowerCase()}_${upperPrefixMatch[2]}${suffix}`);
    }
  }
  return [...new Set(variants)];
}

async function localCallFirst(paths: readonly string[], ...args: unknown[]): Promise<unknown> {
  const allPaths = withClassNameVariants(paths);
  for (const root of localApiRoots()) {
    for (const path of allPaths) {
      const fn = readPath<unknown>(root, path);
      if (typeof fn === 'function') {
        return await (fn as (...callArgs: unknown[]) => unknown).apply(
          readPathParent(root, path),
          args,
        );
      }
    }
  }
  throw newBridgeError(
    'METHOD_NOT_FOUND',
    `No EasyEDA API implementation found for ${paths.join(' or ')}`,
    'Verify the bridge extension supports the installed EasyEDA Pro version.',
  );
}

// ── Editor / tab orchestration (headless multi-tab + document targeting) ─────

// Flatten a DMT_EditorControl split-screen tree into a flat tab list. The tree
// nests tabs under `tabs` and recurses through `children` (IDMT_EditorSplitScreenItem).
function flattenSplitScreenTabs(
  node: Record<string, unknown> | undefined | null,
): Array<Record<string, unknown>> {
  if (!node || typeof node !== 'object') return [];
  const out: Array<Record<string, unknown>> = [];
  const splitScreenId = typeof node.id === 'string' ? node.id : undefined;
  const tabs = Array.isArray(node.tabs) ? node.tabs : [];
  for (const tab of tabs) {
    if (tab && typeof tab === 'object') {
      out.push({ ...(tab as Record<string, unknown>), splitScreenId });
    }
  }
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    out.push(...flattenSplitScreenTabs(child as Record<string, unknown>));
  }
  return out;
}

// Renderable canvas tab documentTypes (EDMT_EditorDocumentType): SCHEMATIC_PAGE=1,
// PCB=3, PCB_2D_PREVIEW=12, PCB_3D_PREVIEW=15, PANEL=26, PANEL_3D_PREVIEW=27.
// HOME(-1), BLANK(0), PROJECT(5) are NOT canvases and yield no rendered image.
const CANVAS_DOCUMENT_TYPES = new Set([1, 3, 12, 15, 26, 27]);

// Duck-typed Blob check: the value may be a Blob from another realm (worker /
// sandbox), where `instanceof Blob` fails but it still has arrayBuffer()/size.
function isUsableBlob(value: unknown): value is Blob {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { arrayBuffer?: unknown; size?: unknown };
  return typeof candidate.arrayBuffer === 'function' || typeof candidate.size === 'number';
}

function describeValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value !== 'object') return typeof value;
  const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
  const size = (value as { size?: unknown }).size;
  return `${ctor ?? 'object'}${typeof size === 'number' ? `(size=${size})` : ''}`;
}

// Convert a canvas-render Blob into a base64 payload. Robust across realms: uses
// arrayBuffer() when present, else falls back to FileReader.readAsDataURL so a
// valid cross-realm Blob is never wrongly dropped as "not available".
async function blobToImagePayload(
  blob: unknown,
): Promise<{ imageBase64: string; mime: string; bytes: number } | null> {
  if (!isUsableBlob(blob)) return null;
  const typedBlob = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof typedBlob.arrayBuffer === 'function') {
    const buffer = await typedBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length === 0) return null;
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i] as number);
    }
    return { imageBase64: btoa(binary), mime: typedBlob.type || 'image/png', bytes: bytes.length };
  }
  if (typeof FileReader !== 'undefined') {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsDataURL(typedBlob as Blob);
    });
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    const b64 = dataUrl.slice(comma + 1);
    if (!b64) return null;
    const semi = dataUrl.indexOf(';');
    const mime = dataUrl.startsWith('data:') && semi > 5 ? dataUrl.slice(5, semi) : 'image/png';
    // base64 length * 3/4 (minus padding) ~= byte count
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    return { imageBase64: b64, mime, bytes: Math.floor((b64.length * 3) / 4) - padding };
  }
  return null;
}

// Grab a rendered canvas image. Tries the requested/last-focused canvas first,
// then (if that yields nothing) resolves actual canvas tabs from the split-screen
// tree and retries each - so a headless flow with focus on a non-canvas page
// still gets an image. Returns rich diagnostics when nothing renders.
async function captureCanvasImage(requestedTabId?: string): Promise<Record<string, unknown>> {
  const attempts: Array<{ tabId: string | null; returned: string }> = [];

  async function tryGrab(tabId?: string): Promise<Record<string, unknown> | null> {
    const raw = await localCallFirst(['dmt_EditorControl.getCurrentRenderedAreaImage'], tabId);
    attempts.push({ tabId: tabId ?? null, returned: describeValue(raw) });
    return await blobToImagePayload(raw);
  }

  // 1) As requested (explicit tabId) or last-focused canvas (undefined).
  let payload = await tryGrab(requestedTabId);
  let canvasTabs: Array<Record<string, unknown>> = [];

  // 2) Fallback: enumerate real canvas tabs and try each. Some builds only
  //    render the *focused* canvas, so if a background grab yields nothing we
  //    activate that tab and retry once before giving up on it.
  if (!payload) {
    const tree = (await localCallFirst(['dmt_EditorControl.getSplitScreenTree'])) as
      | Record<string, unknown>
      | undefined;
    canvasTabs = flattenSplitScreenTabs(tree).filter((tab) =>
      CANVAS_DOCUMENT_TYPES.has(Number(tab.documentType)),
    );
    for (const tab of canvasTabs) {
      const tabId = typeof tab.tabId === 'string' ? tab.tabId : undefined;
      if (!tabId) continue;
      if (tabId !== requestedTabId) {
        payload = await tryGrab(tabId);
        if (payload) break;
      }
      // Activate-then-retry (last resort for focus-only-render builds).
      try {
        await localCallFirst(['dmt_EditorControl.activateDocument'], tabId);
        await new Promise((resolve) => runtimeTimers.setTimeout(() => resolve(undefined), 150));
      } catch (error) {
        log('canvas capture activation failed', String(error));
      }
      payload = await tryGrab(tabId);
      if (payload) break;
    }
  }

  if (payload) return { ...payload };
  return {
    not_available: true,
    reason:
      'getCurrentRenderedAreaImage returned no image for the focused canvas or any open canvas tab. Open/activate a schematic or PCB tab, or pass an explicit tabId.',
    attempts,
    canvasTabs: canvasTabs.map((tab) => ({
      tabId: tab.tabId,
      title: tab.title,
      documentType: tab.documentType,
    })),
  };
}

// ── Native PCB authoring ─────────────────────────────────────────────────────
// All signatures below are confirmed against @jlceda/pro-api-types (the official
// EasyEDA Pro extension API typings). withClassNameVariants() tries both PCB_ and
// pcb_ casings, so the canonical 'PCB_<Class>.<method>' candidate resolves at runtime.

// EPCB_LayerId values used as the `layer` argument on create(...).
const PCB_LAYER = {
  TOP: 1,
  BOTTOM: 2,
  TOP_SILK: 3,
  BOTTOM_SILK: 4,
  BOARD_OUTLINE: 11,
  MULTI: 12,
  DOCUMENT: 13,
  MECHANICAL: 14,
} as const;

// Accept either nested [[x,y],...] or flat [x,y,x,y,...] and return [x,y] pairs.
function toXYPairs(points: unknown): Array<[number, number]> {
  if (!Array.isArray(points)) return [];
  if (points.length > 0 && Array.isArray(points[0])) {
    return (points as unknown[][]).map((point) => [Number(point[0]), Number(point[1])]);
  }
  const flat = (points as unknown[]).map(Number);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pairs.push([flat[i] as number, flat[i + 1] as number]);
  return pairs;
}

// Normalize a create(...) result (an IPCB_Primitive* instance or id string) to
// a { primitiveId } shape for the MCP layer.
function pcbId(result: unknown, prefix: string): { primitiveId: string } {
  let id = '';
  if (typeof result === 'string') {
    id = result;
  } else if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    const getter = record.getState_PrimitiveId;
    const fromGetter =
      typeof getter === 'function' ? (getter as () => unknown).call(record) : undefined;
    id = String(record.primitiveId ?? record.uuid ?? record.id ?? fromGetter ?? '');
  }
  return { primitiveId: id || `${prefix}_${Date.now()}` };
}

// Build an EasyEDA TPCB_PolygonSourceArray from a shape descriptor. Grammar (per
// the official typings): polygon = [x1,y1,'L',x2,y2,...]; rect = ['R',x,y,w,h,rot,round];
// circle = ['CIRCLE',cx,cy,r]. A single polygon auto-closes. Throws on a
// degenerate (<3-point) polygon or any non-finite coordinate.
function polygonSource(shape: string, params: Record<string, unknown>): Array<string | number> {
  let source: Array<string | number>;
  if (shape === 'circle') {
    source = ['CIRCLE', Number(params.cx), Number(params.cy), Number(params.radius)];
  } else if (shape === 'rect') {
    source = [
      'R',
      Number(params.x),
      Number(params.y),
      Number(params.width),
      Number(params.height),
      Number(params.rotation ?? 0),
      Number(params.round ?? 0),
    ];
  } else {
    const pairs = toXYPairs(params.points);
    if (pairs.length < 3) {
      throw newBridgeError(
        'INVALID_POLYGON',
        `polygon region needs at least 3 points (got ${pairs.length}).`,
        'Pass a points array describing a closed area.',
      );
    }
    source = [];
    pairs.forEach(([x, y], index) => {
      if (index === 0) source.push(x, y, 'L');
      else source.push(x, y);
    });
  }
  for (const value of source) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw newBridgeError(
        'INVALID_GEOMETRY',
        `${shape} region has a non-finite coordinate (${String(value)}).`,
        'Provide every coordinate/size field required for this shape.',
      );
    }
  }
  return source;
}

// Build an IPCB_Polygon (the complexPolygon/polygon arg for Fill/Pour/Region/
// Polyline) via PCB_MathPolygon.createPolygon. Throws INVALID_POLYGON if the
// runtime cannot build a polygon, rather than passing a raw source array that
// PCB_PrimitiveFill.create (which requires an IPCB_Polygon) would reject.
async function buildPolygon(shape: string, params: Record<string, unknown>): Promise<unknown> {
  const source = polygonSource(shape, params);
  const polygon = await localCallFirst(['PCB_MathPolygon.createPolygon'], source);
  if (!polygon) {
    throw newBridgeError(
      'INVALID_POLYGON',
      `PCB_MathPolygon.createPolygon could not build a ${shape} polygon.`,
      'Check that the shape parameters (points/rect/circle) describe a valid enclosed area.',
    );
  }
  return polygon;
}

async function dispatchLocalExtensionMethod(
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (method) {
    // ---- Editor / tab orchestration (headless multi-tab, document targeting) ----
    // All wrap DMT_EditorControl / DMT_Project. These are tab-addressable and do
    // NOT mutate design content, so an agent can navigate/open/inspect any tab in
    // the currently-open project without the user focusing it manually.
    case 'project.getInfo':
      return localCallFirst(['dmt_Project.getCurrentProjectInfo']);
    case 'editor.listTabs': {
      const tree = (await localCallFirst(['dmt_EditorControl.getSplitScreenTree'])) as
        | Record<string, unknown>
        | undefined;
      return { tabs: flattenSplitScreenTabs(tree), tree: tree ?? null };
    }
    case 'editor.openDocument': {
      const tabId = (await localCallFirst(
        ['dmt_EditorControl.openDocument'],
        params.documentUuid,
        params.splitScreenId,
      )) as string | undefined;
      if (tabId === undefined) {
        throw newBridgeError(
          'OPEN_DOCUMENT_FAILED',
          `openDocument returned undefined for ${String(params.documentUuid)}`,
          'The uuid must be a sheet-page / PCB / panel uuid within the currently-open project.',
        );
      }
      return { tabId };
    }
    case 'editor.activateDocument': {
      const ok = (await localCallFirst(
        ['dmt_EditorControl.activateDocument'],
        params.tabId,
      )) as boolean;
      return { ok: ok === true };
    }
    case 'editor.closeDocument': {
      const ok = (await localCallFirst(
        ['dmt_EditorControl.closeDocument'],
        params.tabId,
      )) as boolean;
      return { ok: ok === true };
    }
    case 'editor.screenshot':
      return captureCanvasImage(typeof params.tabId === 'string' ? params.tabId : undefined);
    case 'editor.zoomToAll':
      return localCallFirst(['dmt_EditorControl.zoomToAllPrimitives'], params.tabId);
    case 'editor.tileAll': {
      const ok = (await localCallFirst([
        'dmt_EditorControl.tileAllDocumentToSplitScreen',
      ])) as boolean;
      return { ok: ok === true };
    }

    // ---- Native PCB authoring ----
    case 'pcb.addBoardOutline': {
      // Board frame = a single PCB_PrimitivePolyline on layer 11 (BOARD_OUTLINE) —
      // the canonical representation (EasyEDA's own default board outline is
      // exactly a CIRCLE/rect polyline on layer 11).
      //
      // IMPORTANT: PCB_PrimitiveArc.create returns an id but does NOT register in
      // EasyEDA Pro's current build (verified live 2026-07-03) — the outline is
      // authored as a polyline, never as arcs.
      const outlineWidth = Number(params.lineWidth ?? 0.2);
      const outlineShape = String(params.shape ?? 'rect');
      const outlinePolygon = await buildPolygon(outlineShape, params);
      const outlineResult = await localCallFirst(
        ['PCB_PrimitivePolyline.create'],
        '',
        PCB_LAYER.BOARD_OUTLINE,
        outlinePolygon,
        outlineWidth,
      );
      return pcbId(outlineResult, 'outline');
    }
    case 'pcb.addPad': {
      // PCB_PrimitivePad.create(layer, padNumber, x, y, rotation, padShape, net, hole, ...)
      // padShape default ['ELLIPSE', w, h]; hole null = SMD, ['ROUND', d] = THT.
      const padShape =
        (params.padShape as unknown) ??
        ['ELLIPSE', Number(params.width ?? 1.5), Number(params.height ?? params.width ?? 1.5)];
      const padHole =
        (params.hole as unknown) ??
        (params.holeDiameter ? ['ROUND', Number(params.holeDiameter)] : null);
      const padResult = await localCallFirst(
        ['PCB_PrimitivePad.create'],
        params.layer ?? (padHole ? PCB_LAYER.MULTI : PCB_LAYER.TOP),
        String(params.padNumber ?? '1'),
        params.x,
        params.y,
        params.rotation ?? 0,
        padShape,
        (params.netName as string) ?? '',
        padHole,
      );
      return pcbId(padResult, 'pad');
    }
    case 'pcb.addHole': {
      // No dedicated hole class: NPTH = pad on MULTI(12) with a hole and
      // metallization=false; plated mounting hole = metallization=true.
      const holeDiameter = Number(params.holeDiameter ?? params.diameter ?? 1);
      const hole = (params.hole as unknown) ?? ['ROUND', holeDiameter];
      const holeShape =
        (params.padShape as unknown) ?? ['ELLIPSE', holeDiameter + 0.2, holeDiameter + 0.2];
      const holeResult = await localCallFirst(
        ['PCB_PrimitivePad.create'],
        PCB_LAYER.MULTI,
        String(params.padNumber ?? '1'),
        params.x,
        params.y,
        0,
        holeShape,
        '',
        hole,
        0,
        0,
        0,
        params.plated === true,
      );
      return pcbId(holeResult, 'hole');
    }
    case 'pcb.addSilkText': {
      // PCB_PrimitiveString.create(layer, x, y, text, fontFamily, fontSize,
      // lineWidth, alignMode, rotation, reverse, expansion, mirror, primitiveLock).
      // alignMode 5 = CENTER. fontFamily must be pre-imported into EasyEDA.
      const textResult = await localCallFirst(
        ['PCB_PrimitiveString.create'],
        params.layer ?? PCB_LAYER.TOP_SILK,
        params.x,
        params.y,
        String(params.text ?? ''),
        String(params.fontFamily ?? 'NotoSansSC-Regular'),
        Number(params.fontSize ?? 1),
        Number(params.lineWidth ?? 0.15),
        Number(params.alignMode ?? 5),
        Number(params.rotation ?? 0),
        params.reverse === true,
        Number(params.expansion ?? 0),
        params.mirror === true,
        false,
      );
      return pcbId(textResult, 'silktext');
    }
    case 'pcb.addSilkLine': {
      // Silkscreen artwork = PCB_PrimitiveLine on layer 3|4, one call per segment.
      const silkPairs = toXYPairs(params.points);
      const silkLayer = params.layer ?? PCB_LAYER.TOP_SILK;
      const silkWidth = Number(params.lineWidth ?? params.width ?? 0.15);
      const silkIds: string[] = [];
      for (let i = 0; i + 1 < silkPairs.length; i += 1) {
        const start = silkPairs[i] as [number, number];
        const end = silkPairs[i + 1] as [number, number];
        const segment = await localCallFirst(
          ['PCB_PrimitiveLine.create'],
          '',
          silkLayer,
          start[0],
          start[1],
          end[0],
          end[1],
          silkWidth,
        );
        silkIds.push(pcbId(segment, 'silkline').primitiveId);
      }
      return { primitiveId: silkIds[0] ?? `silkline_${Date.now()}`, segmentIds: silkIds };
    }
    case 'pcb.addSolidRegion': {
      // PCB_PrimitiveFill.create(layer, complexPolygon: IPCB_Polygon, net?, fillMode?, lineWidth?)
      const fillPolygon = await buildPolygon(String(params.shape ?? 'polygon'), params);
      const fillResult = await localCallFirst(
        ['PCB_PrimitiveFill.create'],
        params.layer ?? PCB_LAYER.TOP,
        fillPolygon,
        (params.netName as string) ?? '',
      );
      return pcbId(fillResult, 'fill');
    }
    case 'pcb.save': {
      // PCB_Document.save(uuid) — persists extension-authored primitives (a
      // documented FAQ note: created objects are NOT preserved until save()).
      // save() requires a real document uuid; refuse a nullish one rather than
      // silently no-op and lose all authored geometry.
      const saveUuid = params.documentUuid ?? params.uuid;
      if (saveUuid === undefined || saveUuid === null || saveUuid === '') {
        throw newBridgeError(
          'MISSING_DOCUMENT_UUID',
          'pcb.save requires the open PCB document/board uuid.',
          'Pass documentUuid (the board uuid) — PCB_Document.save() will not persist authored primitives without it.',
        );
      }
      return localCallFirst(['PCB_Document.save'], saveUuid);
    }
    case 'pcb.importProjectFile': {
      // Read a local file (desktop client only; needs external-interaction perm)
      // and import it via the File>Import engine (KiCad/Altium/EAGLE/...).
      const importFile = await localCallFirst(
        ['SYS_FileSystem.readFileFromFileSystem'],
        params.filePath,
      );
      if (!importFile) {
        throw newBridgeError(
          'FILE_NOT_READ',
          `Could not read file: ${String(params.filePath)}`,
          'Path must be absolute + exist; readFileFromFileSystem is desktop-client only and needs the extension external-interaction permission.',
        );
      }
      const importProps = (params.props as unknown) ?? {
        importOption: 'ImportDocumentExtractLibraries',
        associateFootprint: true,
        associate3DModel: true,
      };
      const importSaveTo = params.existingProjectUuid
        ? { operation: 'Existing Project', existingProjectUuid: params.existingProjectUuid }
        : ((params.saveTo as unknown) ?? undefined);
      return localCallFirst(
        ['SYS_FileManager.importProjectByProjectFile'],
        importFile,
        params.fileType ?? 'KiCad',
        importProps,
        importSaveTo,
      );
    }
    case 'pcb.importSesRoute': {
      // PCB_Document.importAutoRouteSesFile(File) — applies Freerouting SES routing
      // onto the OPEN board (which must already have components + nets + outline).
      const sesFile = await localCallFirst(
        ['SYS_FileSystem.readFileFromFileSystem'],
        params.filePath,
      );
      if (!sesFile) {
        throw newBridgeError(
          'FILE_NOT_READ',
          `Could not read SES file: ${String(params.filePath)}`,
          'Path must be absolute + exist; desktop-client only.',
        );
      }
      return localCallFirst(['PCB_Document.importAutoRouteSesFile'], sesFile);
    }
    default:
      throw newBridgeError(
        'METHOD_NOT_ALLOWED',
        `Unsupported local bridge method: ${method}`,
        'Update the extension loader or call a supported method.',
      );
  }
}

async function handleLocalExtensionMethod(
  method: string,
  params: Record<string, unknown>,
): Promise<{ handled: boolean; result?: unknown }> {
  if (!LOCAL_EXTENSION_METHOD_SET.has(method)) return { handled: false };
  return { handled: true, result: await dispatchLocalExtensionMethod(method, params) };
}


// ── Hot-swap machinery (dev builds only) ─────────────────────────────────────
// The MCP server (with BRIDGE_HOT_SWAP_ENABLED=true) pushes a freshly built
// dispatcher bundle as system.hotSwap.begin/chunk/commit; commit verifies the
// sha256, evals the bundle via AsyncFunction (same mechanism as api.execute),
// and atomically swaps the active dispatcher. These methods are handled here
// in the loader — BEFORE the dispatcher — so a broken pushed dispatcher can
// always be replaced or reverted.

const HOTSWAP_COMPILED = typeof __MCP_DEV_HOTSWAP__ !== 'undefined' && __MCP_DEV_HOTSWAP__ === true;

interface HotSwapBuffer {
  chunks: Array<string | undefined>;
  totalChunks: number;
  byteLength: number;
  sha256: string;
  buildId: string;
  received: number;
  bytes: number;
}

let hotSwapBuffer: HotSwapBuffer | null = null;
// Same algorithm as the server's computeMethodRegistryHash: sha256 of the
// sorted method list joined by ',', hex, first 16 chars. Sent in the
// handshake so a stale dispatcher fails loudly server-side.
let activeMethodListHash = '';

async function sha256Hex(text: string): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) {
    throw newLoaderError(
      'EASYEDA_API_ERROR',
      'crypto.subtle is not available in this runtime',
      'Hot swap and method-list hashing require a secure context.',
    );
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function newLoaderError(code: string, message: string, suggestion: string): Error {
  const error = new Error(message);
  Object.assign(error, { code, suggestion });
  return error;
}

function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

async function refreshMethodListHash(): Promise<void> {
  try {
    // Locale-independent ordering: must produce byte-identical input to the
    // server's computeMethodRegistryHash (do NOT use localeCompare here).
    const sorted = [...activeDispatcher.methodList, ...LOCAL_EXTENSION_METHODS].sort(
      compareCodeUnits,
    );
    activeMethodListHash = (await sha256Hex(sorted.join(','))).slice(0, 16);
  } catch (error) {
    log('failed to compute method list hash', String(error));
    activeMethodListHash = '';
  }
}

function loaderStatus(): Record<string, unknown> {
  return {
    loaderVersion: EXTENSION_INFO.extensionVersion,
    bridgeVersion: BRIDGE_VERSION,
    activeDispatcher: activeDispatcher === bakedDispatcher ? 'baked' : 'pushed',
    buildId: activeDispatcher.buildId,
    bakedBuildId: bakedDispatcher.buildId,
    methodCount: activeDispatcher.methodList.length + LOCAL_EXTENSION_METHODS.length,
    methodListHash: activeMethodListHash,
    hotSwapCompiled: HOTSWAP_COMPILED,
    hotSwapEnabled: HOTSWAP_COMPILED && serverHotSwapEnabled,
  };
}

function assertHotSwapAllowed(): void {
  if (!HOTSWAP_COMPILED) {
    throw newLoaderError(
      'DEV_MODE_REQUIRED',
      'This extension build does not include hot-swap support.',
      'Import a dev build of the extension (scripts/build.mjs with MCP_DEV_HOTSWAP=true).',
    );
  }
  if (!serverHotSwapEnabled) {
    throw newLoaderError(
      'DEV_MODE_REQUIRED',
      'The connected MCP server has not enabled hot swap.',
      'Start the server with BRIDGE_HOT_SWAP_ENABLED=true (non-production only).',
    );
  }
}

async function commitHotSwap(): Promise<unknown> {
  const buffer = hotSwapBuffer;
  hotSwapBuffer = null;
  if (!buffer) {
    throw newLoaderError(
      'INVALID_PARAMS',
      'No hot-swap transfer in progress',
      'Send system.hotSwap.begin and all chunks before commit.',
    );
  }
  if (buffer.received !== buffer.totalChunks) {
    throw newLoaderError(
      'INVALID_PARAMS',
      `Hot-swap transfer incomplete: ${buffer.received}/${buffer.totalChunks} chunks received`,
      'Resend the bundle from system.hotSwap.begin.',
    );
  }
  const source = buffer.chunks.join('');
  const actualByteLength = new TextEncoder().encode(source).byteLength;
  if (actualByteLength !== buffer.byteLength) {
    throw newLoaderError(
      'INVALID_PARAMS',
      `Hot-swap bundle size mismatch: expected ${buffer.byteLength} bytes, got ${actualByteLength}`,
      'Resend the bundle from system.hotSwap.begin.',
    );
  }
  const actualSha = await sha256Hex(source);
  if (actualSha !== buffer.sha256) {
    throw newLoaderError(
      'UNAUTHORIZED',
      'Hot-swap bundle sha256 verification failed',
      'Resend the bundle from system.hotSwap.begin.',
    );
  }

  const globalScope = globalThis as { __mcpDispatcherFactory?: unknown };
  delete globalScope.__mcpDispatcherFactory;
  const AsyncFunction = Object.getPrototypeOf(async function () {})
    .constructor as FunctionConstructor;
  try {
    // eslint-disable-next-line no-restricted-syntax -- the checksum-verified hot-swap path is development-only and regression-tested.
    const run = new AsyncFunction(source) as () => Promise<void>;
    await run();
  } catch (error) {
    delete globalScope.__mcpDispatcherFactory;
    throw newLoaderError(
      'EASYEDA_API_ERROR',
      `Hot-swap bundle failed to evaluate: ${String(error)}`,
      'The previous dispatcher remains active. Fix the bundle and push again.',
    );
  }
  const factory = globalScope.__mcpDispatcherFactory;
  delete globalScope.__mcpDispatcherFactory;
  if (typeof factory !== 'function') {
    throw newLoaderError(
      'EASYEDA_API_ERROR',
      'Hot-swap bundle did not register __mcpDispatcherFactory',
      'Build the bundle from dispatcher-entry.ts (pnpm build in the extension package).',
    );
  }

  const candidate = (factory as (toolkit: DispatcherToolkit) => Dispatcher)(dispatcherToolkit);
  if (
    !candidate ||
    typeof candidate.dispatch !== 'function' ||
    !Array.isArray(candidate.methodList) ||
    typeof candidate.buildId !== 'string'
  ) {
    throw newLoaderError(
      'EASYEDA_API_ERROR',
      'Hot-swap factory returned an invalid dispatcher',
      'The previous dispatcher remains active. Fix the bundle and push again.',
    );
  }

  activeDispatcher = candidate;
  await refreshMethodListHash();
  log(`hot-swapped dispatcher to build ${candidate.buildId}`);
  showToast(`MCP Bridge: dispatcher hot-swapped (${candidate.buildId})`);
  return {
    swapped: true,
    buildId: candidate.buildId,
    methodCount: candidate.methodList.length,
    methodListHash: activeMethodListHash,
  };
}

/**
 * Loader-level methods, handled before the dispatcher so they keep working
 * even when a pushed dispatcher is broken. Returns handled:false for every
 * regular bridge method.
 */
async function handleLoaderMethod(
  method: string,
  params: Record<string, unknown>,
): Promise<{ handled: boolean; result?: unknown }> {
  switch (method) {
    case 'system.loaderStatus':
      return { handled: true, result: loaderStatus() };
    case 'system.hotSwap.begin': {
      assertHotSwapAllowed();
      const totalChunks = Number(params.totalChunks);
      const byteLength = Number(params.byteLength);
      const sha256 = String(params.sha256 ?? '');
      const buildId = String(params.buildId ?? '');
      if (
        !Number.isInteger(totalChunks) ||
        totalChunks < 1 ||
        totalChunks > 4096 ||
        !Number.isInteger(byteLength) ||
        byteLength < 1 ||
        !/^[0-9a-f]{64}$/.test(sha256) ||
        !buildId
      ) {
        throw newLoaderError(
          'INVALID_PARAMS',
          'system.hotSwap.begin requires totalChunks, byteLength, sha256 and buildId',
          'Use the server-side pushDispatcher helper.',
        );
      }
      hotSwapBuffer = {
        chunks: new Array<string | undefined>(totalChunks),
        totalChunks,
        byteLength,
        sha256,
        buildId,
        received: 0,
        bytes: 0,
      };
      return { handled: true, result: { ready: true, buildId } };
    }
    case 'system.hotSwap.chunk': {
      assertHotSwapAllowed();
      const buffer = hotSwapBuffer;
      const seq = Number(params.seq);
      const data = typeof params.data === 'string' ? params.data : undefined;
      if (!buffer) {
        throw newLoaderError(
          'INVALID_PARAMS',
          'No hot-swap transfer in progress',
          'Send system.hotSwap.begin first.',
        );
      }
      if (!Number.isInteger(seq) || seq < 0 || seq >= buffer.totalChunks || data === undefined) {
        throw newLoaderError(
          'INVALID_PARAMS',
          'system.hotSwap.chunk requires a valid seq and data',
          'Use the server-side pushDispatcher helper.',
        );
      }
      if (buffer.chunks[seq] === undefined) {
        buffer.received += 1;
        buffer.bytes += data.length;
      } else {
        buffer.bytes += data.length - (buffer.chunks[seq]?.length ?? 0);
      }
      // Defensive cap: never buffer more than 4x the announced size.
      if (buffer.bytes > buffer.byteLength * 4) {
        hotSwapBuffer = null;
        throw newLoaderError(
          'INVALID_PARAMS',
          'Hot-swap transfer exceeded the announced byteLength budget',
          'Resend the bundle from system.hotSwap.begin.',
        );
      }
      buffer.chunks[seq] = data;
      return {
        handled: true,
        result: { received: buffer.received, totalChunks: buffer.totalChunks },
      };
    }
    case 'system.hotSwap.commit': {
      assertHotSwapAllowed();
      return { handled: true, result: await commitHotSwap() };
    }
    case 'system.hotSwap.revert': {
      assertHotSwapAllowed();
      hotSwapBuffer = null;
      const wasPushed = activeDispatcher !== bakedDispatcher;
      activeDispatcher = bakedDispatcher;
      await refreshMethodListHash();
      if (wasPushed) {
        log('reverted to baked dispatcher');
        showToast('MCP Bridge: reverted to baked dispatcher');
      }
      return {
        handled: true,
        result: { reverted: wasPushed, buildId: activeDispatcher.buildId },
      };
    }
    default:
      return { handled: false };
  }
}

// ── Remote relay ─────────────────────────────────────────────────────────────

let remoteRelayClient: RemoteRelayClient | null = null;

function requestRemoteApproval(prompt: RemoteApprovalPrompt): Promise<RemoteApprovalDecision> {
  const dialog = readPath<EasyedaDialogApi>(getGlobal(), 'sys_Dialog');
  const expiresAtMs = Date.parse(prompt.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return Promise.resolve('timeout');
  }
  const showConfirmationMessage = dialog?.showConfirmationMessage?.bind(dialog);
  if (!showConfirmationMessage) {
    log('Remote approval dialog unavailable', { toolName: prompt.toolName });
    showToast('Remote approval dialog is unavailable; request rejected.');
    return Promise.resolve('rejected');
  }

  return new Promise<RemoteApprovalDecision>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish('timeout'), Math.max(0, expiresAtMs - Date.now()));
    function finish(decision: RemoteApprovalDecision): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(decision);
    }

    const project = prompt.activeProject?.projectName ?? 'current EasyEDA project';
    const summary = [
      prompt.actionSummary,
      `Method: ${prompt.toolName}`,
      `Risk: ${prompt.riskLevel}`,
      `Project: ${project}`,
      `Input hash: ${prompt.inputHash.slice(0, 12)}`,
    ].join('\n');
    try {
      showConfirmationMessage(
        summary,
        'Remote MCP Approval',
        'Approve',
        'Reject',
        (mainButtonClicked) => finish(mainButtonClicked ? 'approved' : 'rejected'),
      );
    } catch (error) {
      log('Remote approval dialog failed', error);
      finish('rejected');
    }
  });
}

function getRemoteRelayClient(): RemoteRelayClient {
  remoteRelayClient ??= new RemoteRelayClient({
    extensionVersion: EXTENSION_INFO.extensionVersion,
    log,
    showToast,
    readActiveProject: readRemoteActiveProject,
    executeToolRequest: (toolName, input) =>
      dispatchViaActive(toolName, isRecord(input) ? input : {}),
    requestApproval: requestRemoteApproval,
    timers: runtimeTimers,
    createWebSocket: (url) => {
      const WebSocketCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
      if (typeof WebSocketCtor !== 'function') {
        throw new Error('WebSocket is unavailable in the EasyEDA extension runtime.');
      }
      return new WebSocketCtor(url);
    },
  });
  return remoteRelayClient;
}

function readRemoteActiveProject():
  | { projectName?: string; documentType: 'schematic' | 'pcb' | 'unknown'; url?: string }
  | undefined {
  const href = typeof location !== 'undefined' ? location.href : undefined;
  const title = typeof document !== 'undefined' ? document.title : undefined;
  const projectName = title && title.trim() ? title.trim() : undefined;
  if (!href && !projectName) return undefined;
  const lower = `${href ?? ''} ${projectName ?? ''}`.toLowerCase();
  const documentType = lower.includes('pcb')
    ? 'pcb'
    : lower.includes('sch')
      ? 'schematic'
      : 'unknown';
  return { projectName, documentType, url: href };
}

function connectRemoteRelayInternal(
  mode: Exclude<RemoteRelayMode, 'disabled'> = 'hosted',
  relayUrl?: string,
  pairingCode?: string,
): void {
  getRemoteRelayClient().connect({ mode, relayUrl, pairingCode });
}

function disconnectRemoteRelayInternal(): void {
  getRemoteRelayClient().disconnect('user_disabled');
  showToast('Remote Relay disabled');
}

function showRemoteRelayStatusInternal(): void {
  const status = getRemoteRelayClient().getStatus();
  const project = status.activeProject?.projectName ?? 'no active project detected';
  const retry =
    status.nextReconnectDelayMs !== undefined
      ? ` | retry: ${Math.ceil(status.nextReconnectDelayMs / 1000)}s`
      : '';
  const attempts =
    status.reconnectAttempts && status.reconnectAttempts > 0
      ? ` | attempts: ${status.reconnectAttempts}`
      : '';
  const error = status.lastError ? ` | last error: ${status.lastError}` : '';
  showToast(
    `Remote Relay: ${status.mode}/${status.state} | project: ${project}${attempts}${retry}${error}`,
  );
}

// ── Socket lifecycle ─────────────────────────────────────────────────────────

function createSocket(
  id: string,
  url: string,
  onOpen: () => void,
  onMessage: (data: string) => void,
  onClose: () => void,
  onError: (error: unknown) => void,
  options: CreateSocketOptions = {},
): SocketHandle | null {
  const sysWs = getWsApi();

  // Try easyeda-register first (may throw if external interaction is denied).
  // Only the API's real connected callback may mark the socket open. Calling
  // onOpen speculatively while WebSocket.readyState is CONNECTING makes send()
  // throw and closes an otherwise healthy loopback connection.
  if (!options.skipRegister && sysWs?.register && sysWs.send) {
    let openFired = false;
    const fireOpen = (): void => {
      if (openFired) return;
      openFired = true;
      onOpen();
    };

    try {
      sysWs.register(
        id,
        url,
        (event) => onMessage(String(isRecord(event) && 'data' in event ? event.data : event)),
        fireOpen,
      );
      return { type: 'easyeda-register', id };
    } catch (err) {
      showExternalInteractionHintOnce(err);
      log('register() threw, falling through', err);
    }
  }

  // Fallback: easyeda-create (different API path, may have different permissions)
  if (sysWs?.create) {
    try {
      const socket = sysWs.create(url);
      socket.onopen = onOpen;
      socket.onmessage = (event) => onMessage(String(isRecord(event) ? event.data : event));
      socket.onclose = onClose;
      socket.onerror = onError;
      return { type: 'easyeda-create', raw: socket };
    } catch (err) {
      log('create() threw, falling through', err);
    }
  }

  // Last resort: raw browser WebSocket (works outside extension sandbox).
  // Resolve via globalThis because some EasyEDA runtimes shadow the bare
  // WebSocket identifier while preserving the constructor on the global.
  const BrowserWebSocketCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (typeof BrowserWebSocketCtor === 'function') {
    try {
      const socket = new BrowserWebSocketCtor(url);
      socket.onopen = onOpen;
      socket.onmessage = (event) => onMessage(String(event.data));
      socket.onclose = onClose;
      socket.onerror = onError;
      return { type: 'browser', raw: socket };
    } catch (err) {
      log('WebSocket() threw', err);
    }
  }

  return null;
}

let chunkIdCounter = 0;

function send(data: JsonValue): void {
  const payload = JSON.stringify(data);

  // A5: split payloads that would exceed the server's per-frame cap into
  // chunk envelopes the server reassembles. An oversized single frame closes
  // the whole connection (code 4009); chunking turns that into a normal send.
  // Only used when the server's hello advertised chunk support.
  if (serverSupportsChunking && payload.length > Math.floor(bridgeMaxPayloadSize / 2)) {
    // JSON-escaping a payload slice can inflate it (quotes/backslashes), so
    // budget a quarter of the frame cap per chunk to stay comfortably under.
    const chunkSize = Math.max(16_384, Math.floor(bridgeMaxPayloadSize / 4));
    const total = Math.ceil(payload.length / chunkSize);
    const id = `chk_${Date.now()}_${++chunkIdCounter}`;
    for (let seq = 0; seq < total; seq += 1) {
      sendRaw(
        JSON.stringify({
          type: 'chunk',
          id,
          seq,
          total,
          data: payload.slice(seq * chunkSize, (seq + 1) * chunkSize),
        }),
      );
    }
    return;
  }

  sendRaw(payload);
}

function sendRaw(payload: string): void {
  const sysWs = getWsApi();

  if (socketHandle?.type === 'easyeda-register' && sysWs?.send) {
    try {
      sysWs.send(socketHandle.id ?? SOCKET_ID, payload);
      return;
    } catch (err) {
      log('sysWs.send threw exception', err);
      recoverConnection('Bridge send failed; reconnecting');
    }
    return;
  }

  try {
    socketHandle?.raw?.send?.(payload);
  } catch (err) {
    log('socket raw send threw exception', err);
    recoverConnection('Bridge socket send failed; reconnecting');
  }
}

function closeHandle(handle: SocketHandle | null): void {
  if (!handle) return;

  const sysWs = getWsApi();
  if (handle.type === 'easyeda-register' && sysWs?.close) {
    try {
      sysWs.close(handle.id ?? SOCKET_ID);
      return;
    } catch (err) {
      log('sysWs.close threw exception', err);
    }
    return;
  }

  try {
    handle.raw?.close?.();
  } catch (err) {
    log('handle raw close threw exception', err);
  }
}

function closeSocket(): void {
  closeHandle(socketHandle);
  socketHandle = null;
  connectedPort = null;
  connectionState = 'disconnected';
  lastServerActivityMs = 0;
}

function recoverConnection(reason: string): void {
  const wasConnected = connectionState === 'connected' && connectedPort !== null;
  const wasConnecting = connectionState === 'connecting';
  if (!wasConnected && !wasConnecting && !socketHandle) return;

  log(reason);
  stopHeartbeat();
  closeHandle(socketHandle);
  socketHandle = null;
  connectedPort = null;
  lastServerActivityMs = 0;

  if (wasConnecting) {
    // A failed handshake is one failed port attempt, not a disconnected session.
    // Keep the scan state intact so connectToPort can time out and continue.
    connectionState = 'connecting';
    return;
  }

  connectionState = 'disconnected';
  if (
    shouldReconnectAfterSocketFailure({
      wasConnected,
      manualDisconnectRequested,
      autoConnectEnabled,
    })
  ) {
    scheduleReconnect();
  }
}

function sendHandshake(): void {
  const sessionToken =
    typeof BRIDGE_SESSION_TOKEN !== 'undefined' ? BRIDGE_SESSION_TOKEN : undefined;
  const handshake: Record<string, unknown> = {
    type: 'handshake',
    protocol: BRIDGE_PROTOCOL,
    protocolVersion: BRIDGE_VERSION,
    contractVersion: BRIDGE_CONTRACT_VERSION,
    clientName: 'easyeda-mcp-pro',
    extensionVersion: EXTENSION_INFO.extensionVersion,
    easyedaVersion: getEasyedaVersion(),
    devMode: false,
    loaderVersion: EXTENSION_INFO.extensionVersion,
  };
  // Lets the server fail loudly when this extension serves stale dispatch
  // logic. Computed asynchronously at startup/swap; omitted if not ready yet.
  if (activeMethodListHash) {
    handshake.methodListHash = activeMethodListHash;
  }
  if (sessionToken) {
    handshake.sessionToken = sessionToken;
  }
  send(handshake as JsonValue);
}

function getEasyedaVersion(): string | undefined {
  const maybeVersion = readPath<unknown>(getGlobal(), 'sys_Environment.getVersion');
  if (typeof maybeVersion === 'function') {
    try {
      return String(maybeVersion());
    } catch (error) {
      log('failed to read EasyEDA version', String(error));
      return undefined;
    }
  }
  return undefined;
}

function startHeartbeat(): void {
  stopHeartbeat();
  lastServerActivityMs = Date.now();
  heartbeatTimer = runtimeTimers.setInterval(() => {
    if (connectedPort === null) return;
    const nowMs = Date.now();
    if (hasHeartbeatTimedOut(lastServerActivityMs, nowMs)) {
      recoverConnection(`Bridge heartbeat timeout; silent for ${nowMs - lastServerActivityMs}ms`);
      return;
    }
    send({ type: 'heartbeat', timestamp: nowMs, source: 'extension' });
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    runtimeTimers.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  lastServerActivityMs = 0;
}

function bridgeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return String(error);
}

async function handleRequest(message: BridgeRequest): Promise<void> {
  const startedAt = Date.now();
  try {
    // Loader-level methods (hot swap, loader status) are handled before the
    // dispatcher so a broken pushed dispatcher can always be replaced.
    const loaderResult = await handleLoaderMethod(message.method, message.params ?? {});
    let result: unknown;
    if (loaderResult.handled) {
      result = loaderResult.result;
    } else {
      // Fork-only methods (editor/tab orchestration, native PCB authoring) are
      // handled next, still before the dispatcher, so they survive a hot swap.
      const localResult = await handleLocalExtensionMethod(
        message.method,
        message.params ?? {},
      );
      result = localResult.handled
        ? localResult.result
        : await activeDispatcher.dispatch(message.method, message.params);
    }
    send({
      id: message.id,
      type: 'response',
      ok: true,
      result: result as JsonValue,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const record = isRecord(error) ? error : {};
    const response: BridgeResponse = {
      id: message.id,
      type: 'response',
      ok: false,
      error: {
        code: String(record.code ?? 'EASYEDA_API_ERROR'),
        message: bridgeErrorMessage(error),
        suggestion: String(record.suggestion ?? 'Check EasyEDA Pro and extension logs.'),
        data: record.data,
      },
      durationMs: Date.now() - startedAt,
    };
    send(response as unknown as JsonValue);
  }
}

function applyHelloPayload(record: Record<string, unknown>): void {
  if (record.contractVersion !== BRIDGE_CONTRACT_VERSION) {
    log('Bridge hello contract version mismatch', {
      expected: BRIDGE_CONTRACT_VERSION,
      actual: record.contractVersion,
    });
  }
  const supportedVersions = Array.isArray(record.supportedProtocolVersions)
    ? record.supportedProtocolVersions
    : [];
  if (!supportedVersions.includes(BRIDGE_VERSION)) {
    log('Bridge hello does not include this extension protocol version', {
      protocolVersion: BRIDGE_VERSION,
      supportedProtocolVersions: supportedVersions,
    });
  }
  if (typeof record.maxPayloadSize === 'number' && record.maxPayloadSize > 0) {
    bridgeMaxPayloadSize = record.maxPayloadSize;
  }
  serverSupportsChunking = record.supportsChunking === true;
  maxAggregatePayloadSize = bridgeMaxPayloadSize;
  if (typeof record.maxAggregatePayloadSize === 'number' && record.maxAggregatePayloadSize > 0) {
    maxAggregatePayloadSize = record.maxAggregatePayloadSize;
  }
  serverHotSwapEnabled = record.hotSwapEnabled === true;
  log('Bridge handshake accepted');
}

function handleHeartbeatMessage(source: 'server' | 'extension' | undefined): void {
  if (source === 'extension') return;
  send({ type: 'heartbeat', timestamp: Date.now(), source: 'extension' });
}

function handleMessage(raw: string): InboundMessageType {
  const message = JSON.parse(raw) as { type?: string; source?: 'server' | 'extension' };
  if (isServerActivityMessage(message.type, message.source)) {
    lastServerActivityMs = Date.now();
  }
  switch (message.type) {
    case 'hello':
      applyHelloPayload(message as Record<string, unknown>);
      return 'hello';
    case 'heartbeat':
      handleHeartbeatMessage(message.source);
      return 'heartbeat';
    case 'request':
      void handleRequest(message as BridgeRequest);
      return 'request';
    default:
      return 'ignored';
  }
}

async function connectToPort(
  port: number,
  runId: number,
  showSuccessToast: boolean,
  timeoutMs: number,
): Promise<boolean> {
  const url = `ws://${LOOPBACK_HOST}:${port}`;
  const socketId = `${SOCKET_ID}-${runId}-${port}`;
  return new Promise((resolve) => {
    let settled = false;
    let handle: SocketHandle | null = null;
    let socketGeneration = 0;
    let socketOpened = false;
    let handshakeSent = false;
    let registerFallbackTimer: RuntimeTimerHandle | null = null;

    const clearRegisterFallback = (): void => {
      if (!registerFallbackTimer) return;
      runtimeTimers.clearTimeout(registerFallbackTimer);
      registerFallbackTimer = null;
    };

    const finish = (connected: boolean): void => {
      if (settled) return;
      settled = true;
      clearRegisterFallback();
      runtimeTimers.clearTimeout(timeout);
      resolve(connected);
    };

    const timeout = runtimeTimers.setTimeout(() => {
      clearRegisterFallback();
      if (handshakeSent) {
        recordLocalConnectionDiagnostic({
          phase: 'hello-timeout',
          port,
          transport: handle?.type,
          message: `Socket opened on port ${port}, but the MCP bridge hello was not received.`,
          priority: 90,
        });
      } else if (handle?.type !== 'easyeda-register') {
        recordLocalConnectionDiagnostic({
          phase: 'socket-open-timeout',
          port,
          transport: handle?.type,
          message: `The ${handle?.type ?? 'WebSocket'} path did not open on port ${port}.`,
          priority: 50,
        });
      }
      if (socketHandle === handle) {
        socketHandle = null;
      }
      closeHandle(handle);
      finish(false);
    }, timeoutMs);

    const startSocket = (options: CreateSocketOptions = {}): SocketHandle | null => {
      const generation = ++socketGeneration;
      socketOpened = false;
      handshakeSent = false;
      let attemptHandle: SocketHandle | null = null;
      const isCurrentGeneration = (): boolean =>
        runId === connectRunId && generation === socketGeneration;
      const resolvedHandle = (): SocketHandle =>
        attemptHandle ?? { type: 'easyeda-register', id: socketId };

      try {
        attemptHandle = createSocket(
          socketId,
          url,
          () => {
            if (settled || !isCurrentGeneration()) {
              closeHandle(attemptHandle);
              return;
            }
            socketOpened = true;
            clearRegisterFallback();
            socketHandle = resolvedHandle();
            handshakeSent = true;
            log('Local bridge socket opened; sending handshake', {
              port,
              transport: socketHandle.type,
            });
            sendHandshake();
          },
          (data) => {
            if (!isCurrentGeneration()) return;
            try {
              const messageType = handleMessage(data);
              if (messageType === 'hello' && !settled) {
                socketHandle = resolvedHandle();
                connectedPort = port;
                connectionState = 'connected';
                reconnectAttempts = 0;
                manualDisconnectRequested = false;
                lastLocalConnectionDiagnostic = null;
                startHeartbeat();
                if (showSuccessToast) {
                  showToast(`MCP Bridge connected to local server`);
                }
                finish(true);
              }
            } catch (error) {
              log('Bridge message error', error);
            }
          },
          () => {
            if (!isCurrentGeneration()) return;
            clearRegisterFallback();
            const currentHandle = resolvedHandle();
            const wasActiveConnection =
              socketHandle === currentHandle && connectionState === 'connected';
            if (!settled) {
              recordLocalConnectionDiagnostic({
                phase: 'socket-closed',
                port,
                transport: currentHandle.type,
                message: `The ${currentHandle.type} path closed before the bridge handshake completed on port ${port}.`,
                priority: 60,
              });
            }
            if (socketHandle === currentHandle) {
              stopHeartbeat();
              socketHandle = null;
              connectedPort = null;
              connectionState = 'disconnected';
            }
            if (!settled) {
              finish(false);
            }
            if (wasActiveConnection && !manualDisconnectRequested && runId === connectRunId) {
              scheduleReconnect();
            }
          },
          (error) => {
            if (!isCurrentGeneration()) return;
            clearRegisterFallback();
            const currentHandle = resolvedHandle();
            recordLocalConnectionDiagnostic({
              phase: 'socket-error',
              port,
              transport: currentHandle.type,
              message: `The ${currentHandle.type} path failed on port ${port}: ${bridgeErrorMessage(error)}`,
              priority: 70,
            });
            if (socketHandle === currentHandle) {
              socketHandle = null;
            }
            closeHandle(currentHandle);
            finish(false);
          },
          options,
        );
      } catch (error) {
        log('createSocket threw', error);
        closeHandle(attemptHandle);
        return null;
      }

      handle = attemptHandle;
      if (!attemptHandle) {
        recordLocalConnectionDiagnostic({
          phase: 'socket-api-unavailable',
          port,
          message: `No usable EasyEDA or browser WebSocket API was available for port ${port}.`,
          priority: 80,
        });
        return null;
      }

      if (!settled && attemptHandle.type === 'easyeda-register') {
        const registerHandle = attemptHandle;
        registerFallbackTimer = runtimeTimers.setTimeout(() => {
          if (settled || !isCurrentGeneration() || socketOpened) return;
          registerFallbackTimer = null;
          recordLocalConnectionDiagnostic({
            phase: 'register-open-timeout',
            port,
            transport: registerHandle.type,
            message:
              `SYS_WebSocket.register() accepted port ${port} but did not invoke its open callback; ` +
              'the extension closed that handle and tried a safe alternate socket API.',
            priority: 85,
          });
          closeHandle(registerHandle);
          if (socketHandle === registerHandle) socketHandle = null;

          const fallbackHandle = startSocket({ skipRegister: true });
          if (!fallbackHandle) {
            finish(false);
          }
        }, REGISTER_OPEN_CALLBACK_TIMEOUT_MS);
      }

      return attemptHandle;
    };

    handle = startSocket();
    if (!handle) finish(false);
  });
}
async function connectInternal(mode: ConnectMode = 'manual'): Promise<void> {
  const manual = mode === 'manual';

  if (connectionState === 'connected' && connectedPort !== null) {
    if (manual) {
      showToast(`MCP Bridge already connected to local server`);
    }
    return;
  }

  if (connectionState === 'connecting' && activeConnectPromise) {
    if (!manual) return activeConnectPromise;

    // A manual Connect request should not remain trapped behind an auto-connect
    // scan that may currently be waiting on another port. Cancel the old run and
    // immediately restart from the preferred/base port.
    connectRunId += 1;
    activeConnectPromise = null;
    closeSocket();
  }

  if (reconnectTimer) {
    runtimeTimers.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  manualDisconnectRequested = false;
  connectionState = 'connecting';
  lastLocalConnectionDiagnostic = null;
  const runId = ++connectRunId;

  if (manual) {
    showToast(`MCP Bridge connecting to local server`);
  }

  activeConnectPromise = (async () => {
    try {
      for (const attempt of getLocalBridgeConnectionAttempts(preferredPort)) {
        if (runId !== connectRunId || manualDisconnectRequested) return;
        // Always show success toast so the user knows auto-connect worked.
        const connected = await connectToPort(attempt.port, runId, true, attempt.timeoutMs);
        if (connected) {
          preferredPort = attempt.port;
          return;
        }
      }
    } catch (error) {
      log('connect() threw unexpectedly', error);
    } finally {
      if (runId === connectRunId && connectionState === 'connecting') {
        connectionState = 'disconnected';
        socketHandle = null;
        connectedPort = null;
        const message = `MCP Bridge offline: no local server found${localConnectionDiagnosticSuffix()}`;
        if (manual) {
          showToast(message);
        } else {
          log(message);
        }
        if (!manualDisconnectRequested) {
          scheduleReconnect();
        }
      }

      if (runId === connectRunId) {
        activeConnectPromise = null;
      }
    }
  })();

  return activeConnectPromise;
}

function disconnectInternal(notifyUser: boolean): void {
  if (notifyUser) void updateMenuTitle();
  const wasDisconnected = connectionState === 'disconnected' && !socketHandle;
  const wasConnecting = connectionState === 'connecting';

  manualDisconnectRequested = true;
  connectRunId += 1;
  activeConnectPromise = null;
  reconnectAttempts = 0;
  if (reconnectTimer) {
    runtimeTimers.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopHeartbeat();
  closeSocket();

  if (!notifyUser) return;
  if (wasDisconnected) {
    showToast('MCP Bridge already disconnected');
  } else if (wasConnecting) {
    showToast('MCP Bridge connection cancelled');
  } else {
    showToast('MCP Bridge disconnected. Auto reconnect is paused until Connect.');
  }
}

function disconnectCommandInternal(): void {
  disconnectInternal(true);
}

function showStatusInternal(): void {
  autoConnectEnabled = loadAutoConnectSetting();
  const autoLabel = autoConnectEnabled ? 'Auto-Connect: ON' : 'Auto-Connect: OFF';

  if (connectionState === 'connected' && connectedPort !== null) {
    showToast(`MCP Bridge connected to local server | ${autoLabel}`);
    return;
  }

  if (connectionState === 'connecting') {
    showToast(`MCP Bridge connecting to local server | ${autoLabel}`);
    return;
  }

  if (autoConnectEnabled && !manualDisconnectRequested) {
    showToast(
      `MCP Bridge: waiting for server | ${autoLabel} — retrying (attempt ${reconnectAttempts + 1})`,
    );
    scheduleReconnect();
    return;
  }

  showToast(
    `MCP Bridge disconnected | ${autoLabel} — click Connect to connect${localConnectionDiagnosticSuffix()}`,
  );
}

function scheduleReconnect(): void {
  if (manualDisconnectRequested || reconnectTimer) return;
  reconnectAttempts += 1;
  const delay = reconnectDelayMs(reconnectAttempts);
  reconnectTimer = runtimeTimers.setTimeout(() => {
    reconnectTimer = null;
    if (connectionState === 'disconnected') {
      void connectInternal('auto');
    }
  }, delay);
}

let autoConnectEnabled = true;

function getStorage(): any {
  const globalObj = getGlobal();
  return readPath<any>(globalObj, 'sys_Storage');
}

function loadAutoConnectSetting(): boolean {
  try {
    const storage = getStorage();
    if (storage && typeof storage.getExtensionUserConfig === 'function') {
      const val = storage.getExtensionUserConfig('autoConnect');
      if (val !== undefined) return !!val;
    }
  } catch (e) {
    log('sys_Storage.getExtensionUserConfig unavailable', e);
  }
  return true;
}

async function saveAutoConnectSetting(value: boolean): Promise<void> {
  try {
    const storage = getStorage();
    if (storage && typeof storage.setExtensionUserConfig === 'function') {
      const saved = await storage.setExtensionUserConfig('autoConnect', value);
      if (saved === false) {
        log('sys_Storage.setExtensionUserConfig returned false');
      }
    }
  } catch (e) {
    log('sys_Storage.setExtensionUserConfig unavailable', e);
  }
}

async function updateMenuTitle(): Promise<void> {
  // EasyEDA Pro re-reads extension.json on every menu open; replaceHeaderMenus()
  // cannot persist between opens. State is communicated via toast only.
  log(`menu state: Auto-Connect=${autoConnectEnabled}`);
}

async function setAutoConnectInternal(enabled: boolean): Promise<void> {
  // EasyEDA may evaluate or invoke a menu callback more than once. Setting an
  // explicit target state is idempotent; a duplicate Enable call remains ON.
  autoConnectEnabled = enabled;
  await saveAutoConnectSetting(enabled);
  await updateMenuTitle();
  if (enabled) {
    manualDisconnectRequested = false;
    reconnectAttempts = 0;
    if (connectionState === 'disconnected') {
      await connectInternal('auto');
    }
  } else {
    manualDisconnectRequested = true;
    if (reconnectTimer) {
      runtimeTimers.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }
  showToast(
    enabled
      ? 'Auto-Connect: ON — will reconnect automatically'
      : 'Auto-Connect: OFF — use Connect button to connect',
  );
}

async function enableAutoConnectInternal(): Promise<void> {
  await setAutoConnectInternal(true);
}

async function disableAutoConnectInternal(): Promise<void> {
  await setAutoConnectInternal(false);
}

async function toggleAutoConnectInternal(): Promise<void> {
  await setAutoConnectInternal(!loadAutoConnectSetting());
}

let activationStarted = false;

async function handleActivate(): Promise<void> {
  autoConnectEnabled = loadAutoConnectSetting();
  if (activationStarted) {
    if (autoConnectEnabled && connectionState === 'disconnected' && !activeConnectPromise) {
      void connectInternal('auto');
    }
    return;
  }

  activationStarted = true;
  if (autoConnectEnabled) {
    showToast(`MCP Bridge: Auto-Connect ON — scanning local server`);
    void connectInternal('auto');
  } else {
    showToast('MCP Bridge: Auto-Connect OFF — click Connect to connect');
  }
}

async function activateInternal(_status?: 'onStartupFinished', _arg?: string): Promise<void> {
  await handleActivate();
}

function deactivateInternal(): void {
  activationStarted = false;
  disconnectInternal(false);
  remoteRelayClient?.disconnect('disconnected');
  remoteRelayClient = null;
  const globalScope = globalThis as any;
  const existing = globalScope[PERSISTENT_RUNTIME_KEY] as PersistentRuntime | undefined;
  if (existing?.deactivate === deactivateInternal) {
    delete globalScope[PERSISTENT_RUNTIME_KEY];
  }
}

interface PersistentRuntime {
  activate: typeof activateInternal;
  deactivate: typeof deactivateInternal;
  connect: typeof connectInternal;
  disconnect: typeof disconnectCommandInternal;
  showStatus: typeof showStatusInternal;
  enableAutoConnect: typeof enableAutoConnectInternal;
  disableAutoConnect: typeof disableAutoConnectInternal;
  toggleAutoConnect: typeof toggleAutoConnectInternal;
  connectRemoteRelay: typeof connectRemoteRelayInternal;
  disconnectRemoteRelay: typeof disconnectRemoteRelayInternal;
  showRemoteRelayStatus: typeof showRemoteRelayStatusInternal;
}

const PERSISTENT_RUNTIME_KEY = '__easyedaMcpProBridgeRuntime_v8__';

function getPersistentRuntime(): PersistentRuntime {
  const globalScope = globalThis as any;
  const existing = globalScope[PERSISTENT_RUNTIME_KEY] as PersistentRuntime | undefined;
  if (existing) return existing;

  const runtime: PersistentRuntime = {
    activate: activateInternal,
    deactivate: deactivateInternal,
    connect: connectInternal,
    disconnect: disconnectCommandInternal,
    showStatus: showStatusInternal,
    enableAutoConnect: enableAutoConnectInternal,
    disableAutoConnect: disableAutoConnectInternal,
    toggleAutoConnect: toggleAutoConnectInternal,
    connectRemoteRelay: connectRemoteRelayInternal,
    disconnectRemoteRelay: disconnectRemoteRelayInternal,
    showRemoteRelayStatus: showRemoteRelayStatusInternal,
  };
  globalScope[PERSISTENT_RUNTIME_KEY] = runtime;
  return runtime;
}

const persistentRuntime = getPersistentRuntime();

export async function activate(status?: 'onStartupFinished', arg?: string): Promise<void> {
  await persistentRuntime.activate(status, arg);
}

export function deactivate(): void {
  persistentRuntime.deactivate();
}

export async function connect(mode: ConnectMode = 'manual'): Promise<void> {
  await persistentRuntime.connect(mode);
}

export function disconnect(): void {
  persistentRuntime.disconnect();
}

export function showStatus(): void {
  persistentRuntime.showStatus();
}

export async function enableAutoConnect(): Promise<void> {
  await persistentRuntime.enableAutoConnect();
}

export async function disableAutoConnect(): Promise<void> {
  await persistentRuntime.disableAutoConnect();
}

export async function toggleAutoConnect(): Promise<void> {
  await persistentRuntime.toggleAutoConnect();
}

export function connectRemoteRelay(
  mode: Exclude<RemoteRelayMode, 'disabled'> = 'hosted',
  relayUrl?: string,
  pairingCode?: string,
): void {
  persistentRuntime.connectRemoteRelay(mode, relayUrl, pairingCode);
}

export function disconnectRemoteRelay(): void {
  persistentRuntime.disconnectRemoteRelay();
}

export function showRemoteRelayStatus(): void {
  persistentRuntime.showRemoteRelayStatus();
}

function expose(): void {
  const api = getGlobal();
  if (api) {
    api.connect = connect;
    api.disconnect = disconnect;
    api.showStatus = showStatus;
    api.connectRemoteRelay = connectRemoteRelay;
    api.disconnectRemoteRelay = disconnectRemoteRelay;
    api.showRemoteRelayStatus = showRemoteRelayStatus;
    api.enableAutoConnect = enableAutoConnect;
    api.disableAutoConnect = disableAutoConnect;
    (api as any).toggleAutoConnect = toggleAutoConnect;
    api.activate = activate;
    api.deactivate = deactivate;
  }

  const globalScope = globalThis as any;
  globalScope.connect = connect;
  globalScope.disconnect = disconnect;
  globalScope.showStatus = showStatus;
  globalScope.connectRemoteRelay = connectRemoteRelay;
  globalScope.disconnectRemoteRelay = disconnectRemoteRelay;
  globalScope.showRemoteRelayStatus = showRemoteRelayStatus;
  globalScope.enableAutoConnect = enableAutoConnect;
  globalScope.disableAutoConnect = disableAutoConnect;
  globalScope.toggleAutoConnect = toggleAutoConnect;
  globalScope.activate = activate;
  globalScope.deactivate = deactivate;
}

expose();
log('Extension script loaded');
// Compute the method-list hash early so the first handshake can include it.
void refreshMethodListHash();

// EasyEDA appends activate('onStartupFinished') after evaluating this bundle.
// The exported activate function above starts the connection only after the
// extension runtime (including sys_Timer and sys_WebSocket) is ready.
