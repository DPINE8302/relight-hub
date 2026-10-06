import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { AudienceCommandMessage, AudienceRuntimeEvent, RuntimeSnapshot } from "../shared/contracts";
import type { AppSettings, AudienceMediaCheckRequest, MediaDeviceCatalog, RuntimeHealthReport } from "../main/types";

// Keep this preload self-contained for Electron's sandboxed CommonJS loader.
const CHANNELS = {
  audience: {
    getBootstrap: "relight:audience:get-bootstrap",
    runtimeEvent: "relight:audience-runtime-event",
    runtimeHealth: "relight:audience:runtime-health",
    command: "relight:audience-command",
    snapshot: "relight:runtime-snapshot",
    settings: "relight:audience-settings",
    mediaCheck: "relight:audience-media-check",
    reportMediaDeviceCatalog: "relight:audience:report-media-device-catalog",
    refreshMediaDevices: "relight:audience:refresh-media-devices",
  },
} as const;

export interface AudienceBootstrap {
  snapshot: RuntimeSnapshot;
  content: unknown;
  settings: unknown;
  mediaBaseUrl: "relight-media://content/";
  verificationMode: boolean;
}

export interface AudienceBridge {
  getBootstrap(): Promise<AudienceBootstrap>;
  reportRuntimeEvent(event: AudienceRuntimeEvent): Promise<void>;
  updateRuntimeHealth(report: RuntimeHealthReport): Promise<void>;
  reportMediaDeviceCatalog(catalog: MediaDeviceCatalog): Promise<void>;
  onCommand(listener: (command: AudienceCommandMessage) => void): () => void;
  onSnapshot(listener: (snapshot: RuntimeSnapshot) => void): () => void;
  onSettings(listener: (settings: AppSettings) => void): () => void;
  onMediaCheck(listener: (request: AudienceMediaCheckRequest) => void): () => void;
  onRefreshMediaDevices(listener: () => void): () => void;
}

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const bridge: AudienceBridge = Object.freeze({
  getBootstrap: () => ipcRenderer.invoke(CHANNELS.audience.getBootstrap) as Promise<AudienceBootstrap>,
  reportRuntimeEvent: (event: AudienceRuntimeEvent) =>
    ipcRenderer.invoke(CHANNELS.audience.runtimeEvent, event) as Promise<void>,
  updateRuntimeHealth: (report: RuntimeHealthReport) =>
    ipcRenderer.invoke(CHANNELS.audience.runtimeHealth, report) as Promise<void>,
  reportMediaDeviceCatalog: (catalog: MediaDeviceCatalog) =>
    ipcRenderer.invoke(CHANNELS.audience.reportMediaDeviceCatalog, catalog) as Promise<void>,
  onCommand: (listener: (command: AudienceCommandMessage) => void) =>
    subscribe(CHANNELS.audience.command, listener),
  onSnapshot: (listener: (snapshot: RuntimeSnapshot) => void) =>
    subscribe(CHANNELS.audience.snapshot, listener),
  onSettings: (listener: (settings: AppSettings) => void) =>
    subscribe(CHANNELS.audience.settings, listener),
  onMediaCheck: (listener: (request: AudienceMediaCheckRequest) => void) =>
    subscribe(CHANNELS.audience.mediaCheck, listener),
  onRefreshMediaDevices: (listener: () => void) =>
    subscribe(CHANNELS.audience.refreshMediaDevices, listener),
});

contextBridge.exposeInMainWorld("relightAudience", bridge);
