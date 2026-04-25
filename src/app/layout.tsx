import type { Metadata } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";
import SketchDefs from "@/components/SketchDefs";
import PresencePing from "@/components/PresencePing";
import { ToastProvider } from "@/components/Toast";
import { AudioMuteProvider } from "@/components/AudioMute";
import MascotProvider from "@/components/MascotProvider";
import "./globals.css";

const pixelFont = Press_Start_2P({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const bodyFont = VT323({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Beat Battle",
  description: "Produce. Battle. Win.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${pixelFont.variable} ${bodyFont.variable}`}>
      <body>
        <SketchDefs />
        <PresencePing />
        <AudioMuteProvider>
          <MascotProvider>
            <ToastProvider>{children}</ToastProvider>
          </MascotProvider>
        </AudioMuteProvider>
      </body>
    </html>
  );
}
