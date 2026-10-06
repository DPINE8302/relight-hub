import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import scene01DraftUrl from "../../../../production/scene01_draft1/Scene01_Draft1_480p_v5.mp4?url";
import type {
  CheckStatus,
  CommandResult,
  ExperienceState,
  HealthItem,
  HidBinding,
  OperatorCommand,
  OperatorSettings,
  OperatorSnapshot,
  ProductionInputRole,
} from "../shared/types";
import { dispatchOperatorCommand, getOperatorBridge } from "./bridge";
import {
  CheckIcon,
  DiagnosticsIcon,
  ExportIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  ReturnIcon,
  SceneIcon,
  SettingsIcon,
  StatusIcon,
  WarningIcon,
} from "./Icons";

type ScreenId = "status" | "demo" | "setup" | "test-flow" | "settings" | "diagnostics";
type TestFlowView = "full" | "single";

const navigation: ReadonlyArray<{
  id: ScreenId;
  label: string;
  icon: (props: { className?: string }) => ReactNode;
}> = [
  { id: "status", label: "Status", icon: (props) => <StatusIcon {...props} /> },
  { id: "demo", label: "Demo", icon: (props) => <PlayIcon {...props} /> },
  { id: "setup", label: "Setup", icon: (props) => <CheckIcon {...props} /> },
  { id: "test-flow", label: "Test Flow", icon: (props) => <SceneIcon {...props} /> },
  { id: "settings", label: "Settings", icon: (props) => <SettingsIcon {...props} /> },
  { id: "diagnostics", label: "Diagnostics", icon: (props) => <DiagnosticsIcon {...props} /> },
];

const inputRoles: ReadonlyArray<{
  role: ProductionInputRole;
  number: string;
  thai: string;
  english: string;
}> = [
  { role: "RECORD_BUTTON", number: "Button 1", thai: "บันทึกความฝัน", english: "RECORD" },
  { role: "CHOICE_BUTTON", number: "Button 2", thai: "เลือกอีกครั้ง", english: "CHOOSE AGAIN" },
];

const testShortcuts: ReadonlyArray<{ key: string; label: string }> = [
  { key: "Space", label: "Start · Pause · Resume" },
  { key: "R", label: "Record · Stop after one second" },
  { key: "W", label: "Choose again" },
  { key: "←", label: "Previous scene" },
  { key: "→", label: "Next scene" },
  { key: "⌥ R", label: "Restart scene" },
];

function formatTime(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "00:00.00";
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hundredths = Math.floor((totalSeconds % 1) * 100);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

function formatClock(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

const stateLabels: Record<string, string> = {
  BOOT: "Starting up",
  SYSTEM_CHECK: "Preparing setup",
  IDLE: "Ready to begin",
  MEMORY_INTRO: "Memory introduction",
  WAITING_FOR_RECORD: "Waiting for a dream",
  RECORDING: "Recording the dream",
  DREAM: "Dream",
  PRESSURE: "Pressure",
  NARROWING: "Narrowing",
  FINAL_PROMPT: "Final question",
  WAITING_FOR_CHOICE: "Waiting for a choice",
  RELIGHT: "Choosing again",
  END: "Ending",
  RESETTING: "Resetting safely",
};

function stateLabel(state: ExperienceState): string {
  return stateLabels[state] ?? state
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function stateGuide(state: ExperienceState, recordingStatus: string): { title: string; detail: string } {
  switch (state) {
    case "IDLE":
      return { title: "Begin when you are ready", detail: "Start Full Test, then follow the highlighted prompt here. A rehearsal takes about five minutes." };
    case "WAITING_FOR_RECORD":
      return { title: "Record the dream", detail: "Choose Record Dream below or press R. Speak naturally; the recording stays only in memory." };
    case "RECORDING":
      return { title: "Speak now", detail: "Recording stops at six seconds. After one second, Record Dream or R stops it early." };
    case "WAITING_FOR_CHOICE":
      return { title: "Make the final choice", detail: "Choose Choose Again below or press W to return tomorrow to the participant." };
    case "END":
    case "RESETTING":
      return { title: "Cleaning up safely", detail: "The audience is ending and temporary visitor audio is being cleared before returning to Ready." };
    default:
      return {
        title: "Watch the audience preview",
        detail: recordingStatus === "error"
          ? "The microphone capture failed, but the rehearsal continues without visitor-voice playback."
          : "This scene advances automatically. Use Space to pause or resume while the workspace is active.",
      };
  }
}

function statusCopy(status: CheckStatus): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "checking":
      return "Checking";
    case "simulated":
      return "Test only";
    case "warning":
      return "Attention";
    case "unavailable":
      return "Unavailable";
    case "not-tested":
      return "Not tested";
  }
}

function StatusMark({ status }: { status: CheckStatus }) {
  return (
    <span className={`status-mark status-mark--${status}`}>
      <span aria-hidden="true" className="status-mark__dot" />
      <span>{statusCopy(status)}</span>
    </span>
  );
}

function SectionHeader({
  children,
  description,
  headingId,
}: {
  children: ReactNode;
  description?: ReactNode;
  headingId?: string;
}) {
  return (
    <header className="section-header">
      <h2 id={headingId}>{children}</h2>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

interface CommandButtonProps {
  children: ReactNode;
  command: OperatorCommand;
  disabled?: boolean;
  icon?: ReactNode;
  kind?: "primary" | "secondary" | "destructive";
  pendingCommand: string | null;
  runCommand: (command: OperatorCommand) => Promise<CommandResult>;
  testId?: string;
}

function CommandButton({
  children,
  command,
  disabled = false,
  icon,
  kind = "secondary",
  pendingCommand,
  runCommand,
  testId,
}: CommandButtonProps) {
  const pending = pendingCommand === command.type;
  return (
    <button
      className={`command-button command-button--${kind}`}
      data-testid={testId}
      disabled={disabled || pendingCommand !== null}
      onClick={() => void runCommand(command)}
      type="button"
    >
      {icon}
      <span>{pending ? "Working…" : children}</span>
    </button>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const normalized = Math.max(0, Math.min(1, value));
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(normalized * 100)}
      className="meter"
      role="meter"
    >
      <span className="meter__fill" style={{ inlineSize: `${normalized * 100}%` }} />
    </div>
  );
}

function canChangeMode(snapshot: OperatorSnapshot): boolean {
  return snapshot.runMode === "idle" && ["IDLE", "SYSTEM_CHECK"].includes(snapshot.experienceState);
}

function profilePatch(
  snapshot: OperatorSnapshot,
  patch: Partial<OperatorSettings["production"] & OperatorSettings["test"]>,
): Partial<OperatorSettings> {
  if (snapshot.operationMode === "production") {
    return { production: { ...snapshot.settings.production, ...patch } };
  }
  return { test: { ...snapshot.settings.test, ...patch } };
}

function selectedMicrophone(snapshot: OperatorSnapshot): string {
  return snapshot.settings[snapshot.operationMode].microphoneDeviceId;
}

function microphoneLabel(snapshot: OperatorSnapshot): string {
  const id = selectedMicrophone(snapshot);
  return snapshot.microphones.find((device) => device.id === id)?.label ?? "No microphone selected";
}

function bindingStatus(binding: HidBinding | null, check: HealthItem | undefined): CheckStatus {
  if (!binding) return "not-tested";
  if (!binding.connected) return "failed";
  return check?.status ?? "not-tested";
}

const presentationScenes = [
  { title: "ความทรงจำ", english: "Memory", detail: "Scene 01 Draft 1 · picture and draft sound", durationMs: 18_000, footage: true },
  { title: "ความเป็นไปได้", english: "Possibility", detail: "A young person imagines the futures still open to them.", durationMs: 5_000, footage: false },
  { title: "ทางเลือก", english: "The Choice", detail: "An ordinary school moment becomes a decision.", durationMs: 5_000, footage: false },
  { title: "โลกแคบลง / โรงพยาบาล", english: "Narrowing World / Hospital", detail: "Time passes. The recorded dream is heard once in the hospital.", durationMs: 5_000, footage: false },
  { title: "ตื่น", english: "Wake", detail: "The story returns to the bedroom and ends in silence.", durationMs: 5_000, footage: false },
] as const;

function DemoPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const scene = presentationScenes[sceneIndex];
  const finished = scene === undefined;

  const goToScene = useCallback((index: number) => {
    setSceneIndex(index);
    setElapsedMs(0);
    setVideoError(false);
    setPlaying(true);
    if (index === 0 && videoRef.current) videoRef.current.currentTime = 0;
  }, []);

  useEffect(() => {
    if (sceneIndex !== 0 || !videoRef.current) return;
    if (playing) {
      void videoRef.current.play().catch(() => setPlaying(false));
    } else {
      videoRef.current.pause();
    }
  }, [playing, sceneIndex]);

  useEffect(() => {
    if (!playing || sceneIndex === 0 || finished) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      setElapsedMs((current) => {
        const next = current + delta;
        if (next >= 5_000) {
          window.clearInterval(timer);
          window.requestAnimationFrame(() => goToScene(sceneIndex + 1));
          return 5_000;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [finished, goToScene, playing, sceneIndex]);

  const togglePlayback = () => {
    if (finished) {
      goToScene(0);
      return;
    }
    setPlaying((current) => !current);
  };

  return (
    <div className="page page--demo" data-testid="presentation-demo">
      <header className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Presentation preview · 28 September 2026</p>
          <h1>RE:Light demo</h1>
          <p>One 18-second picture draft, followed by four five-second text cards for footage still in production.</p>
        </div>
        <span className="demo-brief__badge">Development demo</span>
      </header>

      <div className="presentation-stage" aria-label="Presentation stage">
        {finished ? (
          <div className="presentation-card presentation-card--end">
            <span>END OF PREVIEW</span>
            <h2>RE:Light</h2>
            <p>Full v5 film target: 2 minutes. This preview uses draft and text material.</p>
          </div>
        ) : scene.footage ? (
          <video
            aria-label="Scene 01 Draft 1 picture edit"
            className="presentation-video"
            controls
            onEnded={() => goToScene(1)}
            onError={() => { setVideoError(true); setPlaying(false); }}
            onPause={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            onTimeUpdate={(event) => setElapsedMs(event.currentTarget.currentTime * 1000)}
            playsInline
            preload="auto"
            ref={videoRef}
            src={scene01DraftUrl}
          />
        ) : (
          <div className="presentation-card" data-testid="demo-text-scene">
            <span>TEXT PREVIEW · FOOTAGE PENDING</span>
            <h2>{scene.title}</h2>
            <p>{scene.detail}</p>
          </div>
        )}
      </div>

      {videoError ? <p className="inline-fault" role="alert">Scene 01 video could not be loaded. Check this app build before presenting.</p> : null}

      <div className="presentation-controls">
        <div className="presentation-controls__scene">
          <strong>{finished ? "Preview complete" : `Scene ${String(sceneIndex + 1).padStart(2, "0")} / 05 · ${scene.english}`}</strong>
          <span>{finished ? "00:38 total" : `${formatTime(elapsedMs)} / ${formatTime(scene.durationMs)}`}</span>
        </div>
        <div aria-label="Presentation controls" className="presentation-controls__buttons" role="group">
          <button className="compact-button" disabled={sceneIndex === 0} onClick={() => goToScene(Math.max(0, sceneIndex - 1))} type="button">Previous</button>
          <button className="command-button command-button--primary" onClick={togglePlayback} type="button">{finished ? "Replay demo" : playing ? "Pause" : "Play"}</button>
          <button className="compact-button" disabled={finished} onClick={() => goToScene(sceneIndex + 1)} type="button">Next</button>
        </div>
      </div>

      <ol aria-label="Demo scene sequence" className="presentation-timeline">
        {presentationScenes.map((item, index) => (
          <li key={item.english}>
            <button aria-current={sceneIndex === index ? "step" : undefined} onClick={() => goToScene(index)} type="button">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.english}</strong>
              <small>{item.footage ? "18s video draft" : "5s text"}</small>
            </button>
          </li>
        ))}
      </ol>
      <p className="presentation-note">The video’s current audio is a draft. These cards summarize v5; they are not finished scenes or the final 2-minute timeline.</p>
    </div>
  );
}

interface PageProps {
  snapshot: OperatorSnapshot;
  pendingCommand: string | null;
  runCommand: (command: OperatorCommand) => Promise<CommandResult>;
  navigate: (screen: ScreenId) => void;
}

function ModeControl({ snapshot, pendingCommand, runCommand }: PageProps) {
  const unlocked = canChangeMode(snapshot);
  return (
    <div aria-label="Operation mode" className="mode-control" role="group">
      {(["production", "test"] as const).map((mode) => {
        const selected = snapshot.operationMode === mode;
        return (
          <button
            aria-pressed={selected}
            className="mode-control__button"
            data-testid={`mode-${mode}`}
            disabled={!selected && (!unlocked || pendingCommand !== null)}
            key={mode}
            onClick={() => {
              if (!selected) void runCommand({ type: "mode.set", mode });
            }}
            type="button"
          >
            {mode === "production" ? "Production" : "Test"}
          </button>
        );
      })}
    </div>
  );
}

function StatusPage({ snapshot, pendingCommand, runCommand, navigate }: PageProps) {
  const isIdle = snapshot.runMode === "idle" && snapshot.experienceState === "IDLE";
  const canStart = snapshot.canStart && isIdle;
  const canPause = snapshot.runMode === "running" && snapshot.experienceState !== "RECORDING";
  const canResume = snapshot.runMode === "paused";
  const progress = snapshot.playbackDurationMs > 0 ? snapshot.playbackMs / snapshot.playbackDurationMs : 0;
  const isTest = snapshot.operationMode === "test";
  const recordCheck = snapshot.health.find((item) => item.id === "redButton");
  const choiceCheck = snapshot.health.find((item) => item.id === "whiteButton");
  const recordBinding = snapshot.hid.bindings.RECORD_BUTTON;
  const choiceBinding = snapshot.hid.bindings.CHOICE_BUTTON;
  const contentCheck = snapshot.health.find((item) => item.id === "content");
  const videoCheck = snapshot.health.find((item) => item.id === "videoEngine");
  const microphonePermission = snapshot.health.find((item) => item.id === "microphonePermission");
  const microphoneSignal = snapshot.health.find((item) => item.id === "microphoneSignal");
  const testNeedsSetup = isTest && (
    !snapshot.settings.test.microphoneDeviceId ||
    microphonePermission?.status !== "passed" ||
    microphoneSignal?.status !== "passed" ||
    !snapshot.canStart
  );
  const headline = isTest
    ? testNeedsSetup ? "Test setup needs attention" : "Test flow is ready"
    : snapshot.readiness === "ready"
      ? "Ready for production"
      : snapshot.readiness === "checking"
        ? "Checking production hardware"
        : snapshot.readiness === "degraded"
          ? "Production setup is incomplete"
          : "Production is unavailable";
  const productionNeedsMedia = !isTest && (
    contentCheck?.status !== "passed" || videoCheck?.status !== "passed"
  );

  const rows: ReadonlyArray<{ label: string; value: string; status: CheckStatus }> = [
    {
      label: "Engine",
      value: snapshot.runMode === "idle" ? stateLabel(snapshot.experienceState) : `${snapshot.runMode === "paused" ? "Paused" : "Running"} · ${stateLabel(snapshot.experienceState)}`,
      status: snapshot.readiness === "faulted" ? "failed" : snapshot.readiness === "ready" ? "passed" : "not-tested",
    },
    {
      label: "Audience display",
      value: snapshot.audienceDisplayLabel,
      status: isTest ? "simulated" : snapshot.health.find((item) => item.id === "display")?.status ?? "not-tested",
    },
    {
      label: "Content",
      value: isTest ? "Text scene presentation" : snapshot.contentPackLabel,
      status: isTest ? "simulated" : snapshot.health.find((item) => item.id === "content")?.status ?? "not-tested",
    },
    {
      label: "Microphone",
      value: microphoneLabel(snapshot),
      status: snapshot.health.find((item) => item.id === "microphone")?.status ?? "not-tested",
    },
    {
      label: "Sound output",
      value: snapshot.audioOutputLabel,
      status: snapshot.health.find((item) => item.id === "audio")?.status ?? "not-tested",
    },
    {
      label: "Record input",
      value: isTest ? "R key · Test only" : recordBinding ? `${recordBinding.deviceLabel} · ${recordBinding.elementLabel}` : "Not assigned",
      status: isTest ? "simulated" : bindingStatus(recordBinding, recordCheck),
    },
    {
      label: "Choose Again input",
      value: isTest ? "W key · Test only" : choiceBinding ? `${choiceBinding.deviceLabel} · ${choiceBinding.elementLabel}` : "Not assigned",
      status: isTest ? "simulated" : bindingStatus(choiceBinding, choiceCheck),
    },
    {
      label: "Session",
      value: snapshot.session.id ? `Active · ${formatTime(snapshot.session.elapsedMs)}` : "No active session",
      status: snapshot.session.id ? "passed" : "not-tested",
    },
  ];

  return (
    <div className="page page--status">
      <header className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">{isTest ? "Rehearsal" : "Live installation"}</p>
          <h1>Status</h1>
          <div className="status-heading-values">
            <span aria-label="Engine state" className="engine-state-value" data-state-id={snapshot.experienceState} data-testid="engine-state">{stateLabel(snapshot.experienceState)}</span>
            <div className={`readiness readiness--${snapshot.modeReadiness[snapshot.operationMode]}`}>
              <span aria-hidden="true" className="readiness__symbol" />
              <span>{headline}</span>
            </div>
          </div>
        </div>
        <button className="command-button command-button--primary" data-testid="open-presentation-demo" onClick={() => navigate("demo")} type="button"><PlayIcon /> Watch presentation demo</button>
      </header>

      {testNeedsSetup ? (
        <section aria-labelledby="test-getting-started-heading" className="getting-started" data-testid="test-first-run-card">
          <div className="getting-started__copy">
            <p className="eyebrow">Your first rehearsal</p>
            <h2 id="test-getting-started-heading">Set up Test in about five minutes</h2>
            <ol>
              <li>Allow the microphone and choose this Mac’s microphone.</li>
              <li>Speak once to confirm a real signal.</li>
              <li>Run the flow with the guided onscreen controls or Space, R, and W.</li>
            </ol>
          </div>
          <button className="command-button command-button--primary" data-testid="status-setup-test" onClick={() => navigate("setup")} type="button">Set Up Test</button>
        </section>
      ) : null}

      {productionNeedsMedia ? (
        <section aria-labelledby="production-blocker-heading" className="production-blocker" data-testid="production-media-blocker">
          <div>
            <p className="eyebrow">Top Production blocker</p>
            <h2 id="production-blocker-heading">Approved production media is not ready</h2>
            <p>{videoCheck?.detail ?? contentCheck?.detail ?? "Add and validate the approved external content pack before a live session."}</p>
          </div>
          <div className="production-blocker__actions">
            <button
              className="command-button command-button--primary"
              onClick={async () => {
                const result = await runCommand({ type: "mode.set", mode: "test" });
                if (result.ok) navigate("test-flow");
              }}
              type="button"
            >
              Use Test Instead
            </button>
            <CommandButton command={{ type: "content.openFolder" }} pendingCommand={pendingCommand} runCommand={runCommand}>Open Content Folder</CommandButton>
          </div>
        </section>
      ) : null}

      <div className={`mode-banner mode-banner--${isTest ? "test" : "production"}`} role="status">
        <strong>{isTest ? "Test Mode" : "Production Mode"}</strong>
        <span>
          {isTest
            ? "Keyboard controls and text scenes are isolated from Production readiness."
            : "Only assigned hardware and genuine checks can start a visitor session."}
        </span>
      </div>

      <section aria-label="Experience controls" className="command-strip">
        <CommandButton
          command={{ type: "experience.start" }}
          disabled={!canStart}
          icon={<PlayIcon />}
          kind="primary"
          pendingCommand={pendingCommand}
          runCommand={runCommand}
          testId="experience-start"
        >
          {isTest ? "Start Test Flow" : "Start Production"}
        </CommandButton>
        <CommandButton
          command={{ type: canResume ? "experience.resume" : "experience.pause" }}
          disabled={!canPause && !canResume}
          icon={canResume ? <PlayIcon /> : <PauseIcon />}
          pendingCommand={pendingCommand}
          runCommand={runCommand}
          testId="experience-pause-resume"
        >
          {canResume ? "Resume" : "Pause"}
        </CommandButton>
        <CommandButton
          command={{ type: "experience.returnToIdle" }}
          disabled={isIdle || snapshot.runMode === "resetting"}
          icon={<ReturnIcon />}
          pendingCommand={pendingCommand}
          runCommand={runCommand}
          testId="experience-return-idle"
        >
          Return to Idle
        </CommandButton>
        <CommandButton
          command={{ type: "experience.emergencyReset" }}
          disabled={snapshot.runMode === "resetting"}
          icon={<WarningIcon />}
          kind="destructive"
          pendingCommand={pendingCommand}
          runCommand={runCommand}
          testId="experience-emergency-reset"
        >
          Emergency Reset
        </CommandButton>
      </section>
      <p className="emergency-hint"><strong>Emergency Reset is immediate.</strong> It blanks and mutes the audience, stops recording, and clears temporary visitor audio without a confirmation.</p>

      <section aria-labelledby="playback-heading" className="playback-summary">
        <div>
          <h2 id="playback-heading">Current scene</h2>
          <p className="playback-summary__scene">{snapshot.currentSceneLabel}</p>
          <p className="metadata">{isTest ? `Text presentation · ${snapshot.settings.test.speed}×` : snapshot.currentSceneFile}</p>
        </div>
        <div className="playback-summary__time">
          <span>{formatTime(snapshot.playbackMs)}</span>
          <span aria-hidden="true">/</span>
          <span>{formatTime(snapshot.playbackDurationMs)}</span>
        </div>
        <div
          aria-label="Scene playback"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(Math.max(0, Math.min(1, progress)) * 100)}
          className="progress"
          role="progressbar"
        >
          <span style={{ inlineSize: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
        </div>
      </section>

      <section aria-labelledby="demo-brief-heading" className="demo-brief" data-testid="project-demo-brief">
        <div className="demo-brief__intro">
          <div>
            <p className="eyebrow">Project update · 28 September 2026</p>
            <h2 id="demo-brief-heading">Current production</h2>
            <p>First-person Bangkok story. The app rehearses interaction with text scenes; the picture edit is separate.</p>
          </div>
          <span className="demo-brief__badge">Development demo</span>
        </div>
        <div className="demo-brief__facts" aria-label="Current project status">
          <div><strong>02:00</strong><span>v5 story · 24 fps</span></div>
          <div><strong>39</strong><span>timed shots planned</span></div>
          <div><strong>00:18</strong><span>Scene 01 Draft 1 for review</span></div>
        </div>
        <p className="demo-brief__boundary">Next: review Scene 01 picture and Thai audio, then assemble the full rough cut. The phone interaction and room hardware still need integration and testing.</p>
        {isTest ? <button className="demo-brief__link" onClick={() => navigate("test-flow")} type="button">Open rehearsal <span aria-hidden="true">→</span></button> : null}
      </section>

      <section aria-labelledby="system-status-heading" className="status-table">
        <SectionHeader
          description="Reported state and evidence—not inferred connection labels."
          headingId="system-status-heading"
        >
          {isTest ? "Test environment" : "Production readiness"}
        </SectionHeader>
        <div className="status-rows">
          {rows.map((row) => (
            <div className="status-row" key={row.label}>
              <span className="status-row__label">{row.label}</span>
              <StatusMark status={row.status} />
              <span className="status-row__value">{row.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="input-heading" className="input-summary">
        <SectionHeader
          description={<>Recording state: <span data-testid="recording-status">{snapshot.recordingStatus.replaceAll("-", " ")}</span></>}
          headingId="input-heading"
        >
          Live input
        </SectionHeader>
        <div className="input-summary__meter">
          <span>Microphone signal</span>
          <Meter label="Microphone signal" value={snapshot.microphoneLevel} />
          <span className="numeric-value" data-testid="microphone-level">{Math.round(snapshot.microphoneLevel * 100)}%</span>
        </div>
        {snapshot.hid.lastInput ? (
          <p className="last-input" data-testid="last-input">
            <strong>{snapshot.hid.lastInput.accepted ? "Accepted" : "Ignored"}</strong>
            <span>{snapshot.hid.lastInput.action} · {snapshot.hid.lastInput.source.replaceAll("_", " ").toLowerCase()}</span>
            <time dateTime={snapshot.hid.lastInput.occurredAt}>{formatClock(snapshot.hid.lastInput.occurredAt)}</time>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="recent-heading" className="activity-section">
        <SectionHeader headingId="recent-heading">Recent activity</SectionHeader>
        {snapshot.recentActivity.length === 0 ? (
          <p className="empty-state">No warnings or recent activity.</p>
        ) : (
          <ol className="activity-list">
            {snapshot.recentActivity.slice(0, 5).map((item) => (
              <li className={`activity activity--${item.level}`} key={item.id}>
                <time dateTime={item.timestamp}>{formatClock(item.timestamp)}</time>
                <span>{item.message}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function CheckRow({ item, pendingCommand, runCommand }: { item: HealthItem } & Pick<PageProps, "pendingCommand" | "runCommand">) {
  return (
    <div className="check-row">
      <div className="check-row__copy">
        <div className="check-row__title">
          <h3>{item.label}</h3>
          {item.required ? <span className="required-label">Required</span> : <span className="metadata">Optional</span>}
        </div>
        <p>{item.detail}</p>
        {item.checkedAt ? <p className="metadata">Last checked {formatClock(item.checkedAt)}</p> : null}
      </div>
      <StatusMark status={item.status} />
      <button
        className="compact-button"
        disabled={pendingCommand !== null || item.status === "checking"}
        onClick={() => void runCommand({ type: "systemCheck.run", checkId: item.id })}
        type="button"
      >
        Test
      </button>
    </div>
  );
}

function identityCopy(binding: HidBinding): string {
  if (binding.locationBound || binding.identityQuality === "port") return "Bound to this USB port";
  if (binding.identityQuality === "session") return "Recognized for this Mac session";
  return "Recognized device identity";
}

function InputAssignmentRow({
  binding,
  item,
  onAssign,
  pendingCommand,
  role,
  runCommand,
}: {
  binding: HidBinding | null;
  item: (typeof inputRoles)[number];
  onAssign: (role: ProductionInputRole) => void;
  role: ProductionInputRole;
} & Pick<PageProps, "pendingCommand" | "runCommand">) {
  return (
    <div className="device-row" data-testid={`production-binding-${role.toLowerCase()}`}>
      <div className="device-row__identity">
        <span className="device-row__number">{item.number}</span>
        <div>
          <strong>{item.thai} / {item.english}</strong>
          <span>{binding ? `${binding.deviceLabel} · ${binding.elementLabel}` : "No control assigned"}</span>
        </div>
      </div>
      <div className="device-row__state">
        <StatusMark status={binding ? (binding.connected ? "not-tested" : "failed") : "not-tested"} />
        <span>{binding ? identityCopy(binding) : "Press Assign to identify a control"}</span>
      </div>
      <div className="device-row__actions">
        <button
          className="compact-button"
          data-testid={`assign-${role.toLowerCase()}`}
          disabled={pendingCommand !== null}
          id={`assign-${role.toLowerCase()}`}
          onClick={() => onAssign(role)}
          type="button"
        >
          {binding ? "Reassign…" : "Assign…"}
        </button>
        {binding ? (
          <button
            className="compact-button compact-button--quiet"
            disabled={pendingCommand !== null}
            onClick={() => void runCommand({ type: "hid.binding.forget", role })}
            type="button"
          >
            Forget
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AssignInputSheet({
  onClose,
  pendingCommand,
  role,
  runCommand,
  snapshot,
}: PageProps & { role: ProductionInputRole; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const beganLearning = useRef(false);
  const roleCopy = inputRoles.find((item) => item.role === role) ?? inputRoles[0]!;
  const learn = snapshot.hid.learn?.role === role ? snapshot.hid.learn : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (beganLearning.current) return;
    beganLearning.current = true;
    void runCommand({ type: "hid.learn.begin", role });
  }, [role, runCommand]);

  const close = async () => {
    if (learn?.token) await runCommand({ type: "hid.learn.cancel", token: learn.token });
    dialogRef.current?.close();
    onClose();
  };

  const confirm = async () => {
    if (!learn?.token) return;
    const result = await runCommand({ type: "hid.learn.confirm", token: learn.token });
    if (result.ok) {
      dialogRef.current?.close();
      onClose();
    }
  };

  const progress = learn?.pressCount ?? 0;
  return (
    <dialog
      aria-describedby="assign-input-description"
      aria-labelledby="assign-input-title"
      className="assignment-dialog"
      data-testid="hid-assign-dialog"
      onCancel={(event) => {
        event.preventDefault();
        void close();
      }}
      ref={dialogRef}
    >
      <div className="assignment-dialog__header">
        <p className="eyebrow">{roleCopy.number}</p>
        <h2 id="assign-input-title">Assign {roleCopy.english}</h2>
        <p id="assign-input-description">Press and release the intended physical control twice. RE:Light stores only a protected device and element identity.</p>
      </div>
      <div aria-atomic="true" aria-live="polite" className="learning-state">
        <div aria-hidden="true" className="learning-state__rings">
          <span data-complete={progress >= 1} />
          <span data-complete={progress >= 2} />
        </div>
        <strong>
          {!learn
            ? "Preparing Input Monitoring…"
            : learn.phase === "error"
              ? "The control could not be learned"
              : progress === 0
                ? "Press the control once"
                : progress === 1
                  ? "Release, then press it again"
                  : "Control recognized"}
        </strong>
        <span>{learn?.message ?? learn?.candidateLabel ?? "Waiting for an assignable USB control"}</span>
      </div>
      <div className="privacy-callout">
        <strong>Private by design</strong>
        <span>Ordinary typing is not stored or included in diagnostics.</span>
      </div>
      <div className="assignment-dialog__actions">
        <button className="command-button" disabled={pendingCommand !== null} onClick={() => void close()} type="button">Cancel</button>
        <button
          className="command-button command-button--primary"
          disabled={learn?.phase !== "ready" || pendingCommand !== null}
          onClick={() => void confirm()}
          type="button"
        >
          Use This Control
        </button>
      </div>
    </dialog>
  );
}

function SetupPage({ snapshot, pendingCommand, runCommand, navigate }: PageProps) {
  const [assigningRole, setAssigningRole] = useState<ProductionInputRole | null>(null);
  const isTest = snapshot.operationMode === "test";
  const profile = snapshot.settings[snapshot.operationMode];
  const testRequirementIds = new Set(["content", "microphonePermission", "microphone", "microphoneSignal", "audio", "storage"]);
  const prominentChecks = isTest
    ? snapshot.health.filter((item) => testRequirementIds.has(item.id))
    : snapshot.health;
  const productionSubstitutions = isTest
    ? snapshot.health.filter((item) => !testRequirementIds.has(item.id))
    : [];
  const passed = prominentChecks.filter((item) => item.status === "passed").length;
  const requiredFailures = prominentChecks.filter((item) => item.status === "failed").length;
  const testSetupReady = Boolean(snapshot.settings.test.microphoneDeviceId) &&
    snapshot.health.find((item) => item.id === "microphoneSignal")?.status === "passed" &&
    snapshot.canStart;
  // “Use This Mac’s Microphone” must never guess. The default or first input
  // may be Continuity, a virtual device, or an attached USB microphone.
  const builtInMicrophone = snapshot.microphones.find((device) =>
    /built[ -]?in|macbook|internal/i.test(device.label),
  );
  const compatibleDevices = snapshot.hid.devices.filter((device) => device.assignable && !device.internal);
  const otherDevices = snapshot.hid.devices.filter((device) => !device.assignable || device.internal);

  const closeAssignment = useCallback(() => {
    const priorRole = assigningRole;
    setAssigningRole(null);
    window.requestAnimationFrame(() => {
      if (priorRole) document.getElementById(`assign-${priorRole.toLowerCase()}`)?.focus();
    });
  }, [assigningRole]);

  return (
    <div className="page">
      <header className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">{isTest ? "This Mac" : "Exhibition hardware"}</p>
          <h1>Setup</h1>
          <p>{isTest ? "Choose rehearsal devices without changing Production assignments." : "Connect, assign, and verify every device before admitting a visitor."}</p>
        </div>
        <CommandButton
          command={{ type: "systemCheck.runAll" }}
          icon={<RefreshIcon />}
          kind="primary"
          pendingCommand={pendingCommand}
          runCommand={runCommand}
          testId="setup-run-all"
        >
          {isTest ? "Run Test Checks" : "Run Production Checks"}
        </CommandButton>
      </header>

      <div className={`mode-banner mode-banner--${isTest ? "test" : "production"}`} role="status">
        <strong>{isTest ? "Test profile" : "Production profile"}</strong>
        <span>{isTest ? "Test results stay clearly labeled and never become a Production PASS." : "No device is replaced automatically when it disconnects."}</span>
      </div>

      {isTest ? (
        <section aria-labelledby="test-devices-heading" className="setup-group">
          <SectionHeader description="Four steps. Your choices stay separate from Production." headingId="test-devices-heading">Set up the Test microphone</SectionHeader>
          <div className="setup-steps" data-testid="test-microphone-steps">
            <div className="setup-step">
              <span aria-hidden="true" className="setup-step__number">1</span>
              <div>
                <strong>Allow microphone access</strong>
                <span>RE:Light asks only from this explicit setup step—never during a visitor session.</span>
              </div>
              <StatusMark status={snapshot.health.find((item) => item.id === "microphonePermission")?.status ?? "not-tested"} />
              <button className="compact-button" disabled={pendingCommand !== null} onClick={() => void runCommand({ type: "systemCheck.run", checkId: "microphonePermission" })} type="button">Allow &amp; Refresh</button>
            </div>
            <div className="setup-step">
              <span aria-hidden="true" className="setup-step__number">2</span>
              <div>
                <strong>Choose this Mac’s microphone</strong>
                <span>Select the exact built-in input. Test never changes the Production microphone.</span>
              </div>
              <label className="field field--inline">
                <span className="visually-hidden">Test microphone</span>
                <select
                  data-testid="test-microphone-select"
                  onChange={(event) => void runCommand({ type: "settings.patch", patch: profilePatch(snapshot, { microphoneDeviceId: event.target.value }) })}
                  value={profile.microphoneDeviceId}
                >
                  <option value="">Choose a microphone</option>
                  {snapshot.microphones.map((microphone) => (
                    <option disabled={!microphone.isAvailable} key={microphone.id} value={microphone.id}>{microphone.label}{microphone.isDefault ? " · Default" : ""}</option>
                  ))}
                </select>
              </label>
              <button
                className="compact-button"
                data-testid="test-use-mac-microphone"
                disabled={!builtInMicrophone || pendingCommand !== null}
                onClick={async () => {
                  if (!builtInMicrophone) return;
                  const saved = await runCommand({
                    type: "settings.patch",
                    patch: profilePatch(snapshot, { microphoneDeviceId: builtInMicrophone.id }),
                  });
                  if (saved.ok) await runCommand({ type: "systemCheck.run", checkId: "microphoneSignal" });
                }}
                type="button"
              >
                Use This Mac’s Microphone
              </button>
              {!builtInMicrophone && snapshot.microphones.length > 0 ? (
                <span className="metadata">Built-in microphone could not be identified. Choose it explicitly from the list.</span>
              ) : null}
            </div>
            <div className="setup-step">
              <span aria-hidden="true" className="setup-step__number">3</span>
              <div>
                <strong>Speak to confirm a real signal</strong>
                <span>{profile.microphoneDeviceId ? microphoneLabel(snapshot) : "Choose a microphone in step 2 first."}</span>
              </div>
              <Meter label="Test microphone signal" value={snapshot.microphoneLevel} />
              <span className="numeric-value">{Math.round(snapshot.microphoneLevel * 100)}%</span>
              <button className="compact-button" disabled={!profile.microphoneDeviceId || pendingCommand !== null} onClick={() => void runCommand({ type: "systemCheck.run", checkId: "microphoneSignal" })} type="button">Test Signal</button>
            </div>
            <div className="setup-step setup-step--complete">
              <span aria-hidden="true" className="setup-step__number">4</span>
              <div>
                <strong>Rehearse the complete experience</strong>
                <span>Use the guided onscreen controls, or Space, R, W, arrows, and Option-R inside Test Flow.</span>
              </div>
              <StatusMark status={testSetupReady ? "passed" : "not-tested"} />
              <button className="compact-button" disabled={!testSetupReady || pendingCommand !== null} onClick={() => navigate("test-flow")} type="button">Open Test Flow</button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section aria-labelledby="production-av-heading" className="setup-group">
            <SectionHeader description="Changes apply only to Production." headingId="production-av-heading">Display and audio</SectionHeader>
            <div className="settings-rows">
              <div className="settings-row settings-row--control">
                <div>
                  <strong>Audience display</strong>
                  <span>Use an external display in Extended Display mode.</span>
                </div>
                <label className="field field--inline">
                  <span className="visually-hidden">Production audience display</span>
                  <select
                    data-testid="production-display-select"
                    onChange={(event) => void runCommand({ type: "settings.patch", patch: profilePatch(snapshot, { audienceDisplayId: event.target.value }) })}
                    value={profile.audienceDisplayId}
                  >
                    <option value="">Choose a display</option>
                    {snapshot.displays.map((display) => (
                      <option disabled={!display.isAvailable} key={display.id} value={display.id}>{display.label} · {display.resolution}{display.isPrimary ? " · Primary" : ""}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="settings-row settings-row--control">
                <div>
                  <strong>Microphone</strong>
                  <span>The saved device is never replaced automatically.</span>
                </div>
                <label className="field field--inline">
                  <span className="visually-hidden">Production microphone</span>
                  <select
                    data-testid="production-microphone-select"
                    onChange={(event) => void runCommand({ type: "settings.patch", patch: profilePatch(snapshot, { microphoneDeviceId: event.target.value }) })}
                    value={profile.microphoneDeviceId}
                  >
                    <option value="">Choose a microphone</option>
                    {snapshot.microphones.map((microphone) => (
                      <option disabled={!microphone.isAvailable} key={microphone.id} value={microphone.id}>{microphone.label}{microphone.isDefault ? " · System default" : ""}</option>
                    ))}
                  </select>
                </label>
                <button className="compact-button" disabled={!profile.microphoneDeviceId || pendingCommand !== null} onClick={() => void runCommand({ type: "systemCheck.run", checkId: "microphoneSignal" })} type="button">Test Signal</button>
              </div>
              <div className="settings-row settings-row--control">
                <div>
                  <strong>Sound output</strong>
                  <span>{snapshot.audioOutputs.length > 0 ? "Choose an output supported by Chromium." : "Uses macOS system output."}</span>
                </div>
                {snapshot.audioOutputs.length > 0 ? (
                  <label className="field field--inline">
                    <span className="visually-hidden">Production sound output</span>
                    <select
                      onChange={(event) => void runCommand({ type: "settings.patch", patch: profilePatch(snapshot, { audioOutputDeviceId: event.target.value }) })}
                      value={profile.audioOutputDeviceId}
                    >
                      <option value="">macOS system output</option>
                      {snapshot.audioOutputs.map((output) => <option disabled={!output.isAvailable} key={output.id} value={output.id}>{output.label}</option>)}
                    </select>
                  </label>
                ) : <span className="settings-row__value">{snapshot.audioOutputLabel}</span>}
                <button className="compact-button" disabled={pendingCommand !== null} onClick={() => void runCommand({ type: "systemCheck.run", checkId: "audio" })} type="button">Test Speakers</button>
              </div>
            </div>
          </section>

          <section aria-labelledby="production-inputs-heading" className="setup-group">
            <SectionHeader description="Two physical press-and-release controls are required." headingId="production-inputs-heading">Visitor controls</SectionHeader>
            <div className="permission-row">
              <div>
                <strong>Input Monitoring</strong>
                <span>Allows RE:Light to identify only the USB controls you assign.</span>
              </div>
              <StatusMark status={snapshot.hid.access === "granted" ? "passed" : snapshot.hid.access === "denied" ? "failed" : snapshot.hid.access === "restartRequired" ? "warning" : "not-tested"} />
              <div className="permission-row__actions">
                {snapshot.hid.access !== "granted" ? (
                  <CommandButton command={{ type: "hid.requestAccess" }} pendingCommand={pendingCommand} runCommand={runCommand}>Allow Input Monitoring…</CommandButton>
                ) : null}
                {snapshot.hid.access === "denied" || snapshot.hid.access === "restartRequired" ? (
                  <CommandButton command={{ type: "hid.openSettings" }} pendingCommand={pendingCommand} runCommand={runCommand}>Open System Settings</CommandButton>
                ) : null}
                <CommandButton command={{ type: "hid.refresh" }} icon={<RefreshIcon />} pendingCommand={pendingCommand} runCommand={runCommand}>Refresh</CommandButton>
              </div>
            </div>

            <div className="device-list">
              {inputRoles.map((item) => (
                <InputAssignmentRow
                  binding={snapshot.hid.bindings[item.role]}
                  item={item}
                  key={item.role}
                  onAssign={setAssigningRole}
                  pendingCommand={pendingCommand}
                  role={item.role}
                  runCommand={runCommand}
                />
              ))}
            </div>

            <details className="advanced-devices">
              <summary>Available USB input devices ({compatibleDevices.length})</summary>
              {snapshot.hid.devices.length === 0 ? (
                <p>No external HID input devices are visible. Connect the encoder, allow Input Monitoring, then refresh.</p>
              ) : (
                <div className="advanced-device-list">
                  {compatibleDevices.map((device) => (
                    <div key={device.id}>
                      <strong>{device.label}</strong>
                      <span>{device.manufacturer ?? "USB HID"} · {device.locationBound ? "Bound to this USB port" : "Assignable"}</span>
                    </div>
                  ))}
                  {otherDevices.map((device) => (
                    <div className="advanced-device--unavailable" key={device.id}>
                      <strong>{device.label}</strong>
                      <span>{device.reason ?? "This device has no assignable momentary control."}</span>
                    </div>
                  ))}
                </div>
              )}
            </details>
          </section>
        </>
      )}

      <section aria-labelledby="guided-checks-heading" className="setup-group">
        <SectionHeader description={`${passed} of ${prominentChecks.length} passed`} headingId="guided-checks-heading">{isTest ? "Test requirements" : "Guided checks"}</SectionHeader>
        {requiredFailures > 0 ? <p className="inline-fault" role="status">{requiredFailures} required check{requiredFailures === 1 ? "" : "s"} need attention.</p> : null}
        <div className="check-list">
          {prominentChecks.map((item) => <CheckRow item={item} key={item.id} pendingCommand={pendingCommand} runCommand={runCommand} />)}
        </div>
      </section>

      {isTest && productionSubstitutions.length > 0 ? (
        <details className="test-substitutions">
          <summary>Production-only checks not required for Test ({productionSubstitutions.length})</summary>
          <p>Test uses a development audience window, text scenes, keyboard controls, and clearly labeled substitutions. None of these results becomes a Production PASS.</p>
          <div className="substitution-list">
            {productionSubstitutions.map((item) => (
              <div key={item.id}>
                <strong>{item.label}</strong>
                <StatusMark status={item.status} />
                <span>{item.detail}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {assigningRole ? (
        <AssignInputSheet
          navigate={navigate}
          onClose={closeAssignment}
          pendingCommand={pendingCommand}
          role={assigningRole}
          runCommand={runCommand}
          snapshot={snapshot}
        />
      ) : null}
    </div>
  );
}

function TestPreview({ label, recordingStatus, state }: { label: string; recordingStatus: string; state: string }) {
  return (
    <section aria-label="Text-only audience preview" className="test-preview">
      <div className="test-preview__screen">
        <span className="visually-hidden">Audience displays:</span>
        <strong>{label}</strong>
      </div>
      <div className="test-preview__metadata">
        <span data-testid="test-flow-state"><span data-testid="engine-state">{state}</span></span>
        <span data-testid="recording-status">{recordingStatus.replaceAll("-", " ")}</span>
        <span>Text only · No production video</span>
      </div>
    </section>
  );
}

function TestFlowPage({ snapshot, pendingCommand, runCommand }: PageProps) {
  const [view, setView] = useState<TestFlowView>("full");
  const [sceneId, setSceneId] = useState("");
  const effectiveSceneId = snapshot.scenes.some((scene) => scene.id === sceneId) ? sceneId : snapshot.scenes[0]?.id ?? "";
  const selected = snapshot.scenes.find((scene) => scene.id === effectiveSceneId);
  const isTest = snapshot.operationMode === "test";
  const isIdle = snapshot.runMode === "idle" && snapshot.experienceState === "IDLE";
  const playPauseLabel = snapshot.runMode === "paused" ? "Resume" : snapshot.runMode === "running" ? "Pause" : "Start";
  const previewLabel = view === "single" && selected ? selected.label : snapshot.currentSceneLabel;
  const previewState = view === "single" && selected ? selected.id : snapshot.experienceState;
  const guide = stateGuide(snapshot.experienceState, snapshot.recordingStatus);
  const triggerTestKey = async (code: "KeyR" | "KeyW") => {
    const key = { type: "test.keyboard" as const, code, repeat: false, alt: false, interactive: false };
    try {
      await runCommand({ ...key, phase: "down" });
    } finally {
      await dispatchOperatorCommand({ ...key, phase: "up" });
    }
  };

  if (!isTest) {
    return (
      <div className="page page--centered-empty">
        <div className="centered-empty">
          <span aria-hidden="true" className="centered-empty__symbol"><SceneIcon /></span>
          <h1>Test Flow</h1>
          <p>Switch to Test to run text scenes with this Mac’s microphone and keyboard.</p>
          <CommandButton
            command={{ type: "mode.set", mode: "test" }}
            disabled={!canChangeMode(snapshot)}
            kind="primary"
            pendingCommand={pendingCommand}
            runCommand={runCommand}
            testId="test-flow-switch-mode"
          >
            Switch to Test
          </CommandButton>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--test-flow">
      <header className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Rehearsal workspace</p>
          <h1>Test Flow</h1>
          <p>Run the narrative with text scenes, the selected Test microphone, and isolated keyboard controls.</p>
        </div>
        <div aria-label="Test view" className="view-switcher" role="tablist">
          <button aria-controls="test-flow-panel" aria-selected={view === "full"} data-testid="test-flow-full" onClick={() => setView("full")} role="tab" type="button">Full Flow</button>
          <button aria-controls="test-flow-panel" aria-selected={view === "single"} data-testid="test-flow-single" onClick={() => setView("single")} role="tab" type="button">Single Scene</button>
        </div>
      </header>

      <div className="mode-banner mode-banner--test" role="status">
        <strong>Test Mode</strong>
        <span>This is an earlier text-only prototype of the interaction, with placeholder scene timing. The v5 film is 2 minutes and remains the story authority.</span>
      </div>

      <div id="test-flow-panel" role="tabpanel">
        {view === "full" ? (
          <>
            <section aria-label="Full flow controls" className="test-toolbar">
              <CommandButton
                command={{ type: "experience.start" }}
                disabled={!isIdle || !snapshot.canStart}
                icon={<PlayIcon />}
                kind="primary"
                pendingCommand={pendingCommand}
                runCommand={runCommand}
                testId="test-flow-start"
              >
                Start Full Test
              </CommandButton>
              <div aria-label="Scene transport" className="transport-controls" role="group">
                <CommandButton command={{ type: "test.transport", action: "previousScene" }} disabled={isIdle} pendingCommand={pendingCommand} runCommand={runCommand} testId="test-transport-previous">Previous</CommandButton>
                <CommandButton command={{ type: "test.transport", action: "startOrToggle" }} icon={snapshot.runMode === "running" ? <PauseIcon /> : <PlayIcon />} pendingCommand={pendingCommand} runCommand={runCommand} testId="test-transport-play-pause">{playPauseLabel}</CommandButton>
                <CommandButton command={{ type: "test.transport", action: "nextScene" }} disabled={isIdle} pendingCommand={pendingCommand} runCommand={runCommand} testId="test-transport-next">Next</CommandButton>
                <CommandButton command={{ type: "test.transport", action: "restartScene" }} disabled={isIdle} pendingCommand={pendingCommand} runCommand={runCommand} testId="test-transport-restart">Restart</CommandButton>
              </div>
              <div aria-label="Test speed" className="speed-control" role="group">
                <span>Speed</span>
                {([1, 2, 4] as const).map((speed) => (
                  <button
                    aria-pressed={snapshot.settings.test.speed === speed}
                    data-testid={`test-speed-${speed}`}
                    disabled={pendingCommand !== null}
                    key={speed}
                    onClick={() => void runCommand({ type: "test.speed.set", speed })}
                    type="button"
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </section>
            <section aria-live="polite" className="demo-guide">
              <div><strong>{guide.title}</strong><span>{guide.detail}</span></div>
              {snapshot.experienceState === "WAITING_FOR_RECORD" || snapshot.experienceState === "RECORDING" ? (
                <button className="command-button command-button--primary" data-testid="test-record-action" disabled={pendingCommand !== null} onClick={() => void triggerTestKey("KeyR")} type="button">{snapshot.experienceState === "RECORDING" ? "Stop recording" : "Record dream"}</button>
              ) : null}
              {snapshot.experienceState === "WAITING_FOR_CHOICE" ? (
                <button className="command-button command-button--primary" data-testid="test-choice-action" disabled={pendingCommand !== null} onClick={() => void triggerTestKey("KeyW")} type="button">Choose again</button>
              ) : null}
            </section>
            <TestPreview label={previewLabel} recordingStatus={snapshot.recordingStatus} state={previewState} />
          </>
        ) : (
          <>
            <section aria-labelledby="single-scene-heading" className="single-scene-controls">
              <SectionHeader description="Recording and choice gates still require their matching Test key." headingId="single-scene-heading">Choose a scene</SectionHeader>
              <label className="field">
                <span>Scene</span>
                <select data-testid="test-single-scene-select" onChange={(event) => setSceneId(event.target.value)} value={effectiveSceneId}>
                  {snapshot.scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.sequence} · {scene.label}</option>)}
                </select>
              </label>
              <div className="command-strip command-strip--compact">
                <CommandButton
                  command={{ type: "sceneTester.play", sceneId: selected?.id ?? "", loop: true }}
                  disabled={!selected || snapshot.runMode !== "idle"}
                  icon={<PlayIcon />}
                  kind="primary"
                  pendingCommand={pendingCommand}
                  runCommand={runCommand}
                  testId="test-single-play"
                >
                  Play Scene
                </CommandButton>
                <CommandButton command={{ type: "sceneTester.stop" }} pendingCommand={pendingCommand} runCommand={runCommand}>Stop</CommandButton>
              </div>
            </section>
            <TestPreview label={previewLabel} recordingStatus={snapshot.recordingStatus} state={previewState} />
          </>
        )}
      </div>

      <section aria-labelledby="keyboard-shortcuts-heading" className="shortcut-section">
        <SectionHeader description="Active only on this page, outside fields and controls." headingId="keyboard-shortcuts-heading">Keyboard controls</SectionHeader>
        <dl className="shortcut-grid">
          {testShortcuts.map((shortcut) => (
            <div key={shortcut.key}>
              <dt><kbd>{shortcut.key}</kbd></dt>
              <dd>{shortcut.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="test-microphone-heading" className="test-microphone-summary">
        <SectionHeader description="Change the Test microphone in Setup." headingId="test-microphone-heading">Test microphone</SectionHeader>
        <div>
          <strong>{microphoneLabel(snapshot)}</strong>
          <Meter label="Test microphone signal" value={snapshot.microphoneLevel} />
          <span>{Math.round(snapshot.microphoneLevel * 100)}%</span>
        </div>
      </section>
    </div>
  );
}

function cloneSettings(settings: OperatorSettings): OperatorSettings {
  return {
    ...settings,
    production: { ...settings.production },
    test: { ...settings.test },
    audio: { ...settings.audio },
  };
}

function SettingsPage({ snapshot, pendingCommand, runCommand }: PageProps) {
  const [draft, setDraft] = useState<OperatorSettings>(() => cloneSettings(snapshot.settings));
  const [dirty, setDirty] = useState(false);
  const locked = snapshot.runMode !== "idle" || !["IDLE", "SYSTEM_CHECK"].includes(snapshot.experienceState);

  const updateAudio = (key: keyof OperatorSettings["audio"], value: number) => {
    setDraft((current) => ({ ...current, audio: { ...current.audio, [key]: value } }));
    setDirty(true);
  };

  const save = async () => {
    const result = await runCommand({ type: "settings.patch", patch: { audio: draft.audio, developerMode: draft.developerMode } });
    if (result.ok) setDirty(false);
  };

  return (
    <div className="page">
      <header className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Persistent preferences</p>
          <h1>Settings</h1>
          <p>Device choices live in Setup; global audio, content, and developer preferences live here.</p>
        </div>
        <div className="heading-actions">
          <button className="command-button" data-testid="settings-reload" disabled={!dirty || pendingCommand !== null} onClick={() => { setDraft(cloneSettings(snapshot.settings)); setDirty(false); }} type="button">Reload Saved</button>
          <button className="command-button command-button--primary" data-testid="settings-save" disabled={!dirty || locked || pendingCommand !== null} onClick={() => void save()} type="button">Save Settings</button>
        </div>
      </header>

      {locked ? <p className="mode-banner" role="status"><strong>Settings locked</strong><span>Return to Idle before changing installation settings.</span></p> : null}

      <section className="profile-summary" aria-labelledby="profiles-heading">
        <SectionHeader description="Profiles never overwrite one another." headingId="profiles-heading">Device profiles</SectionHeader>
        <div className="profile-summary__grid">
          <div>
            <span>Production</span>
            <strong>{snapshot.settings.production.microphoneDeviceId ? "Configured microphone" : "Microphone not selected"}</strong>
            <small>{snapshot.hid.bindings.RECORD_BUTTON && snapshot.hid.bindings.CHOICE_BUTTON ? "Two controls assigned" : "Controls need assignment"}</small>
          </div>
          <div>
            <span>Test</span>
            <strong>{snapshot.settings.test.microphoneDeviceId ? "Test microphone selected" : "Microphone not selected"}</strong>
            <small>Keyboard preset · {snapshot.settings.test.speed}×</small>
          </div>
        </div>
      </section>

      <fieldset className="form-section" disabled={locked}>
        <legend>Audio mix</legend>
        <div className="slider-list">
          {(Object.keys(draft.audio) as Array<keyof OperatorSettings["audio"]>).map((key) => (
            <label className="slider-row" key={key}>
              <span>{key === "visitorVoice" ? "Visitor Voice" : key.charAt(0).toUpperCase() + key.slice(1)}</span>
              <input max="1" min="0" onChange={(event) => updateAudio(key, Number(event.target.value))} step="0.01" type="range" value={draft.audio[key]} />
              <output>{Math.round(draft.audio[key] * 100)}%</output>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="form-section" aria-labelledby="experience-values-heading">
        <h2 id="experience-values-heading">Experience values</h2>
        <p className="section-description">Narrative timing is validated from experience.json. Recording remains real-time in Test.</p>
        <div className="field-grid field-grid--three">
          <div className="field"><span>Recording duration</span><strong>{draft.recordingDurationMs / 1000} seconds</strong></div>
          <div className="field"><span>End hold</span><strong>{draft.endHoldMs / 1000} seconds</strong></div>
          <div className="field"><span>Visitor wait timeout</span><strong>{draft.visitorWaitTimeoutMs === null ? "Wait indefinitely" : formatTime(draft.visitorWaitTimeoutMs)}</strong></div>
        </div>
      </section>

      <section className="form-section content-management" aria-labelledby="content-management-heading">
        <SectionHeader description="Invalid edits never replace the active validated configuration." headingId="content-management-heading">Content pack</SectionHeader>
        <div className="command-strip command-strip--compact">
          <CommandButton command={{ type: "content.openFolder" }} disabled={locked} pendingCommand={pendingCommand} runCommand={runCommand} testId="content-open-folder">Open Content Folder</CommandButton>
          <CommandButton command={{ type: "content.chooseFolder" }} disabled={locked} pendingCommand={pendingCommand} runCommand={runCommand} testId="content-choose-folder">Choose Content Folder…</CommandButton>
          <CommandButton command={{ type: "content.validate" }} disabled={locked} pendingCommand={pendingCommand} runCommand={runCommand} testId="content-validate">Validate</CommandButton>
          <CommandButton command={{ type: "content.reload" }} disabled={locked} icon={<RefreshIcon />} pendingCommand={pendingCommand} runCommand={runCommand} testId="content-reload">Reload</CommandButton>
          <CommandButton command={{ type: "content.restoreLastKnownGood" }} disabled={locked} pendingCommand={pendingCommand} runCommand={runCommand} testId="content-restore-last-known-good">Restore Last Known Good</CommandButton>
        </div>
        <div className={`validation-result validation-result--${snapshot.contentValidation.valid === null ? "untested" : snapshot.contentValidation.valid ? "valid" : "invalid"}`} role="status">
          <strong>{snapshot.contentValidation.valid === null ? "Not validated in this operator session" : snapshot.contentValidation.valid ? "experience.json is valid" : "experience.json needs repair"}</strong>
          {snapshot.contentValidation.issues.length > 0 ? (
            <ol data-testid="content-validation-issues">{snapshot.contentValidation.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ol>
          ) : null}
        </div>
      </section>

      <fieldset className="form-section" disabled={locked}>
        <legend>Developer</legend>
        <label className="toggle-row">
          <input
            checked={draft.developerMode}
            onChange={(event) => {
              setDraft((current) => ({ ...current, developerMode: event.target.checked }));
              setDirty(true);
            }}
            type="checkbox"
          />
          <span className="toggle" aria-hidden="true" />
          <span><strong>Developer Details</strong><small>Shows state IDs and elapsed diagnostics in the audience Test window. Keep off during ordinary rehearsals.</small></span>
        </label>
      </fieldset>
    </div>
  );
}

function DiagnosticsPage({ snapshot, pendingCommand, runCommand }: PageProps) {
  return (
    <div className="page">
      <header className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Local and redacted</p>
          <h1>Diagnostics</h1>
          <p>Technical events stay on this Mac. Nothing is uploaded automatically.</p>
        </div>
        <CommandButton command={{ type: "diagnostics.exportLogs" }} icon={<ExportIcon />} kind="primary" pendingCommand={pendingCommand} runCommand={runCommand} testId="diagnostics-export">Export Logs</CommandButton>
      </header>

      <section className="diagnostic-facts" aria-label="Runtime facts">
        <dl>
          <div><dt>Application</dt><dd>RE:Light Engine {snapshot.appVersion}</dd></div>
          <div><dt>Mode</dt><dd>{snapshot.operationMode === "test" ? "Test" : "Production"}</dd></div>
          <div><dt>State revision</dt><dd>{snapshot.revision}</dd></div>
          <div><dt>Engine state</dt><dd>{snapshot.experienceState}</dd></div>
          <div><dt>Recording</dt><dd>{snapshot.recordingStatus}</dd></div>
          <div><dt>Audience display</dt><dd>{snapshot.audienceDisplayLabel}</dd></div>
          <div><dt>HID helper</dt><dd>{snapshot.hid.helperAvailable ? "Available" : "Unavailable"}</dd></div>
          <div><dt>Input Monitoring</dt><dd>{snapshot.hid.access.replace("restartRequired", "Restart required")}</dd></div>
        </dl>
      </section>

      <section className="diagnostic-actions" aria-label="Diagnostic actions">
        <CommandButton command={{ type: "diagnostics.openAudience" }} pendingCommand={pendingCommand} runCommand={runCommand}>Open Audience Window</CommandButton>
        <CommandButton command={{ type: "diagnostics.reloadContent" }} icon={<RefreshIcon />} pendingCommand={pendingCommand} runCommand={runCommand}>Reload Content</CommandButton>
        <CommandButton command={{ type: "hid.refresh" }} icon={<RefreshIcon />} pendingCommand={pendingCommand} runCommand={runCommand}>Refresh Input Devices</CommandButton>
      </section>

      {snapshot.developerMode ? (
        <section className="simulation-controls" aria-labelledby="simulation-heading">
          <SectionHeader description="Diagnostics simulation never establishes hardware readiness." headingId="simulation-heading">Input simulation</SectionHeader>
          <div className="command-strip command-strip--compact">
            <CommandButton command={{ type: "input.simulate", input: "RECORD_BUTTON" }} pendingCommand={pendingCommand} runCommand={runCommand}>Simulate Record</CommandButton>
            <CommandButton command={{ type: "input.simulate", input: "CHOICE_BUTTON" }} pendingCommand={pendingCommand} runCommand={runCommand}>Simulate Choose Again</CommandButton>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="log-heading" className="log-section">
        <SectionHeader description={`${snapshot.recentActivity.length} recent technical event${snapshot.recentActivity.length === 1 ? "" : "s"}`} headingId="log-heading">Activity log</SectionHeader>
        {snapshot.recentActivity.length === 0 ? (
          <p className="empty-state">No diagnostic events are available.</p>
        ) : (
          <div className="log-table" role="table" aria-label="Recent diagnostic events">
            {snapshot.recentActivity.map((item) => (
              <div className={`log-row log-row--${item.level}`} key={item.id} role="row">
                <time dateTime={item.timestamp} role="cell">{formatClock(item.timestamp)}</time>
                <span role="cell">{item.level.toUpperCase()}</span>
                <span role="cell">{item.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

function isOrdinaryControl(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, a, [role='button'], [role='tab'], [role='radio'], [role='slider'], [role='switch']"));
}

function recognizedTestCode(code: string): code is "Space" | "KeyR" | "KeyW" | "ArrowLeft" | "ArrowRight" {
  return ["Space", "KeyR", "KeyW", "ArrowLeft", "ArrowRight"].includes(code);
}

export function App() {
  const [screen, setScreen] = useState<ScreenId>("status");
  const [snapshot, setSnapshot] = useState<OperatorSnapshot | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("Loading installation status.");
  const testKeyboardEnabled = snapshot?.operationMode === "test" && screen === "test-flow";

  useEffect(() => {
    const bridge = getOperatorBridge();
    let mounted = true;
    const unsubscribe = bridge.subscribe((next) => {
      if (mounted) setSnapshot(next);
    });
    void bridge.getSnapshot().then((next) => {
      if (mounted) setSnapshot(next);
    }).catch((error: unknown) => {
      if (mounted) setAnnouncement(error instanceof Error ? error.message : "Installation status is unavailable.");
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const navigate = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === "settings") setScreen("settings");
    };
    window.addEventListener("relight:navigate", navigate);
    return () => window.removeEventListener("relight:navigate", navigate);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  const runCommand = useCallback(async (command: OperatorCommand): Promise<CommandResult> => {
    setPendingCommand(command.type);
    try {
      const result = await dispatchOperatorCommand(command);
      setAnnouncement(result.message);
      return result;
    } finally {
      setPendingCommand(null);
    }
  }, []);

  useEffect(() => {
    if (!testKeyboardEnabled) return;
    const handleKeyboard = (event: KeyboardEvent) => {
      if (!recognizedTestCode(event.code)) return;
      if (isEditableTarget(event.target)) return;
      // Focused controls keep their native keyboard behavior. The event is
      // deliberately not forwarded into the Test input adapter.
      if (isOrdinaryControl(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (event.altKey && event.code !== "KeyR") return;
      event.preventDefault();
      event.stopPropagation();
      const phase = event.type === "keydown" ? "down" : "up";
      void dispatchOperatorCommand({
        type: "test.keyboard",
        code: event.code,
        phase,
        repeat: event.repeat,
        alt: event.altKey,
        interactive: false,
      }).then((result) => {
        if (phase === "down") setAnnouncement(result.message);
      });
    };
    window.addEventListener("keydown", handleKeyboard, true);
    window.addEventListener("keyup", handleKeyboard, true);
    return () => {
      window.removeEventListener("keydown", handleKeyboard, true);
      window.removeEventListener("keyup", handleKeyboard, true);
    };
  }, [testKeyboardEnabled]);

  const currentPage = useMemo(() => {
    if (!snapshot) return null;
    const props = { snapshot, pendingCommand, runCommand, navigate: setScreen };
    switch (screen) {
      case "status":
        return <StatusPage {...props} />;
      case "demo":
        return <DemoPage />;
      case "setup":
        return <SetupPage {...props} />;
      case "test-flow":
        return <TestFlowPage {...props} />;
      case "settings":
        return <SettingsPage key={JSON.stringify(snapshot.settings)} {...props} />;
      case "diagnostics":
        return <DiagnosticsPage {...props} />;
    }
  }, [pendingCommand, runCommand, screen, snapshot]);

  return (
    <div className="operator-app" data-testid="operator-root">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <div className="app-identity">
          <span aria-hidden="true" className="brand-mark" />
          <span>RE:Light Engine</span>
        </div>
        {snapshot ? <ModeControl navigate={setScreen} pendingCommand={pendingCommand} runCommand={runCommand} snapshot={snapshot} /> : <span />}
        {snapshot ? (
          <span className={`header-state header-state--${snapshot.modeReadiness[snapshot.operationMode]}`}>
            <span aria-hidden="true" />
            {snapshot.operationMode === "test" ? "Test" : snapshot.readiness === "ready" ? "Ready" : snapshot.readiness}
          </span>
        ) : null}
      </header>

      <nav aria-label="Operator sections" className="navigation-shell" data-testid="operator-nav">
        <div className="navigation-glass">
          {navigation.map((item) => {
            const selected = screen === item.id;
            return (
              <button
                aria-current={selected ? "page" : undefined}
                className="navigation-item"
                data-testid={`nav-${item.id}`}
                key={item.id}
                onClick={() => setScreen(item.id)}
                type="button"
              >
                {item.icon({ className: "navigation-item__icon" })}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <main id="main-content">
        {currentPage ?? (
          <div className="loading-state" role="status">
            <span aria-hidden="true" className="loading-state__indicator" />
            <span>Connecting to RE:Light Engine…</span>
          </div>
        )}
      </main>
      <div aria-atomic="true" aria-live="polite" className="visually-hidden">{announcement}</div>
    </div>
  );
}
