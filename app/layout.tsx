import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Corepedia",
  description: "A statically published view of the Corepedia LLM wiki.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
