import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import Providers from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const host =
    incomingHeaders.get("x-forwarded-host") ??
    incomingHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    incomingHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "폐기물처리기사 | 기출문제 풀이",
    description:
      "폐기물처리기사 기출문제를 풀고, 핵심 해설과 오답노트로 복습하는 학습 웹앱",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "폐기물처리기사",
      description: "기출문제, 풀고 이해하다",
      images: [{ url: imageUrl, width: 1733, height: 877, alt: "폐기물처리기사" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "폐기물처리기사",
      description: "기출문제, 풀고 이해하다",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
