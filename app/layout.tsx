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
  const imageUrl = `${protocol}://${host}/og-bee.png`;

  return {
    title: "Bee-lab | 폐기물처리기사 기출문제 풀이",
    description:
      "Bee-lab에서 폐기물처리기사 필기 기출문제를 풀고, 해설과 오답 노트로 복습하세요",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Bee-lab · 폐기물처리기사 기출",
      description: "기출문제를 풀고 회차별 벌집을 채워보세요",
      images: [{ url: imageUrl, width: 2400, height: 1260, alt: "Bee-lab 폐기물처리기사" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Bee-lab · 폐기물처리기사 기출",
      description: "기출문제를 풀고 회차별 벌집을 채워보세요",
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
