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
  return (
    <span className="rolling-words">
      <span className="sr-only">thoughts only</span>
      <span aria-hidden="true" className="rolling-words-window">
        {WORDS.map((word, index) => (
          <span
            className="rolling-word"
            key={word}
            style={{ "--word-index": index } as React.CSSProperties}
          >
            {word}
          </span>
        ))}
      </span>
      <span aria-hidden="true" className="rolling-words-suffix">
        only
      </span>
    </span>
  );
}
