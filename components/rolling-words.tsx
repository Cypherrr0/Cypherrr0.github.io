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
        <span className="rolling-words-track">
          {[...WORDS, WORDS[0]].map((word, index) => (
            <span className="rolling-word" key={`${word}-${index}`}>
              {word} only
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
