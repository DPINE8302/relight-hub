import type { RelightBridge } from "./shared/types";
import type { AudienceBridge as ElectronAudienceBridge } from "../preload/audience";
import type { OperatorBridge as ElectronOperatorBridge } from "../preload/operator";

declare global {
  interface Window {
    relight?: RelightBridge;
    relightAudience?: ElectronAudienceBridge;
    relightOperator?: ElectronOperatorBridge;
  }
}

export {};
