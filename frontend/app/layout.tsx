import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import KeepAlive from "./components/KeepAlive";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "EarthWatch 🌍",
  description: "Real-Time Climate Anomaly Detection & Environmental Intelligence",
  manifest: "/manifest.json",
  themeColor: "#4ade80",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EarthWatch",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <KeepAlive />
        {children}
      </body>
    </html>
  );
}