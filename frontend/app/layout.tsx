import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Polaris Debugger",
  description: "UI for inspecting the dummy postgres/redis/wiremock/localstack stack",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full min-h-screen bg-slate-950 text-slate-200">
        <Sidebar />
        <div className="relative min-w-0 flex-1 overflow-y-auto">
          <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(99,102,241,0.12),transparent)]" />
          <main className="relative mx-auto max-w-6xl px-8 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
