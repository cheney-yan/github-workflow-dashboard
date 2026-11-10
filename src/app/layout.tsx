import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/contexts/theme-context";
import { DisplaySettingsProvider } from "@/contexts/display-settings-context";
import { AuthProvider } from "@/contexts/auth-context";
import { AuthGate } from "@/components/auth-gate";
import { InsecureContextBanner } from "@/components/insecure-context-banner";

export const metadata: Metadata = {
  title: "GitHub Workflow Dashboard",
  description: "Monitor GitHub Actions workflows across your repositories",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" style={{ fontFamily: 'system-ui, sans-serif' }}>
        <InsecureContextBanner />
        <ThemeProvider>
          <DisplaySettingsProvider>
            <AuthProvider>
              <AuthGate>{children}</AuthGate>
            </AuthProvider>
          </DisplaySettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
