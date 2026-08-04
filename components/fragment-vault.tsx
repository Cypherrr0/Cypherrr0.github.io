"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFragmentAccess } from "@/components/use-fragment-access";
import type { FragmentPage } from "@/lib/wiki";

const ETHIOPIC_RANGES = [
  [0x1200, 0x1248],
  [0x124a, 0x124d],
  [0x1250, 0x1256],
  [0x1258, 0x1258],
  [0x125a, 0x125d],
  [0x1260, 0x1288],
  [0x128a, 0x128d],
  [0x1290, 0x12b0],
  [0x12b2, 0x12b5],
  [0x12b8, 0x12be],
  [0x12c0, 0x12c0],
  [0x12c2, 0x12c5],
  [0x12c8, 0x12d6],
  [0x12d8, 0x1310],
  [0x1312, 0x1315],
  [0x1318, 0x135a],
  [0x135d, 0x137c],
] as const;
const ETHIOPIC_GLYPHS = ETHIOPIC_RANGES.flatMap(([start, end]) =>
  Array.from({ length: end - start + 1 }, (_, index) =>
    String.fromCodePoint(start + index),
  ),
);
const PRESERVED_PUNCTUATION = new Set(
  Array.from("，。！？；：、“”‘’（）《》〈〉—…,.!?;:()[]{}\"'"),
);

export function FragmentVault({ pages }: { pages: FragmentPage[] }) {
  const isUnlocked = useFragmentAccess();

  useEffect(() => {
    const skipLink = document.querySelector<HTMLAnchorElement>(".skip-link");
    if (!skipLink) {
      return;
    }

    const wasHidden = skipLink.hidden;
    skipLink.hidden = true;
    return () => {
      skipLink.hidden = wasHidden;
    };
  }, []);

  if (!isUnlocked) {
    return (
      <main className="fragment-shell fragment-gate" id="main-content">
        <RevealableText
          className="fragment-lock-glyph"
          decoded="锁"
          encoded="፨"
        />
        <h1>
          <RevealableText
            decoded="入口不存在"
            encoded="መግቢያ አልተገኘም"
          />
        </h1>
        <RevealableText
          className="fragment-gate-copy"
          decoded="这条路径不在普通索引中。"
          encoded="መንገዱ በማውጫው ውስጥ አይገኝም።"
        />
        <div className="fragment-gate-return">
          <Link aria-label="返回 Wiki" href="/wiki/">
            ←
          </Link>
          <RevealableText
            decoded="返回普通索引"
            encoded="ወደ ማውጫው ተመለስ"
          />
        </div>
      </main>
    );
  }

  return (
    <main className="fragment-shell" id="main-content">
      <nav aria-label="Fragments 导航" className="fragment-nav">
        <div>
          <Link href="/wiki/" aria-label="返回 Wiki">
            ←
          </Link>
          <RevealableText decoded="返回 Wiki" encoded="፨" />
        </div>
        <RevealableText decoded="信号 1200" encoded="ምልክት ፩፪፻" />
      </nav>

      <header className="fragment-hero">
        <RevealableText
          className="fragment-hero-kicker"
          decoded="普通索引没有记录这里"
          encoded="መደበኛ ማውጫው ያልመዘገበው"
        />
        <h1>
          <RevealableText decoded="碎片" encoded="ፍርስራሾች" />
        </h1>
        <RevealableText
          className="fragment-hero-note"
          decoded={"异常语录。隐藏信号。\n点击文字以恢复。"}
          encoded={"የተለዩ ንግግሮች። የተደበቁ ምልክቶች።\nጽሑፉን ለማስታወስ ንካ።"}
        />
      </header>

      <section aria-label="隐藏语录" className="fragment-list">
        {pages.map((page, pageIndex) => (
          <FragmentEntry key={page.path} page={page} pageIndex={pageIndex} />
        ))}
      </section>
    </main>
  );
}

function FragmentEntry({
  page,
  pageIndex,
}: {
  page: FragmentPage;
  pageIndex: number;
}) {
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const encodedTitle = encodeAsEthiopic(page.title, `${page.slug}:title`);

  const toggle = (paragraphIndex: number) => {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(paragraphIndex)) {
        next.delete(paragraphIndex);
      } else {
        next.add(paragraphIndex);
      }
      return next;
    });
  };

  return (
    <article className="fragment-entry">
      <header>
        <RevealableText
          className="fragment-entry-number"
          decoded={`第 ${pageIndex + 1} 则`}
          encoded={toEthiopicNumber(pageIndex + 1)}
        />
        <h2>
          <RevealableText decoded={page.title} encoded={encodedTitle} />
        </h2>
        <time dateTime={page.updated}>
          <RevealableText decoded={page.updated} encoded={toEthiopicDate(page.updated)} />
        </time>
      </header>
      <div className="fragment-passages">
        {page.paragraphs.map((paragraph, paragraphIndex) => {
          const isRevealed = revealed.has(paragraphIndex);
          const encoded = encodeAsEthiopic(
            paragraph,
            `${page.slug}:${paragraphIndex}`,
          );

          return (
            <button
              aria-label={
                isRevealed ? "再次点击恢复吉兹字形" : "点击显示中文原文"
              }
              aria-pressed={isRevealed}
              className={isRevealed ? "is-revealed" : undefined}
              key={`${page.slug}-${paragraphIndex}`}
              lang={isRevealed ? "zh-CN" : "am"}
              onClick={() => toggle(paragraphIndex)}
              type="button"
            >
              <span aria-hidden="true" className="fragment-line-number">
                {isRevealed
                  ? `第 ${paragraphIndex + 1} 段`
                  : toEthiopicNumber(paragraphIndex + 1)}
              </span>
              <span>{isRevealed ? paragraph : encoded}</span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function RevealableText({
  className,
  decoded,
  encoded,
}: {
  className?: string;
  decoded: string;
  encoded: string;
}) {
  const [isRevealed, setIsRevealed] = useState(false);

  return (
    <button
      aria-label={
        isRevealed ? "再次点击恢复吉兹字形" : "点击显示中文原文"
      }
      aria-pressed={isRevealed}
      className={[
        "fragment-decode",
        className,
        isRevealed ? "is-revealed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      lang={isRevealed ? "zh-CN" : "am"}
      onClick={() => setIsRevealed((current) => !current)}
      type="button"
    >
      {isRevealed ? decoded : encoded}
    </button>
  );
}

function encodeAsEthiopic(source: string, seedSource: string): string {
  let seed = hashString(seedSource);

  return Array.from(source)
    .map((character, index) => {
      if (/\s/u.test(character)) {
        return character;
      }
      if (PRESERVED_PUNCTUATION.has(character)) {
        return character;
      }

      seed = Math.imul(seed ^ (index + 1), 1664525) + 1013904223;
      return ETHIOPIC_GLYPHS[Math.abs(seed) % ETHIOPIC_GLYPHS.length];
    })
    .join("");
}

function hashString(source: string): number {
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function toEthiopicDate(date: string): string {
  return date
    .split("-")
    .map((part) => toEthiopicNumber(Number(part)))
    .join("፡");
}

function toEthiopicNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "፲";
  }

  const thousands = Math.floor(value / 1000);
  const remainder = value % 1000;
  const hundreds = Math.floor(remainder / 100);
  const belowHundred = remainder % 100;
  const parts: string[] = [];

  if (thousands) {
    parts.push(`${toEthiopicBelowHundred(thousands)}፲፻`);
  }
  if (hundreds) {
    parts.push(`${hundreds === 1 ? "" : toEthiopicBelowHundred(hundreds)}፻`);
  }
  if (belowHundred) {
    parts.push(toEthiopicBelowHundred(belowHundred));
  }

  return parts.join("");
}

function toEthiopicBelowHundred(value: number): string {
  const ones = ["", "፩", "፪", "፫", "፬", "፭", "፮", "፯", "፰", "፱"];
  const tens = ["", "፲", "፳", "፴", "፵", "፶", "፷", "፸", "፹", "፺"];
  return `${tens[Math.floor(value / 10)]}${ones[value % 10]}`;
}
