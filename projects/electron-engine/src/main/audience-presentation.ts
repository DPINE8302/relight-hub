export interface RectangleSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AudiencePresentationObservation {
  configuredDisplayAvailable: boolean;
  externalDisplaySelected: boolean;
  fullscreenRequested: boolean;
  windowAvailable: boolean;
  rendererHealthy: boolean;
  visible: boolean;
  expectedBounds: RectangleSnapshot;
  actualBounds: RectangleSnapshot | null;
  simpleFullscreen: boolean;
  alwaysOnTop: boolean;
}

export interface AudiencePresentationStatus {
  ready: boolean;
  detail: string;
}

function sameBounds(left: RectangleSnapshot | null, right: RectangleSnapshot): boolean {
  return left !== null &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height;
}

export function evaluateAudiencePresentation(
  observation: AudiencePresentationObservation,
): AudiencePresentationStatus {
  if (!observation.configuredDisplayAvailable) {
    return { ready: false, detail: "The selected audience display is disconnected" };
  }
  if (!observation.externalDisplaySelected) {
    return { ready: false, detail: "No extended external audience display is connected" };
  }
  if (!observation.fullscreenRequested) {
    return { ready: false, detail: "Enable audience fullscreen before exhibition use" };
  }
  if (!observation.windowAvailable || !observation.rendererHealthy) {
    return { ready: false, detail: "The live audience window or renderer is unavailable" };
  }
  if (!observation.visible) {
    return { ready: false, detail: "The live audience window is not visible" };
  }
  if (!sameBounds(observation.actualBounds, observation.expectedBounds)) {
    return { ready: false, detail: "The live audience window does not exactly cover the selected display" };
  }
  if (!observation.simpleFullscreen) {
    return { ready: false, detail: "The live audience window is not in simple fullscreen" };
  }
  if (!observation.alwaysOnTop) {
    return { ready: false, detail: "The live audience window is not pinned above other windows" };
  }
  return {
    ready: true,
    detail: "The healthy live audience renderer exactly covers the selected fullscreen display",
  };
}
