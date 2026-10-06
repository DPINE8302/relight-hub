import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  type MessageBoxOptions,
} from "electron";
import type { RuntimeSnapshot } from "../shared/contracts";
import { logger } from "./logger";
import type { EngineCommandType } from "./types";

export interface NativeMenuActions {
  command: (type: EngineCommandType) => Promise<void>;
  getSnapshot: () => RuntimeSnapshot;
  showSettings: () => void;
  exportDiagnostics: () => Promise<void>;
}

export type LocalHelpTopic = "quickStart" | "shortcuts" | "productionReadiness";

interface LocalHelpContent {
  title: string;
  message: string;
  detail: string;
}

/**
 * Small, offline help cards are intentionally bundled in the main process.
 * They remain available in the packaged app without opening a URL, exposing a
 * file path, or granting either renderer additional capabilities.
 */
export const LOCAL_HELP: Readonly<Record<LocalHelpTopic, LocalHelpContent>> = {
  quickStart: {
    title: "RE:Light Quick Start",
    message: "Run a five-minute Test rehearsal",
    detail: [
      "1. Choose Test at the top, then open Setup.",
      "2. Choose Run Test Checks and allow Microphone access.",
      "3. Choose Use This Mac’s Microphone, or select the built-in microphone from the list. Speak during Test Signal and wait for the signal check to pass.",
      "4. Open Test Flow, choose Full Flow and 4×, then choose Start Full Test or press Space.",
      "5. Press R at the record prompt, speak for up to six seconds, then press W at the choice prompt. Wait for the app to return to Idle.",
      "",
      "If Start is unavailable, return to Setup and fix the first required row. A Test pass never means Production is ready.",
    ].join("\n"),
  },
  shortcuts: {
    title: "Test Flow Shortcuts",
    message: "Keyboard controls work only in Test Flow",
    detail: [
      "Space — Start; pause or resume a passive scene",
      "R — Record; press again after one second to stop early",
      "W — Choose Again at the final choice",
      "Left / Right Arrow — Previous or next scene",
      "Option-R — Restart the current scene",
      "",
      "Command-Return — Start from the native Experience menu",
      "Command-Shift-P — Pause or resume",
      "Command-Shift-R — Emergency Reset",
      "Command-0 / Command-= / Command-- — Reset, increase, or decrease text size",
      "",
      "Shortcuts do not take over while a field or ordinary control has focus.",
    ].join("\n"),
  },
  productionReadiness: {
    title: "Production Readiness",
    message: "Test and Production are intentionally separate",
    detail: [
      "Do not admit visitors until Production passes with the final media, Mac on AC power, an extended projector, the selected production microphone, tested speakers, Input Monitoring, and two freshly tested assigned USB controls.",
      "",
      "If anything looks or sounds wrong, choose Emergency Reset or press Command-Shift-R. Reset is immediate: it blanks and mutes the audience, stops playback and recording, and deletes temporary visitor audio.",
      "",
      "Export Diagnostics from File if a problem repeats. Diagnostics are saved locally and never uploaded.",
    ].join("\n"),
  },
};

function run(action: () => Promise<void>): void {
  void action().catch((error: unknown) => logger.error("Menu action failed", error));
}

async function showLocalHelp(topic: LocalHelpTopic): Promise<void> {
  const content = LOCAL_HELP[topic];
  const options: MessageBoxOptions = {
    type: "info",
    title: content.title,
    message: content.message,
    detail: content.detail,
    buttons: ["Done"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
  const parent = BrowserWindow.getFocusedWindow();
  if (parent === null) {
    await dialog.showMessageBox(options);
    return;
  }
  await dialog.showMessageBox(parent, options);
}

export function buildNativeMenuTemplate(
  actions: NativeMenuActions,
  applicationName = app.name,
): MenuItemConstructorOptions[] {
  return [
    {
      label: applicationName,
      submenu: [
        { role: "about", label: "About RE:Light Engine" },
        { type: "separator" },
        { label: "Settings…", accelerator: "Command+,", click: actions.showSettings },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: "Quit RE:Light Engine" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "Export Diagnostic Bundle…",
          click: () => run(actions.exportDiagnostics),
        },
      ],
    },
    {
      label: "Experience",
      submenu: [
        {
          label: "Start Experience",
          accelerator: "Command+Return",
          click: () => run(() => actions.command("START")),
        },
        {
          label: "Pause or Resume",
          accelerator: "Command+Shift+P",
          click: () => run(() => actions.command(actions.getSnapshot().status === "PAUSED" ? "RESUME" : "PAUSE")),
        },
        {
          label: "Restart Current Scene",
          accelerator: "Command+Alt+R",
          click: () => run(() => actions.command("RESTART_SCENE")),
        },
        {
          label: "Skip Current Scene",
          accelerator: "Command+Shift+Right",
          click: () => run(() => actions.command("SKIP_SCENE")),
        },
        { type: "separator" },
        {
          label: "Return to Idle",
          accelerator: "Command+Shift+I",
          click: () => run(() => actions.command("RETURN_TO_IDLE")),
        },
        {
          label: "Emergency Reset",
          accelerator: "Command+Shift+R",
          click: () => run(() => actions.command("EMERGENCY_RESET")),
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom", label: "Actual Size", accelerator: "CommandOrControl+0" },
        { role: "zoomIn", label: "Zoom In", accelerator: "CommandOrControl+=" },
        { role: "zoomOut", label: "Zoom Out", accelerator: "CommandOrControl+-" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "RE:Light Quick Start…",
          click: () => run(() => showLocalHelp("quickStart")),
        },
        {
          label: "Test Flow Keyboard Shortcuts",
          click: () => run(() => showLocalHelp("shortcuts")),
        },
        { type: "separator" },
        {
          label: "Production Readiness and Recovery",
          click: () => run(() => showLocalHelp("productionReadiness")),
        },
      ],
    },
  ];
}

export function installNativeMenu(actions: NativeMenuActions): void {
  const template = buildNativeMenuTemplate(actions);
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
