import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReWed — Every Guest. Every Moment. Every Message.",
  description:
    "Your guests record heartfelt video toasts, take stunning photos with artistic filters, and create fun portraits. Days later, everyone receives a personalized video reel of their memories from your wedding.",
  openGraph: {
    title: "ReWed — The moments between moments.",
    description:
      "Every guest becomes part of the story. Video messages, photo booth, AI portraits, and personalized keepsake reels.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#FEFCF9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {children}
      </body>
    </html>
  );
}
