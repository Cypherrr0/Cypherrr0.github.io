import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./redesign.css";

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
      className={`${GeistSans.variable} ${GeistMono.variable}`}
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
