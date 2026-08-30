import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nametag Chat",
  description: "Realtime chat using unique nametags.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
