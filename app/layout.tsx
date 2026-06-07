import type { Metadata } from "next";
import "./globals.css";
import { UserProvider } from "@/context/user-context";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import Script from "next/script";

export const metadata: Metadata = {
  title: "GoldenTask",
  description: "Earn USDT by watching videos, mining, and completing tasks",
  other: {
    monetag: "470bb6acab29156dabd06073732b1511",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
           src="https://sad.adsgram.ai/js/sad.min.js"
  strategy="afterInteractive"
/>
          strategy="beforeInteractive"
        />
        
        <ServiceWorkerRegistrar />
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
