import { EventEmitter } from "node:events";
import { join } from "node:path";
import {
  BrowserWindow,
  screen,
  type Display,
  type Event as ElectronEvent,
  type WebContents,
} from "electron";
import { evaluateAudiencePresentation, type AudiencePresentationStatus } from "./audience-presentation";
import { logger } from "./logger";
import { activeDeviceProfile, type AppSettings, type DisplayDescriptor, type WindowRegistry, type WindowRole } from "./types";
import type { SecurityPolicy } from "./security-policy";
import type { RuntimeMode } from "./runtime-mode";

export interface DisplayTopologyEvent {
  reason: "initial" | "added" | "removed" | "metrics-changed" | "settings-changed";
  displays: DisplayDescriptor[];
  audienceDisplay: DisplayDescriptor;
  externalAudienceConnected: boolean;
  developmentFallback: boolean;
}

export interface WindowManagerCallbacks {
  onQuitRequested: () => void;
  onAudienceFailure: (reason: string) => void;
  onDisplayTopology: (event: DisplayTopologyEvent) => void;
  onOperatorRecreated: (webContents: WebContents) => void;
  onAudienceRecreated: (webContents: WebContents) => void;
}

function descriptor(display: Display, primaryDisplayId: number): DisplayDescriptor {
  return {
    id: String(display.id),
    label: display.label.length > 0 ? display.label : `Display ${display.id}`,
    primary: display.id === primaryDisplayId,
    internal: display.internal,
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
    scaleFactor: display.scaleFactor,
    rotation: display.rotation,
  };
}

function preloadPath(role: WindowRole): string {
  return join(__dirname, `../preload/${role}.cjs`);
}

export class WindowManager extends EventEmitter implements WindowRegistry {
  private operatorWindow: BrowserWindow | null = null;
  private audienceWindow: BrowserWindow | null = null;
  private quitting = false;
  private settings: AppSettings;

  constructor(
    initialSettings: AppSettings,
    private readonly securityPolicy: SecurityPolicy,
    private readonly callbacks: WindowManagerCallbacks,
    private readonly runtimeMode: RuntimeMode,
  ) {
    super();
    this.settings = initialSettings;
  }

  async create(): Promise<void> {
    const operator = this.createOperatorWindow();

    const audience = this.createAudienceWindow();

    await Promise.all([this.loadWindow("operator", operator), this.loadWindow("audience", audience)]);
    this.installDisplayListeners();
    await this.applyAudiencePlacement("initial");
  }

  get(role: WindowRole): BrowserWindow | null {
    const window = role === "operator" ? this.operatorWindow : this.audienceWindow;
    return window === null || window.isDestroyed() ? null : window;
  }

  roleFor(webContents: WebContents): WindowRole | null {
    if (this.operatorWindow?.webContents.id === webContents.id) return "operator";
    if (this.audienceWindow?.webContents.id === webContents.id) return "audience";
    return null;
  }

  isTrustedSender(webContents: WebContents, role: WindowRole, frameUrl: string): boolean {
    return this.roleFor(webContents) === role && this.securityPolicy.isTrustedUrl(frameUrl);
  }

  send(role: WindowRole, channel: string, payload: unknown): void {
    const window = this.get(role);
    if (window === null || window.webContents.isDestroyed()) return;
    window.webContents.send(channel, payload);
  }

  getDisplays(): DisplayDescriptor[] {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((display) => descriptor(display, primaryId));
  }

  getAudienceDisplay(): DisplayDescriptor {
    return descriptor(this.chooseAudienceDisplay(), screen.getPrimaryDisplay().id);
  }

  hasExternalAudienceDisplay(): boolean {
    return this.chooseAudienceDisplay().id !== screen.getPrimaryDisplay().id;
  }

  getAudiencePresentationStatus(): AudiencePresentationStatus {
    const profile = activeDeviceProfile(this.settings);
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const configuredDisplayAvailable = this.settings.operationMode === "test"
      ? profile.audienceDisplayId === null || displays.some((display) => String(display.id) === profile.audienceDisplayId)
      : profile.audienceDisplayId !== null && displays.some((display) => String(display.id) === profile.audienceDisplayId);
    const selectedDisplay = this.chooseAudienceDisplay();
    const audience = this.get("audience");
    const webContents = audience?.webContents;
    return evaluateAudiencePresentation({
      configuredDisplayAvailable,
      externalDisplaySelected: selectedDisplay.id !== primary.id,
      fullscreenRequested: profile.audienceFullscreen,
      windowAvailable: audience !== null,
      rendererHealthy: webContents !== undefined &&
        !webContents.isDestroyed() &&
        !webContents.isCrashed() &&
        !webContents.isLoadingMainFrame(),
      visible: audience?.isVisible() ?? false,
      expectedBounds: { ...selectedDisplay.bounds },
      actualBounds: audience === null ? null : { ...audience.getBounds() },
      simpleFullscreen: audience?.isSimpleFullScreen() ?? false,
      alwaysOnTop: audience?.isAlwaysOnTop() ?? false,
    });
  }

  async applySettings(settings: AppSettings): Promise<void> {
    this.settings = settings;
    await this.applyAudiencePlacement("settings-changed");
  }

  focusOperator(): void {
    const operator = this.get("operator");
    if (operator !== null) {
      operator.show();
      operator.focus();
    }
  }

  async recreateAudienceWindow(): Promise<void> {
    if (this.quitting) return;
    const failedWindow = this.audienceWindow;
    if (failedWindow !== null) {
      failedWindow.removeAllListeners("close");
      if (!failedWindow.isDestroyed()) failedWindow.destroy();
    }
    const replacement = this.createAudienceWindow();
    await this.loadWindow("audience", replacement);
    await this.applyAudiencePlacement("settings-changed");
    this.callbacks.onAudienceRecreated(replacement.webContents);
    logger.info("Audience window recreated after runtime recovery");
  }

  prepareToQuit(): void {
    this.quitting = true;
    this.removeDisplayListeners();
    this.operatorWindow?.setClosable(true);
    this.audienceWindow?.setClosable(true);
  }

  closeAll(): void {
    this.prepareToQuit();
    for (const window of [this.audienceWindow, this.operatorWindow]) {
      if (window !== null && !window.isDestroyed()) window.destroy();
    }
    this.audienceWindow = null;
    this.operatorWindow = null;
  }

  private chooseAudienceDisplay(): Display {
    const profile = activeDeviceProfile(this.settings);
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    if (this.settings.operationMode === "test" && profile.audienceDisplayId === null) return primary;
    const configured = profile.audienceDisplayId === null
      ? undefined
      : displays.find((display) => String(display.id) === profile.audienceDisplayId);
    // A missing or unselected Production display never falls through to a
    // different projector. Keeping the audience safely on the primary screen
    // also makes the genuine external-display check fail until the operator
    // explicitly chooses the intended display again.
    return configured ?? primary;
  }

  private async applyAudiencePlacement(reason: DisplayTopologyEvent["reason"]): Promise<void> {
    const profile = activeDeviceProfile(this.settings);
    const audience = this.get("audience");
    if (audience === null) return;
    const primary = screen.getPrimaryDisplay();
    const chosen = this.chooseAudienceDisplay();
    const external = chosen.id !== primary.id;
    const fullScreen = external && profile.audienceFullscreen;

    if (audience.isSimpleFullScreen()) audience.setSimpleFullScreen(false);
    audience.setAlwaysOnTop(false);

    if (external) {
      audience.setMovable(false);
      audience.setResizable(!fullScreen);
      audience.setSkipTaskbar(true);
      audience.setBounds(chosen.bounds, false);
      if (fullScreen) audience.setSimpleFullScreen(true);
      audience.setAlwaysOnTop(true, "floating", 1);
      audience.showInactive();
    } else {
      const width = Math.min(960, Math.max(640, primary.workArea.width - 80));
      const height = Math.round(width * 9 / 16);
      audience.setMovable(true);
      audience.setResizable(true);
      audience.setSkipTaskbar(false);
      audience.setBounds(
        {
          x: primary.workArea.x + primary.workArea.width - width - 24,
          y: primary.workArea.y + primary.workArea.height - height - 24,
          width,
          height,
        },
        false,
      );
      audience.showInactive();
    }

    const event: DisplayTopologyEvent = {
      reason,
      displays: this.getDisplays(),
      audienceDisplay: descriptor(chosen, primary.id),
      externalAudienceConnected: external,
      developmentFallback: !external,
    };
    logger.info("Audience display placement updated", {
      reason,
      audienceDisplayId: event.audienceDisplay.id,
      resolution: `${event.audienceDisplay.bounds.width}x${event.audienceDisplay.bounds.height}`,
      externalAudienceConnected: event.externalAudienceConnected,
      developmentFallback: event.developmentFallback,
    });
    this.callbacks.onDisplayTopology(event);
    this.emit("display-topology", event);
    await Promise.resolve();
  }

  private async loadWindow(role: WindowRole, window: BrowserWindow): Promise<void> {
    const developmentUrl = process.env.ELECTRON_RENDERER_URL;
    if (developmentUrl !== undefined) {
      const base = developmentUrl.endsWith("/") ? developmentUrl : `${developmentUrl}/`;
      await window.loadURL(new URL(`${role}.html`, base).toString());
      return;
    }
    await window.loadURL(`relight-ui://${role}/`);
  }

  private installWindowRecovery(role: WindowRole, window: BrowserWindow): void {
    window.webContents.on("unresponsive", () => {
      logger.error(`${role} renderer became unresponsive`);
      if (role === "audience") this.callbacks.onAudienceFailure("Audience renderer became unresponsive");
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      logger.error(`${role} renderer process exited`, details);
      if (this.quitting) return;
      if (role === "audience") {
        if (this.audienceWindow === window) {
          window.removeAllListeners("close");
          if (!window.isDestroyed()) window.destroy();
          this.audienceWindow = null;
        }
        this.callbacks.onAudienceFailure(`Audience renderer exited: ${details.reason}`);
      } else {
        setTimeout(() => {
          void this.recreateOperatorWindow(window, details.reason);
        }, 250);
      }
    });
    window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame) return;
      logger.error(`${role} renderer failed to load`, { errorCode, errorDescription, validatedUrl });
      if (role === "audience") this.callbacks.onAudienceFailure(`Audience failed to load: ${errorDescription}`);
    });
  }

  private lockTestWindowTitle(role: WindowRole, window: BrowserWindow): void {
    if (!this.runtimeMode.e2e) return;
    const title = role === "operator" ? "RE:Light Engine — Operator" : "RE:Light — Audience";
    window.on("page-title-updated", (event) => {
      event.preventDefault();
      window.setTitle(title);
    });
  }

  private handleOperatorClose(event: ElectronEvent): void {
    if (this.quitting) return;
    event.preventDefault();
    this.callbacks.onQuitRequested();
  }

  private createOperatorWindow(): BrowserWindow {
    const additionalArguments = this.runtimeMode.e2e
      ? [
          "--relight-e2e-preload",
          ...(process.env.RELIGHT_E2E_HID_FIXTURE === "1" ? ["--relight-e2e-hid-fixture-preload"] : []),
        ]
      : [];
    const operator = new BrowserWindow({
      title: this.runtimeMode.e2e ? "RE:Light Engine — Operator" : "RE:Light Engine",
      width: 1280,
      height: 800,
      minWidth: 1040,
      minHeight: 700,
      show: false,
      backgroundColor: "#0B0B0C",
      autoHideMenuBar: false,
      webPreferences: {
        preload: preloadPath("operator"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
        autoplayPolicy: "no-user-gesture-required",
        additionalArguments,
      },
    });
    this.operatorWindow = operator;
    this.lockTestWindowTitle("operator", operator);
    this.securityPolicy.configureWebContents(operator.webContents);
    this.installWindowRecovery("operator", operator);
    operator.once("ready-to-show", () => {
      if (!operator.isDestroyed()) {
        operator.show();
        operator.focus();
      }
    });
    operator.on("close", (event) => this.handleOperatorClose(event));
    return operator;
  }

  private createAudienceWindow(): BrowserWindow {
    const primary = screen.getPrimaryDisplay();
    const initialAudienceDisplay = this.chooseAudienceDisplay();
    const audience = new BrowserWindow({
      title: this.runtimeMode.e2e ? "RE:Light — Audience" : "RE:Light Audience",
      x: initialAudienceDisplay.bounds.x,
      y: initialAudienceDisplay.bounds.y,
      width: initialAudienceDisplay.bounds.width,
      height: initialAudienceDisplay.bounds.height,
      frame: false,
      transparent: false,
      show: false,
      backgroundColor: "#000000",
      resizable: true,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      fullscreenable: true,
      skipTaskbar: initialAudienceDisplay.id !== primary.id,
      webPreferences: {
        preload: preloadPath("audience"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
        backgroundThrottling: false,
        autoplayPolicy: "no-user-gesture-required",
      },
    });
    this.audienceWindow = audience;
    this.lockTestWindowTitle("audience", audience);
    audience.setMenu(null);
    audience.setAutoHideCursor(true);
    this.securityPolicy.configureWebContents(audience.webContents);
    this.installWindowRecovery("audience", audience);
    audience.on("close", (event) => {
      if (!this.quitting) event.preventDefault();
    });
    audience.once("ready-to-show", () => {
      if (!audience.isDestroyed()) audience.showInactive();
    });
    return audience;
  }

  private async recreateOperatorWindow(failedWindow: BrowserWindow, reason: string): Promise<void> {
    if (this.quitting || this.operatorWindow !== failedWindow) return;
    logger.info("Recreating operator window after renderer-process exit", { reason });
    failedWindow.removeAllListeners("close");
    if (!failedWindow.isDestroyed()) failedWindow.destroy();
    const replacement = this.createOperatorWindow();
    try {
      await this.loadWindow("operator", replacement);
      this.callbacks.onOperatorRecreated(replacement.webContents);
    } catch (error) {
      logger.error("Replacement operator window failed to load", error);
    }
  }

  private readonly onDisplayAdded = (): void => {
    void this.applyAudiencePlacement("added");
  };

  private readonly onDisplayRemoved = (): void => {
    const presentation = this.getAudiencePresentationStatus();
    if (!presentation.ready) this.callbacks.onAudienceFailure("Audience display disconnected or no longer selected");
    void this.applyAudiencePlacement("removed");
  };

  private readonly onDisplayMetricsChanged = (): void => {
    void this.applyAudiencePlacement("metrics-changed");
  };

  private installDisplayListeners(): void {
    screen.on("display-added", this.onDisplayAdded);
    screen.on("display-removed", this.onDisplayRemoved);
    screen.on("display-metrics-changed", this.onDisplayMetricsChanged);
  }

  private removeDisplayListeners(): void {
    screen.off("display-added", this.onDisplayAdded);
    screen.off("display-removed", this.onDisplayRemoved);
    screen.off("display-metrics-changed", this.onDisplayMetricsChanged);
  }
}
