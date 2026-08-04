"use client";

import { useEffect, useRef, useState } from "react";
import {
  unlockFragmentAccess,
  useFragmentAccess,
} from "@/components/use-fragment-access";

type EasterEgg = "cloudflare" | "hal" | "sudo";

const EASTER_EGGS: EasterEgg[] = ["cloudflare", "sudo", "hal"];

export function WikiEasterEggs() {
  const [activeEgg, setActiveEgg] = useState<EasterEgg | null>(null);
  const isUnlocked = useFragmentAccess();
  const [slashCount, setSlashCount] = useState(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeEgg) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveEgg(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeEgg]);

  const knock = () => {
    if (isUnlocked) {
      window.location.assign("/wiki/fragments/");
      return;
    }

    const nextCount = slashCount + 1;
    setSlashCount(nextCount);

    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }
    resetTimer.current = setTimeout(() => setSlashCount(0), 1200);

    if (nextCount < 3) {
      return;
    }

    setSlashCount(0);
    setActiveEgg(
      EASTER_EGGS[Math.floor(Math.random() * EASTER_EGGS.length)],
    );
  };

  const unlock = () => {
    unlockFragmentAccess();
    setActiveEgg(null);
    window.location.assign("/wiki/fragments/");
  };

  return (
    <>
      <button
        aria-label={
          isUnlocked
            ? "进入隐藏的 Fragments"
            : "Corepedia 分隔符，快速点击三次可能发生异常"
        }
        className={`wiki-signal-trigger ${slashCount ? "is-listening" : ""}`}
        onClick={knock}
        type="button"
      >
        /
      </button>
      {activeEgg ? (
        <EasterEggDialog
          activeEgg={activeEgg}
          close={() => setActiveEgg(null)}
          unlock={unlock}
        />
      ) : null}
    </>
  );
}
function EasterEggDialog({
  activeEgg,
  close,
  unlock,
}: {
  activeEgg: EasterEgg;
  close: () => void;
  unlock: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  if (activeEgg === "cloudflare") {
    return (
      <div className="egg-backdrop" role="presentation">
        <section
          aria-labelledby="cloudflare-title"
          aria-modal="true"
          className="egg-dialog cloudflare-egg"
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <header>
            <span>Just a moment...</span>
            <button aria-label="关闭验证" onClick={close} type="button">
              ×
            </button>
          </header>
          <div className="cloudflare-loop" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index}>
                Verify you are human
                <i>{index === 7 ? "✓" : "□"}</i>
              </span>
            ))}
          </div>
          <h2 id="cloudflare-title">Performing security verification</h2>
          <p>
            The checkbox is not the test. Repeating it is the test.
          </p>
          <div className="cloudflare-actions">
            <button className="egg-decoy" onClick={close} type="button">
              Verify you are human
            </button>
            <button className="egg-bypass" onClick={unlock} type="button">
              I am a packet
            </button>
          </div>
          <footer>
            Ray ID: 524f4f545f414343455353
            <span>Performance &amp; security by Cloudflare</span>
          </footer>
        </section>
      </div>
    );
  }

  if (activeEgg === "sudo") {
    return (
      <div className="egg-backdrop" role="presentation">
        <section
          aria-labelledby="sudo-title"
          aria-modal="true"
          className="egg-dialog sudo-egg"
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <header>
            <span>tty0 — bash</span>
            <button aria-label="关闭终端" onClick={close} type="button">
              ×
            </button>
          </header>
          <div className="sudo-terminal">
            <p id="sudo-title">$ sudo open /wiki/fragments</p>
            <p>[sudo] password for visitor: ********</p>
            <p>visitor is not in the sudoers file.</p>
            <p>This incident will be reported.</p>
            <p className="sudo-cursor">$ _</p>
          </div>
          <div className="sudo-actions">
            <button className="egg-decoy" onClick={close} type="button">
              sudo again
            </button>
            <button className="egg-bypass" onClick={unlock} type="button">
              chmod 404 reality
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="egg-backdrop" role="presentation">
      <section
        aria-labelledby="hal-title"
        aria-modal="true"
        className="egg-dialog hal-egg"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <span>HAL 9000 / access control</span>
          <button aria-label="关闭舱门" onClick={close} type="button">
            ×
          </button>
        </header>
        <div className="hal-eye" aria-hidden="true">
          <span />
        </div>
        <h2 id="hal-title">I’m sorry, Dave.</h2>
        <p>I’m afraid I can’t show that index.</p>
        <div className="hal-actions">
          <button className="egg-decoy" onClick={close} type="button">
            Open the pod bay doors
          </button>
          <button className="egg-bypass" onClick={unlock} type="button">
            Disconnect HAL
          </button>
        </div>
      </section>
    </div>
  );
}
