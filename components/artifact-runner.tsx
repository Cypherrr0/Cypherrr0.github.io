"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublishedArtifactRuntime } from "@/lib/artifacts";

type ArtifactRunnerProps = {
  artifactId: string;
  capabilities: string[];
  html: string;
  mobile: "desktop-only" | "supported";
  runtime: PublishedArtifactRuntime | null;
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
  runtime,
  title,
}: ArtifactRunnerProps) {
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [runtimeAttempt, setRuntimeAttempt] = useState(0);
  const [runtimeHtml, setRuntimeHtml] = useState<string | null>(
    runtime ? null : html,
  );
  const [mobileViewport, setMobileViewport] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const send = useCallback((message: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 560px)");
    const update = () => {
      setMobileViewport(query.matches);
      setViewportReady(true);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!viewportReady) {
      return;
    }
    setActive(!(mobile === "desktop-only" && mobileViewport));
  }, [mobile, mobileViewport, viewportReady]);

  useEffect(() => {
    if (!active || !runtime || runtimeHtml) {
      return;
    }

    const controller = new AbortController();
    const loadRuntime = async () => {
      try {
        if (!window.crypto?.subtle) {
          throw new Error("浏览器不支持运行时完整性校验");
        }
        const response = await fetch(runtime.publicPath, {
          cache: "force-cache",
          credentials: "omit",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`运行时加载失败（${response.status}）`);
        }
        const sourceBytes = new Uint8Array(await response.arrayBuffer());
        if (
          sourceBytes.byteLength !== runtime.bytes ||
          sourceBytes.byteLength > runtime.maxBytes
        ) {
          throw new Error("运行时大小校验失败");
        }
        const digest = await window.crypto.subtle.digest(
          "SHA-256",
          sourceBytes,
        );
        const actualHash = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        if (actualHash !== runtime.sha256) {
          throw new Error("运行时完整性校验失败");
        }
        const runtimeSource = new TextDecoder().decode(sourceBytes);
        if (runtimeSource.toLowerCase().includes("</script")) {
          throw new Error("运行时包含不安全的 script 结束序列");
        }
        const runtimeScript =
          `<script data-corepedia-runtime="${runtime.name}/${runtime.version}/${runtime.profile}">`
          + `${runtimeSource}</script>`;
        const injected = html.replace(
          /(<meta\b(?=[^>]*\bhttp-equiv=["']Content-Security-Policy["'])[^>]*>)/i,
          (cspMeta) => `${cspMeta}\n${runtimeScript}`,
        );
        if (injected === html) {
          throw new Error("交互制品缺少 CSP，无法安全注入运行时");
        }
        setRuntimeHtml(injected);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message.slice(0, 160)
            : "图表运行时加载失败",
        );
      }
    };

    void loadRuntime();
    return () => controller.abort();
  }, [active, html, runtime, runtimeAttempt, runtimeHtml]);

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
        const bounds = rootRef.current?.getBoundingClientRect();
        send({
          type: "corepedia:visibility",
          visible:
            !document.hidden &&
            Boolean(
              bounds &&
                bounds.bottom > 0 &&
                bounds.right > 0 &&
                bounds.top < window.innerHeight &&
                bounds.left < window.innerWidth,
            ),
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

  const reset = () => {
    send({ type: "corepedia:reset" });
  };

  const retryRuntime = () => {
    setError("");
    setReady(false);
    setRuntimeHtml(null);
    setRuntimeAttempt((attempt) => attempt + 1);
  };

  const sandbox = [
    "allow-scripts",
    capabilities.includes("pointer-lock") ? "allow-pointer-lock" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (
    !viewportReady ||
    (mobile === "desktop-only" && mobileViewport)
  ) {
    return (
      <div
        className="artifact-runner artifact-runner-mobile-notice"
        data-artifact-id={artifactId}
      >
        {viewportReady ? (
          <>
            <strong>请使用电脑端打开</strong>
            <span>此交互图依赖横向空间关系，手机端仅保留正文说明。</span>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={active ? "artifact-runner is-active" : "artifact-runner"}
      data-artifact-id={artifactId}
      ref={rootRef}
    >
      {active ? (
        <>
          {runtimeHtml ? (
            <iframe
              allow={
                capabilities.includes("fullscreen") ? "fullscreen" : undefined
              }
              className="artifact-inner-frame"
              ref={frameRef}
              referrerPolicy="no-referrer"
              sandbox={sandbox}
              srcDoc={runtimeHtml}
              title={title}
            />
          ) : null}
          <div className="artifact-runtime-status" aria-live="polite">
            <span>
              {error ||
                (ready
                  ? "交互已就绪"
                  : runtime
                    ? "正在校验图表运行时…"
                    : "正在启动交互…")}
            </span>
            <button
              onClick={error && runtime ? retryRuntime : reset}
              type="button"
            >
              {error && runtime ? "重试" : "重置"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
