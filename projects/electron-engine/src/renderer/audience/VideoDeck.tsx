import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AudioGraph } from "./AudioGraph";

interface VideoFrameMetadataLike {
  mediaTime: number;
}

export interface VideoFrameReport {
  droppedVideoFrames?: number;
  totalVideoFrames?: number;
}

interface FrameCallbackSupport {
  requestVideoFrameCallback?: (callback: (now: number, metadata: VideoFrameMetadataLike) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

interface VideoDeckProps {
  audio: AudioGraph;
  loop: boolean;
  mediaUrl: string | null;
  nextMediaUrl: string | null;
  paused: boolean;
  revision: number;
  transitionMs: number;
  onEnded: () => void;
  onError: (message: string) => void;
  onFrame: (elapsedMs: number, durationMs: number, report: VideoFrameReport) => void;
  onReady: (durationMs: number) => void;
  onSeek: (elapsedMs: number, durationMs: number, report: VideoFrameReport) => void;
}

function mediaErrorMessage(video: HTMLVideoElement): string {
  switch (video.error?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Video loading was aborted.";
    case MediaError.MEDIA_ERR_NETWORK:
      return "The local video could not be read.";
    case MediaError.MEDIA_ERR_DECODE:
      return "The video could not be decoded.";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "The configured video format is not supported.";
    default:
      return "The configured video could not be played.";
  }
}

function readFrameReport(video: HTMLVideoElement): VideoFrameReport {
  if (typeof video.getVideoPlaybackQuality !== "function") return {};
  const quality = video.getVideoPlaybackQuality();
  return {
    droppedVideoFrames: quality.droppedVideoFrames,
    totalVideoFrames: quality.totalVideoFrames,
  };
}

export function VideoDeck({
  audio,
  loop,
  mediaUrl,
  nextMediaUrl,
  paused,
  revision,
  transitionMs,
  onEnded,
  onError,
  onFrame,
  onReady,
  onSeek,
}: VideoDeckProps) {
  const first = useRef<HTMLVideoElement>(null);
  const second = useRef<HTMLVideoElement>(null);
  const activeIndex = useRef(0);
  const activeMediaUrl = useRef<string | null>(null);
  const revisionRef = useRef(revision);
  const pausedRef = useRef(paused);
  const frameHandle = useRef<{ kind: "video" | "animation"; value: number; element: HTMLVideoElement; callbacks: FrameCallbackSupport } | null>(null);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const handlers = useRef({ onEnded, onError, onFrame, onReady, onSeek });

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    handlers.current = { onEnded, onError, onFrame, onReady, onSeek };
  }, [onEnded, onError, onFrame, onReady, onSeek]);

  const stopFrames = useCallback(() => {
    const handle = frameHandle.current;
    if (!handle) return;
    if (handle.kind === "video") handle.callbacks.cancelVideoFrameCallback?.(handle.value);
    else cancelAnimationFrame(handle.value);
    frameHandle.current = null;
  }, []);

  const startFrames = useCallback((video: HTMLVideoElement, expectedRevision: number) => {
    stopFrames();
    const callbacks = video as unknown as FrameCallbackSupport;
    const step = (_now: number, metadata?: VideoFrameMetadataLike) => {
      if (revisionRef.current !== expectedRevision) return;
      const elapsedMs = (metadata?.mediaTime ?? video.currentTime) * 1000;
      const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : 0;
      handlers.current.onFrame(elapsedMs, durationMs, readFrameReport(video));
      if (callbacks.requestVideoFrameCallback) {
        frameHandle.current = { kind: "video", value: callbacks.requestVideoFrameCallback(step), element: video, callbacks };
      } else {
        frameHandle.current = { kind: "animation", value: requestAnimationFrame((now) => step(now)), element: video, callbacks };
      }
    };
    if (callbacks.requestVideoFrameCallback) {
      frameHandle.current = { kind: "video", value: callbacks.requestVideoFrameCallback(step), element: video, callbacks };
    } else {
      frameHandle.current = { kind: "animation", value: requestAnimationFrame((now) => step(now)), element: video, callbacks };
    }
  }, [stopFrames]);

  useEffect(() => {
    if (first.current) audio.connectVideo(first.current);
    if (second.current) audio.connectVideo(second.current);
  }, [audio]);

  useEffect(() => {
    revisionRef.current = revision;
    stopFrames();
    const videos = [first.current, second.current];
    if (!mediaUrl) {
      activeMediaUrl.current = null;
      for (const video of videos) {
        if (!video) continue;
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      return;
    }

    const nextIndex = activeIndex.current === 0 ? 1 : 0;
    const next = videos[nextIndex];
    const previous = videos[activeIndex.current];
    if (!next) return;
    const expectedRevision = revision;
    let disposed = false;
    let crossfadeTimer: number | null = null;
    let firstFrameHandle: { kind: "video" | "animation"; value: number; callbacks: FrameCallbackSupport } | null = null;
    let settleFirstFrame: (() => void) | null = null;

    const waitForFirstFrame = (): Promise<void> => new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        settleFirstFrame = null;
        resolve();
      };
      settleFirstFrame = finish;
      const callbacks = next as unknown as FrameCallbackSupport;
      if (callbacks.requestVideoFrameCallback) {
        firstFrameHandle = {
          kind: "video",
          value: callbacks.requestVideoFrameCallback(() => finish()),
          callbacks,
        };
        return;
      }
      const poll = () => {
        if (disposed || next.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          finish();
          return;
        }
        firstFrameHandle = { kind: "animation", value: requestAnimationFrame(poll), callbacks };
      };
      firstFrameHandle = { kind: "animation", value: requestAnimationFrame(poll), callbacks };
    });

    const beginPlayback = async () => {
      if (disposed || revisionRef.current !== expectedRevision) return;
      try {
        next.loop = loop;
        await audio.resume();
        await next.play();
        await waitForFirstFrame();
        if (disposed || revisionRef.current !== expectedRevision) return;
        firstFrameHandle = null;
        activeIndex.current = nextIndex;
        activeMediaUrl.current = mediaUrl;
        setVisibleIndex(nextIndex);
        if (previous) {
          crossfadeTimer = window.setTimeout(() => {
            if (activeIndex.current !== nextIndex) return;
            previous.pause();
            previous.currentTime = 0;
            if (nextMediaUrl && nextMediaUrl !== mediaUrl) {
              previous.src = nextMediaUrl;
              previous.dataset.preloadedUrl = nextMediaUrl;
              previous.load();
            } else {
              previous.removeAttribute("src");
              delete previous.dataset.preloadedUrl;
              previous.load();
            }
          }, Math.max(0, transitionMs));
        }
        const durationMs = Number.isFinite(next.duration) ? next.duration * 1000 : 0;
        handlers.current.onReady(durationMs);
        if (pausedRef.current) next.pause();
        else startFrames(next, expectedRevision);
      } catch (error: unknown) {
        if (!disposed) handlers.current.onError(error instanceof Error ? error.message : "Video playback could not start.");
      }
    };
    const handleMetadata = () => void beginPlayback();
    const handleError = () => {
      if (!disposed && revisionRef.current === expectedRevision) handlers.current.onError(mediaErrorMessage(next));
    };
    const handleEnded = () => {
      if (!disposed && revisionRef.current === expectedRevision) handlers.current.onEnded();
    };
    const handleSeeking = () => {
      if (disposed || revisionRef.current !== expectedRevision) return;
      const durationMs = Number.isFinite(next.duration) ? next.duration * 1000 : 0;
      handlers.current.onSeek(Math.max(0, next.currentTime * 1000), durationMs, readFrameReport(next));
    };

    const alreadyPreloaded = next.dataset.preloadedUrl === mediaUrl && next.readyState >= HTMLMediaElement.HAVE_METADATA;
    next.pause();
    next.loop = loop;
    next.addEventListener("loadedmetadata", handleMetadata, { once: true });
    next.addEventListener("error", handleError, { once: true });
    next.addEventListener("ended", handleEnded);
    next.addEventListener("seeking", handleSeeking);
    if (alreadyPreloaded) {
      next.currentTime = 0;
      void beginPlayback();
    } else {
      next.src = mediaUrl;
      next.currentTime = 0;
      next.load();
    }

    return () => {
      disposed = true;
      next.removeEventListener("loadedmetadata", handleMetadata);
      next.removeEventListener("error", handleError);
      next.removeEventListener("ended", handleEnded);
      next.removeEventListener("seeking", handleSeeking);
      if (crossfadeTimer !== null) window.clearTimeout(crossfadeTimer);
      if (firstFrameHandle?.kind === "video") firstFrameHandle.callbacks.cancelVideoFrameCallback?.(firstFrameHandle.value);
      else if (firstFrameHandle?.kind === "animation") cancelAnimationFrame(firstFrameHandle.value);
      settleFirstFrame?.();
      stopFrames();
    };
  }, [audio, loop, mediaUrl, nextMediaUrl, revision, startFrames, stopFrames, transitionMs]);

  useEffect(() => {
    const active = activeIndex.current === 0 ? first.current : second.current;
    if (!active || !mediaUrl || activeMediaUrl.current !== mediaUrl) return;
    if (paused) {
      active.pause();
      stopFrames();
    } else {
      void audio
        .resume()
        .then(() => active.play())
        .then(() => startFrames(active, revisionRef.current))
        .catch((error: unknown) => handlers.current.onError(error instanceof Error ? error.message : "Playback could not resume."));
    }
  }, [audio, mediaUrl, paused, startFrames, stopFrames, visibleIndex]);

  useEffect(() => () => stopFrames(), [stopFrames]);

  const style = { "--deck-transition": `${Math.max(0, transitionMs)}ms` } as CSSProperties;
  return (
    <div aria-hidden="true" className="video-deck" style={style}>
      <video className={visibleIndex === 0 && mediaUrl ? "video-deck__layer video-deck__layer--visible" : "video-deck__layer"} playsInline preload="auto" ref={first} />
      <video className={visibleIndex === 1 && mediaUrl ? "video-deck__layer video-deck__layer--visible" : "video-deck__layer"} playsInline preload="auto" ref={second} />
    </div>
  );
}
