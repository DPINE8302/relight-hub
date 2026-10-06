import { session, type Event as ElectronEvent, type WebContents } from "electron";
import { logger } from "./logger";

function isLoopback(url: URL): boolean {
  return (url.protocol === "http:" || url.protocol === "ws:") &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]");
}

export class SecurityPolicy {
  private installed = false;
  private remoteRequestsAttempted = 0;
  private remoteRequestsAllowed = 0;

  constructor(
    private readonly packaged: boolean,
    private readonly canUseMicrophone: () => boolean,
  ) {}

  install(): void {
    if (this.installed) return;
    this.installed = true;
    const appSession = session.defaultSession;

    appSession.on("will-download", this.onWillDownload);

    appSession.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*", "ftp://*/*"] },
      (details, callback) => {
        let allowed = false;
        try {
          allowed = !this.packaged && isLoopback(new URL(details.url));
        } catch {
          allowed = false;
        }
        this.remoteRequestsAttempted += 1;
        if (allowed) this.remoteRequestsAllowed += 1;
        if (!allowed) logger.warn("Blocked renderer network request", { url: details.url, resourceType: details.resourceType });
        callback({ cancel: !allowed });
      },
    );

    appSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
      if (
        permission !== "media" ||
        _webContents === null ||
        !this.isAudienceUrl(requestingOrigin) ||
        !this.isAudienceUrl(_webContents.getURL())
      ) return false;
      return this.canUseMicrophone() && details.mediaType === "audio";
    });

    appSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const mediaTypes = permission === "media" && "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
      const microphoneAllowed =
        permission === "media" &&
        this.isAudienceUrl(details.requestingUrl) &&
        this.isAudienceUrl(webContents.getURL()) &&
        this.canUseMicrophone() &&
        mediaTypes.includes("audio") &&
        !mediaTypes.includes("video");
      const speakerSelectionAllowed =
        permission === "speaker-selection" &&
        this.isAudienceUrl(details.requestingUrl) &&
        this.isAudienceUrl(webContents.getURL());
      const allowed = microphoneAllowed || speakerSelectionAllowed;
      if (!allowed) {
        logger.warn("Denied renderer permission request", {
          permission,
          requestingUrl: details.requestingUrl,
          mediaTypes,
        });
      }
      callback(allowed);
    });

    appSession.setDevicePermissionHandler(() => false);
  }

  dispose(): void {
    if (!this.installed) return;
    this.installed = false;
    const appSession = session.defaultSession;
    appSession.off("will-download", this.onWillDownload);
    appSession.setPermissionCheckHandler(null);
    appSession.setPermissionRequestHandler(null);
    appSession.setDevicePermissionHandler(null);
    appSession.webRequest.onBeforeRequest(null);
  }

  configureWebContents(webContents: WebContents): void {
    webContents.setWindowOpenHandler(({ url }) => {
      logger.warn("Blocked renderer window creation", { url });
      return { action: "deny" };
    });
    webContents.on("will-attach-webview", (event) => {
      event.preventDefault();
      logger.warn("Blocked webview attachment");
    });
    webContents.on("will-navigate", (event, url) => {
      if (!this.isTrustedUrl(url)) {
        event.preventDefault();
        logger.warn("Blocked renderer navigation", { url });
      }
    });
    webContents.on("will-redirect", (event, url) => {
      if (!this.isTrustedUrl(url)) {
        event.preventDefault();
        logger.warn("Blocked renderer redirect", { url });
      }
    });
  }

  isTrustedUrl(value: string): boolean {
    try {
      const url = new URL(value);
      if (url.protocol === "relight-ui:" && (url.hostname === "operator" || url.hostname === "audience")) return true;
      return !this.packaged && isLoopback(url);
    } catch {
      return false;
    }
  }

  getNetworkAudit(): { remoteRequestsAttempted: number; remoteRequestsAllowed: number } {
    return {
      remoteRequestsAttempted: this.remoteRequestsAttempted,
      remoteRequestsAllowed: this.remoteRequestsAllowed,
    };
  }

  private isAudienceUrl(value: string): boolean {
    try {
      const url = new URL(value);
      if (url.protocol === "relight-ui:") return url.hostname === "audience";
      return !this.packaged && isLoopback(url) && url.pathname.endsWith("/audience.html");
    } catch {
      return false;
    }
  }

  private readonly onWillDownload = (event: ElectronEvent): void => {
    event.preventDefault();
    logger.warn("Blocked renderer download request");
  };
}
