"use client";

import { useEffect, useRef, useState } from "react";

const WORDS = [
  "thoughts",
  "notes",
  "questions",
  "systems",
  "traces",
  "signals",
  "vibes",
];

export function RollingWords() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const currentIndexRef = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let transitionTimer: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      const previous = currentIndexRef.current;
      const next = (previous + 1) % WORDS.length;

      currentIndexRef.current = next;
      setPreviousIndex(previous);
      setCurrentIndex(next);

      if (transitionTimer) {
        clearTimeout(transitionTimer);
      }
      transitionTimer = setTimeout(() => {
        setPreviousIndex(null);
      }, 900);
    }, 5000);

    return () => {
      clearInterval(interval);
      if (transitionTimer) {
        clearTimeout(transitionTimer);
      }
    };
  }, []);

  return (
    <span className="rolling-words">
      <span className="sr-only">thoughts only</span>
      <span aria-hidden="true" className="rolling-words-window">
        {WORDS.map((word, index) => {
          const state =
            index === currentIndex
              ? "is-current"
              : index === previousIndex
                ? "is-previous"
                : "";

          return (
            <span className={`rolling-word ${state}`} key={word}>
              {word}
            </span>
          );
        })}
      </span>
      <span aria-hidden="true" className="rolling-words-suffix">
        only
      </span>
    </span>
  );
}
