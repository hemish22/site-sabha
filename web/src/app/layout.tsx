import type { Metadata, Viewport } from "next";
import { Archivo, Noto_Sans_Bengali, Noto_Sans_Devanagari, Noto_Sans_Oriya, Noto_Sans_Tamil } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
// Worker-language scripts. Not preloaded: each page only needs one of them.
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-indic-deva", preload: false });
const beng = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-indic-beng", preload: false });
const orya = Noto_Sans_Oriya({ subsets: ["oriya"], variable: "--font-indic-orya", preload: false });
const taml = Noto_Sans_Tamil({ subsets: ["tamil"], variable: "--font-indic-taml", preload: false });

export const metadata: Metadata = {
  title: "Site Sabha",
  description: "One safety briefing, every worker's language, with proof that each worker understood it.",
};

export const viewport: Viewport = { themeColor: "#1f5aa6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${deva.variable} ${beng.variable} ${orya.variable} ${taml.variable}`}>
      <body className="min-h-dvh">
        <Header />
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
