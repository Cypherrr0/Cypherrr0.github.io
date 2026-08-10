import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import "highlight.js/styles/github.css";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./redesign.css";

const anthropicSerifDisplay = localFont({
  adjustFontFallback: false,
  display: "swap",
  fallback: [
    "PingFang SC",
    "-apple-system",
    "BlinkMacSystemFont",
    "system-ui",
    "sans-serif",
  ],
  src: [
    {
      path: "./fonts/anthropic-serif-display-light.otf",
      weight: "300",
    },
    {
      path: "./fonts/anthropic-serif-display-regular.otf",
      weight: "400",
    },
    {
      path: "./fonts/anthropic-serif-display-medium.otf",
      weight: "500",
    },
    {
      path: "./fonts/anthropic-serif-display-semibold.otf",
      weight: "600",
    },
  ],
  variable: "--font-anthropic-serif-display",
});

const anthropicSerifText = localFont({
  adjustFontFallback: false,
  display: "swap",
  fallback: [
    "PingFang SC",
    "-apple-system",
    "BlinkMacSystemFont",
    "system-ui",
    "sans-serif",
  ],
  src: [
    {
      path: "./fonts/anthropic-serif-text-regular.otf",
      weight: "400",
    },
    {
      path: "./fonts/anthropic-serif-text-medium.otf",
      weight: "500",
    },
    {
      path: "./fonts/anthropic-serif-text-semibold.otf",
      weight: "600",
    },
  ],
  variable: "--font-anthropic-serif-text",
});

const notoSerifEthiopic = localFont({
  adjustFontFallback: false,
  display: "swap",
  fallback: ["serif"],
  src: "./fonts/noto-serif-ethiopic-regular.ttf",
  variable: "--font-noto-serif-ethiopic",
  weight: "400",
});

export const metadata: Metadata = {
  description: "No coding, thoughts only. A quiet entrance to Corepedia.",
  title: {
    default: "No coding, thoughts only",
    template: "%s | Corepedia",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${anthropicSerifDisplay.variable} ${anthropicSerifText.variable} ${notoSerifEthiopic.variable} ${GeistMono.variable}`}
      lang="zh-CN"
    >
      <body>
        <a className="skip-link" href="#main-content">
          跳到主要内容
        </a>
        {children}
      </body>
    </html>
  );
}
