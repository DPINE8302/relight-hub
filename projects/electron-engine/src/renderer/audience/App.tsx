import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AudienceDirective, AudienceReport, TimelineAction } from "../shared/types";
import { AudioGraph } from "./AudioGraph";
import { getAudienceBridge, runImmediateMediaRequest } from "./bridge";
import { RecordingEngine } from "./RecordingEngine";
import { TimelineScheduler } from "./TimelineScheduler";
import { VideoDeck, type VideoFrameReport } from "./VideoDeck";

function formatTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function usePlaceholderClock(
  directive: AudienceDirective,
  enabled: boolean,
  onFrame: (elapsedMs: number, durationMs: number) => void,
  onEnded: () => void,
) {
  const state = useRef({ revision: -1, elapsedMs: 0, anchorMs: 0, frame: 0, ended: false });

  useEffect(() => {
    const clock = state.current;
    if (clock.revision !== directive.revision) {
      cancelAnimationFrame(clock.frame);
      clock.revision = directive.revision;
      clock.elapsedMs = 0;
      clock.anchorMs = performance.now();
      clock.ended = false;
    }
  }, [directive.revision]);

  useEffect(() => {
    const clock = state.current;
    cancelAnimationFrame(clock.frame);
    if (!enabled || directive.runMode === "paused") return;
    clock.anchorMs = performance.now() - clock.elapsedMs;
    const durationMs = directive.scene.durationMs ?? 0;
    const acceleratedDurationMs = directive.scene.kind === "passive" && durationMs > 0
      ? directive.verificationMode
        ? 80
        : directive.operationMode === "test"
          ? durationMs / directive.testSpeed
          : durationMs
      : durationMs;
    const step = (now: number) => {
      if (clock.revision !== directive.revision) return;
      clock.elapsedMs = Math.max(0, now - clock.anchorMs);
      const timelineElapsed = acceleratedDurationMs > 0 && acceleratedDurationMs !== durationMs
        ? Math.min(durationMs, (clock.elapsedMs / acceleratedDurationMs) * durationMs)
        : clock.elapsedMs;
      const displayElapsed = directive.scene.loop && durationMs > 0 ? timelineElapsed % durationMs : timelineElapsed;
      onFrame(displayElapsed, durationMs);
      if (!directive.scene.loop && acceleratedDurationMs > 0 && clock.elapsedMs >= acceleratedDurationMs) {
        if (!clock.ended) {
          clock.ended = true;
          onEnded();
        }
        return;
      }
      clock.frame = requestAnimationFrame(step);
    };
    clock.frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(clock.frame);
  }, [directive.operationMode, directive.revision, directive.runMode, directive.scene.durationMs, directive.scene.kind, directive.scene.loop, directive.testSpeed, directive.verificationMode, enabled, onEnded, onFrame]);
}

function AudienceCopy({ directive, elapsedMs, overlayText }: { directive: AudienceDirective; elapsedMs: number; overlayText: string | null }) {
  const { scene } = directive;
  const remainingMs = Math.max(0, directive.recordingDurationMs - elapsedMs);
  const recordingProgress = directive.recordingDurationMs > 0 ? Math.min(1, elapsedMs / directive.recordingDurationMs) : 0;

  if (scene.id === "IDLE" || scene.id === "BOOT" || scene.id === "SYSTEM_CHECK" || scene.id === "RESETTING") {
    return (
      <div className="audience-copy audience-copy--idle">
        {scene.id === "IDLE" ? null : <p className="audience-brand">RE:LIGHT</p>}
        <h1>{scene.id === "SYSTEM_CHECK" ? "กำลังเตรียมประสบการณ์" : scene.title}</h1>
        {scene.subtitle ? <p className="audience-subtitle">{scene.subtitle}</p> : null}
      </div>
    );
  }

  if (scene.id === "WAITING_FOR_RECORD") {
    return (
      <div className="audience-copy audience-copy--prompt" data-testid="audience-record-prompt">
        <p className="audience-brand">RE:LIGHT</p>
        <h1>กดปุ่มบันทึกเสียงสีแดง แล้วบอกความฝันของคุณ</h1>
        <div className="purpose-line" aria-label={scene.purpose || "บันทึกความฝัน"}>
          <span aria-hidden="true" />
          <p>{scene.purpose || "บันทึกความฝัน / RECORD"}</p>
          <span aria-hidden="true" />
        </div>
        <p className="privacy-notice">{scene.privacyNotice || "เสียงของคุณจะใช้เฉพาะในประสบการณ์นี้ และจะถูกลบทันทีเมื่อจบ"}</p>
      </div>
    );
  }

  if (scene.id === "RECORDING") {
    return (
      <div className="audience-copy audience-copy--recording" data-testid="audience-recording">
        <p className="audience-brand">RE:LIGHT</p>
        <div aria-hidden="true" className="recording-symbol"><span /></div>
        <h1>กำลังบันทึกเสียงของคุณ</h1>
        <p className="audience-subtitle">บอกความฝันของคุณได้เลย</p>
        <div aria-label={`เหลือเวลา ${Math.ceil(remainingMs / 1000)} วินาที`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(recordingProgress * 100)} className="recording-progress" role="progressbar">
          <span style={{ inlineSize: `${recordingProgress * 100}%` }} />
        </div>
        <p className="recording-time">{Math.ceil(remainingMs / 1000)}</p>
      </div>
    );
  }

  if (scene.id === "WAITING_FOR_CHOICE") {
    return (
      <div className="audience-copy audience-copy--prompt" data-testid="audience-choice-prompt">
        <p className="audience-brand">RE:LIGHT</p>
        <h1>กดปุ่มเลือกใหม่สีขาว — เอาพรุ่งนี้ของฉันคืนมา</h1>
        <div className="purpose-line purpose-line--choice" aria-label={scene.purpose || "เลือกอีกครั้ง"}>
          <span aria-hidden="true" />
          <p>{scene.purpose || "เลือกอีกครั้ง / CHOOSE AGAIN"}</p>
          <span aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (directive.operationMode === "test") {
    return (
      <div className="audience-copy audience-copy--test-scene">
        <h1 data-testid="audience-scene-title">{scene.title}</h1>
      </div>
    );
  }

  return (
    <div className={`audience-copy audience-copy--scene audience-copy--${scene.id.toLowerCase()}`}>
      <p className="scene-sequence">{scene.sequence}</p>
      <h1>{overlayText ?? scene.title}</h1>
      {scene.subtitle ? <p className="audience-subtitle">{scene.subtitle}</p> : null}
    </div>
  );
}

export function App() {
  const bridge = useMemo(() => getAudienceBridge(), []);
  const audio = useMemo(() => new AudioGraph(), []);
  const recording = useMemo(() => new RecordingEngine(audio), [audio]);
  const scheduler = useMemo(() => new TimelineScheduler(), []);
  const [directive, setDirective] = useState<AudienceDirective | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [overlayText, setOverlayText] = useState<string | null>(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const directiveRef = useRef<AudienceDirective | null>(null);
  const lastProgressReport = useRef(0);
  const lastQualityReport = useRef(0);
  const activeMediaRequest = useRef<string | null>(null);
  const handledMediaRequests = useRef(new Set<string>());
  const handledMediaRequestOrder = useRef<string[]>([]);
  const processedRevision = useRef(-1);
  const announcedReady = useRef(false);
  const voiceEffectOverride = useRef<keyof AudienceDirective["voiceEffects"] | null>(null);

  const report = useCallback(
    (event: AudienceReport) => {
      void bridge.report(event).catch(() => {
        // The audience remains cinematic; bridge failures are recovered by the main process.
      });
    },
    [bridge],
  );

  useEffect(() => {
    let mounted = true;
    void bridge.getDirective().then((next) => {
      if (mounted) setDirective(next);
    });
    const unsubscribe = bridge.subscribe((next) => {
      if (mounted) setDirective(next);
    });
    return () => {
      mounted = false;
      unsubscribe();
      recording.cleanup();
      audio.cleanupSession();
    };
  }, [audio, bridge, recording]);

  useEffect(() => {
    directiveRef.current = directive;
  }, [directive]);

  const selectedAudioOutputId = directive?.selectedAudioOutputId;
  useEffect(() => {
    if (selectedAudioOutputId === undefined) return;
    let active = true;
    void audio.setOutputDevice(selectedAudioOutputId).catch((error: unknown) => {
      if (!active) return;
      const current = directiveRef.current;
      if (!current || current.selectedAudioOutputId !== selectedAudioOutputId) return;
      report({
        type: "audio.error",
        revision: current.revision,
        message: error instanceof Error ? error.message : "The selected sound output could not be opened.",
      });
    });
    return () => {
      active = false;
    };
  }, [audio, report, selectedAudioOutputId]);

  useEffect(() => {
    if (!directive) return;
    audio.setLevels(directive.audio);
    if (directive.runMode === "paused") void audio.suspend();
    else void audio.resume().catch(() => undefined);

    if (processedRevision.current === directive.revision) return;
    processedRevision.current = directive.revision;
    scheduler.reset(directive.revision, directive.scene.timeline);
    audio.beginTimelineRevision();
    voiceEffectOverride.current = null;
    setElapsedMs(0);
    setOverlayText(null);
    setMediaFailed(false);
    if (!announcedReady.current) {
      announcedReady.current = true;
      report({ type: "audience.ready", revision: directive.revision });
    }

    if (["BOOT", "SYSTEM_CHECK", "IDLE", "RESETTING"].includes(directive.scene.id)) {
      recording.cleanup();
      audio.cleanupSession();
    }

    if (directive.scene.id === "MEMORY_INTRO" || directive.scene.id === "WAITING_FOR_RECORD") {
      void recording
        .arm(directive.selectedMicrophoneId, directive.revision, (level, deviceId) => {
          const current = directiveRef.current;
          if (current?.revision === directive.revision) report({ type: "microphone.level", revision: directive.revision, level, deviceId });
        })
        .then((microphone) => {
          if (directiveRef.current?.revision === directive.revision) {
            report({ type: "recording.armed", revision: directive.revision, deviceLabel: microphone.label, deviceId: microphone.deviceId });
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (directiveRef.current?.revision === directive.revision) {
            report({ type: "recording.failed", revision: directive.revision, message: error instanceof Error ? error.message : "Microphone arming failed." });
          }
        });
    }

    if (directive.scene.id === "RECORDING") {
      void recording
        .arm(directive.selectedMicrophoneId, directive.revision, (level, deviceId) => {
          const current = directiveRef.current;
          if (current?.revision === directive.revision) report({ type: "microphone.level", revision: directive.revision, level, deviceId });
        })
        .then(() => {
          const current = directiveRef.current;
          if (current?.revision !== directive.revision) throw new DOMException("Stale recording command.", "AbortError");
          report({ type: "recording.started", revision: directive.revision });
          // START_RECORDING follows ENTER_STATE over IPC. Read the latest
          // directive after microphone arming so an accelerated or updated
          // maximum duration cannot lose that ordering race.
          return recording.start(current.recordingDurationMs, current.revision);
        })
        .then(async (result) => {
          if (directiveRef.current?.revision !== directive.revision) return;
          await audio.setVisitorRecording(result.data);
          if (directiveRef.current?.revision !== directive.revision) return;
          report({
            type: "recording.completed",
            revision: directive.revision,
            durationMs: result.durationMs,
            mimeType: result.mimeType,
          });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          report({ type: "recording.failed", revision: directive.revision, message: error instanceof Error ? error.message : "Voice recording failed." });
        });
    }
  }, [audio, directive, recording, report, scheduler]);

  useEffect(() => {
    const request = directive?.mediaRequests[0];
    if (!directive || !request) {
      activeMediaRequest.current = null;
      return;
    }
    if (activeMediaRequest.current === request.id || handledMediaRequests.current.has(request.id)) return;
    activeMediaRequest.current = request.id;

    const markHandled = (): boolean => {
      if (activeMediaRequest.current !== request.id) return false;
      activeMediaRequest.current = null;
      handledMediaRequests.current.add(request.id);
      handledMediaRequestOrder.current.push(request.id);
      while (handledMediaRequestOrder.current.length > 64) {
        const expired = handledMediaRequestOrder.current.shift();
        if (expired !== undefined) handledMediaRequests.current.delete(expired);
      }
      return true;
    };
    const complete = (message: string) => {
      if (!markHandled()) return;
      report({
        type: "mediaRequest.completed",
        revision: request.stateRevision,
        requestId: request.id,
        requestType: request.type,
        message,
      });
    };
    const fail = (error: unknown) => {
      if (!markHandled()) return;
      report({
        type: "mediaRequest.failed",
        revision: request.stateRevision,
        requestId: request.id,
        requestType: request.type,
        ...(request.microphoneDeviceId === undefined
          ? {}
          : { microphoneDeviceId: request.microphoneDeviceId }),
        message: error instanceof Error ? error.message : "Media test failed.",
      });
    };

    const immediateMessage = runImmediateMediaRequest(request, {
      stopRecording: () => recording.stop(),
      cleanupRecording: () => recording.cleanup(),
      cleanupAudio: () => audio.cleanupSession(),
    });
    if (immediateMessage !== null) {
      complete(immediateMessage);
      // TEST_JUMP can dispose the old recording while entering the record
      // prompt. Re-arm the new revision after cleanup so the next R press does
      // not inherit or race the participant's previous capture.
      if (request.type === "recording.discard" &&
        (directive.scene.id === "MEMORY_INTRO" || directive.scene.id === "WAITING_FOR_RECORD") &&
        directive.revision !== request.stateRevision) {
        void recording
          .arm(directive.selectedMicrophoneId, directive.revision, (level, deviceId) => {
            if (directiveRef.current?.revision === directive.revision) {
              report({ type: "microphone.level", revision: directive.revision, level, deviceId });
            }
          })
          .then((microphone) => {
            if (directiveRef.current?.revision === directive.revision) {
              report({
                type: "recording.armed",
                revision: directive.revision,
                deviceLabel: microphone.label,
                deviceId: microphone.deviceId,
              });
            }
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") return;
            if (directiveRef.current?.revision === directive.revision) {
              report({
                type: "recording.failed",
                revision: directive.revision,
                message: error instanceof Error ? error.message : "Microphone re-arming failed.",
              });
            }
          });
      }
      return;
    }

    if (request.type === "audio.test") {
      void audio
        .setOutputDevice(directive.selectedAudioOutputId)
        .then(() => audio.playTestTone())
        .then(() => complete("Speaker test played."))
        .catch(fail);
      return;
    }

    void recording
      .arm(request.microphoneDeviceId ?? directive.selectedMicrophoneId, request.stateRevision, (level, deviceId) => {
        if (directiveRef.current?.revision === request.stateRevision && activeMediaRequest.current === request.id) {
          report({ type: "microphone.level", revision: request.stateRevision, level, deviceId });
        }
      })
      .then(async (microphone) => {
        if (directiveRef.current?.revision !== request.stateRevision || activeMediaRequest.current !== request.id) {
          throw new DOMException("Stale media request.", "AbortError");
        }
        if (request.type === "mic.arm") {
          complete(`Microphone ready: ${microphone.label}`);
          return;
        }
        await new Promise<void>((resolveTest) => {
          window.setTimeout(resolveTest, request.durationMs ?? 2000);
        });
        if (directiveRef.current?.revision !== request.stateRevision || activeMediaRequest.current !== request.id) {
          throw new DOMException("Stale media request.", "AbortError");
        }
        recording.cleanup();
        complete(`Microphone signal test completed: ${microphone.label}`);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError" && activeMediaRequest.current !== request.id) return;
        recording.cleanup();
        fail(error);
      });
  }, [audio, directive, recording, report]);

  const handleTimelineAction = useCallback(
    (action: TimelineAction, activeDirective: AudienceDirective) => {
      if (action.action === "playVisitorVoice") {
        const presetName = voiceEffectOverride.current ?? action.preset;
        // Capture failure is explicitly non-fatal: preserve the cinematic
        // timeline and continue once without participant-voice playback.
        if (audio.hasVisitorRecording()) {
          void audio
            .playVisitorVoice(presetName, activeDirective.voiceEffects[presetName])
            .catch((error: unknown) => report({
              type: "media.error",
              revision: activeDirective.revision,
              sceneId: activeDirective.scene.id,
              message: error instanceof Error ? error.message : "Participant voice playback failed.",
            }));
        }
      } else if (action.action === "showText") {
        setOverlayText(action.text);
      } else if (action.action === "hideText") {
        setOverlayText(null);
      } else if (action.action === "playSound") {
        void audio
          .playTimelineSound(action.id, action.assetUrl, action.bus, action.gain)
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") return;
            report({
              type: "media.error",
              revision: activeDirective.revision,
              sceneId: activeDirective.scene.id,
              message: error instanceof Error ? error.message : "Timeline audio playback failed.",
            });
          });
      } else if (action.action === "stopSound") {
        audio.stopTimelineSound(action.soundId);
      } else if (action.action === "changeVolume") {
        audio.setBusLevel(action.bus, action.value);
      } else if (action.action === "fadeAudio") {
        audio.setBusLevel(action.bus, action.value, action.durationMs);
      } else if (action.action === "setVoiceEffect") {
        voiceEffectOverride.current = action.preset;
      }
      report({ type: "timeline.action", revision: activeDirective.revision, action });
    },
    [audio, report],
  );

  const handleFrame = useCallback(
    (frameElapsedMs: number, durationMs: number, frameReport: VideoFrameReport = {}) => {
      const current = directiveRef.current;
      if (!current || current.runMode === "paused") return;
      const now = performance.now();
      if (now - lastProgressReport.current > 90) setElapsedMs(frameElapsedMs);
      if (now - lastProgressReport.current > 250) {
        lastProgressReport.current = now;
        const includeQuality = now - lastQualityReport.current > 2_000;
        if (includeQuality) lastQualityReport.current = now;
        report({
          type: "media.progress",
          revision: current.revision,
          sceneId: current.scene.id,
          elapsedMs: frameElapsedMs,
          durationMs,
          seeking: false,
          ...(includeQuality && frameReport.droppedVideoFrames !== undefined ? { droppedVideoFrames: frameReport.droppedVideoFrames } : {}),
          ...(includeQuality && frameReport.totalVideoFrames !== undefined ? { totalVideoFrames: frameReport.totalVideoFrames } : {}),
        });
      }
      for (const action of scheduler.tick(current.revision, frameElapsedMs)) handleTimelineAction(action, current);
    },
    [handleTimelineAction, report, scheduler],
  );

  const handleSeek = useCallback(
    (frameElapsedMs: number, durationMs: number, frameReport: VideoFrameReport) => {
      const current = directiveRef.current;
      if (!current) return;
      scheduler.notifySeek(current.revision, frameElapsedMs);
      setElapsedMs(frameElapsedMs);
      report({
        type: "media.progress",
        revision: current.revision,
        sceneId: current.scene.id,
        elapsedMs: frameElapsedMs,
        durationMs,
        seeking: true,
        ...(frameReport.droppedVideoFrames !== undefined ? { droppedVideoFrames: frameReport.droppedVideoFrames } : {}),
        ...(frameReport.totalVideoFrames !== undefined ? { totalVideoFrames: frameReport.totalVideoFrames } : {}),
      });
    },
    [report, scheduler],
  );

  const handleEnded = useCallback(() => {
    const current = directiveRef.current;
    if (current) report({ type: "media.ended", revision: current.revision, sceneId: current.scene.id });
  }, [report]);

  const chosenMediaUrl = directive
    ? directive.operationMode === "test"
      ? null
      : directive.developerMode && directive.scene.developerMediaUrl
      ? directive.scene.developerMediaUrl
      : directive.scene.mediaUrl
    : null;
  const activeMediaUrl = mediaFailed ? null : chosenMediaUrl;

  usePlaceholderClock(directive ?? ({
    revision: -1,
    runMode: "idle",
    scene: { durationMs: null, loop: true },
  } as AudienceDirective), !activeMediaUrl && directive !== null, handleFrame, handleEnded);

  if (!directive) {
    return (
      <main className="audience-root audience-root--loading" data-testid="audience-root">
        <p className="audience-brand">RE:LIGHT</p>
      </main>
    );
  }

  if (directive.scene.id === "RESETTING" || directive.mediaRequests.some((request) => request.type === "media.cleanup")) {
    return (
      <main
        aria-label="RE:Light audience output safely blanked"
        className="audience-root audience-root--safety-blank"
        data-state="RESETTING"
        data-testid="audience-root"
      />
    );
  }

  const testPresentation = directive.operationMode === "test";
  const rootStyle = { "--scene-tone": directive.scene.tone } as CSSProperties;
  return (
    <main
      aria-label="RE:Light audience experience"
      className={`audience-root audience-root--${directive.scene.id.toLowerCase()}${testPresentation ? " audience-root--test" : ""}`}
      data-state={directive.scene.id}
      data-testid="audience-root"
      style={rootStyle}
    >
      {!testPresentation ? (
        <VideoDeck
          audio={audio}
          loop={directive.scene.loop}
          mediaUrl={activeMediaUrl}
          nextMediaUrl={directive.scene.nextMediaUrl}
          onEnded={handleEnded}
          onError={(message) => {
            setMediaFailed(true);
            report({ type: "media.error", revision: directive.revision, sceneId: directive.scene.id, message });
          }}
          onFrame={handleFrame}
          onReady={(durationMs) => report({ type: "media.ready", revision: directive.revision, sceneId: directive.scene.id, durationMs })}
          onSeek={handleSeek}
          paused={directive.runMode === "paused"}
          revision={directive.revision}
          transitionMs={directive.scene.transitionMs}
        />
      ) : null}
      {!testPresentation && !activeMediaUrl ? <div aria-hidden="true" className="placeholder-atmosphere"><span /><span /><span /></div> : null}
      {!testPresentation ? <div aria-hidden="true" className="audience-vignette" /> : null}
      <section aria-atomic="true" aria-live="polite" className="audience-content" data-state={directive.scene.id} data-testid="audience-state">
        <AudienceCopy directive={directive} elapsedMs={elapsedMs} overlayText={overlayText} />
      </section>
      {directive.developerMode && directive.showDiagnostics ? (
        <aside className="developer-overlay" data-testid="audience-developer-overlay">
          <strong>DEVELOPMENT</strong>
          <span>{directive.scene.id}</span>
          <span>{formatTime(elapsedMs)}</span>
          <span>{activeMediaUrl ? "VIDEO" : "PLACEHOLDER"}</span>
        </aside>
      ) : null}
    </main>
  );
}
