import "./globals.css";
import React from "react";

export const metadata = {
  title: "Multi-Camera CCTV Violence Monitor",
  description: "Real-time edge violence detection using MoViNet-A0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#070a13] text-slate-100 antialiased selection:bg-red-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
