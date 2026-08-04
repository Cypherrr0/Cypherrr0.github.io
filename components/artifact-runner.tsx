"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ArtifactRunnerProps = {
  artifactId: string;
  capabilities: string[];
  html: string;
  mobile: "desktop-only" | "supported";
  previewPath: string;
  title: string;
};

type ArtifactMessage = {
  height?: number;
  message?: string;
  type?: string;
  version?: number;
};

export function ArtifactRunner({
  artifactId,
  capabilities,
  html,
  mobile,
  previewPath,
  title,
}: ArtifactRunnerProps) {
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [mobileViewport, setMobileViewport] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const send = useCallback((message: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 560px)");
    const update = () => setMobileViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }

    const handleMessage = (event: MessageEvent<ArtifactMessage>) => {
      if (event.source !== frameRef.current?.contentWindow) {
        return;
      }

      const message = event.data;
      if (!message || typeof message.type !== "string") {
        return;
      }

      if (message.type === "artifact:ready" && message.version === 1) {
        setReady(true);
        setError("");
        send({
          locale: "zh-CN",
          reducedMotion: window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches,
          theme: "paper",
          type: "corepedia:init",
          version: 1,
        });
        return;
      }

      if (message.type === "artifact:error") {
        setError(
          typeof message.message === "string"
            ? message.message.slice(0, 160)
            : "交互制品运行失败",
        );
        return;
      }

      if (
        message.type === "artifact:request-fullscreen" &&
        capabilities.includes("fullscreen")
      ) {
        void rootRef.current?.requestFullscreen();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [active, capabilities, send]);

  useEffect(() => {
    if (!active || !rootRef.current) {
      return;
    }

    const root = rootRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        send({
          type: "corepedia:visibility",
          visible: entry.isIntersecting && !document.hidden,
        });
      },
      { threshold: 0.05 },
    );
    const handleVisibility = () => {
      send({
        type: "corepedia:visibility",
        visible: !document.hidden,
      });
    };

    observer.observe(root);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [active, send]);

  const activate = () => {
    setActive(true);
    setError("");
  };

  const reset = () => {
    send({ type: "corepedia:reset" });
  };

  const sandbox = [
    "allow-scripts",
    capabilities.includes("pointer-lock") ? "allow-pointer-lock" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (mobile === "desktop-only" && mobileViewport) {
    return (
      <div
        className="artifact-runner artifact-runner-mobile-notice"
        data-artifact-id={artifactId}
      >
        <strong>请使用电脑端打开</strong>
        <span>此交互图依赖横向空间关系，手机端仅保留正文说明。</span>
      </div>
    );
  }

  return (
    <div
      className={active ? "artifact-runner is-active" : "artifact-runner"}
      data-artifact-id={artifactId}
      ref={rootRef}
    >
      {!active ? (
        <button
          aria-label={`启动交互：${title}`}
          className="artifact-activation"
          onClick={activate}
          type="button"
        >
          {/* The passive preview is required when scripts are disabled. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" aria-hidden="true" src={previewPath} />
          <span>启动交互</span>
        </button>
      ) : (
        <>
          <iframe
            allow={
              capabilities.includes("fullscreen") ? "fullscreen" : undefined
            }
            className="artifact-inner-frame"
            ref={frameRef}
            referrerPolicy="no-referrer"
            sandbox={sandbox}
            srcDoc={html}
            title={title}
          />
          <div className="artifact-runtime-status" aria-live="polite">
            <span>{error || (ready ? "交互已就绪" : "正在启动交互…")}</span>
            <button onClick={reset} type="button">
              重置
            </button>
          </div>
        </>
      )}
    </div>
  );
}
