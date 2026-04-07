import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Sidebar } from '@/components/ui/sidebar';
import { Header } from '@/components/ui/header';
import { NavBadgeProvider } from '@/components/dashboard/NavBadgeProvider';
import { ErrorBoundary } from '@/components/global/ErrorBoundary';
import { ToastProvider } from '@/components/global/ToastProvider';
import { AskCapitalForge } from '@/components/ai-chat/AskCapitalForge';

// ─── Metadata ────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    template: '%s | CapitalForge',
    default:  'CapitalForge — Corporate Funding Operating System',
  },
  description:
    'The institutional-grade operating system for corporate credit, funding stacks, and compliance.',
  applicationName: 'CapitalForge',
  robots: { index: false, follow: false }, // internal tool — no public indexing
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0A1628',
};

// ─── Root layout ─────────────────────────────────────────────────────────────

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect for Inter font — replace with self-hosted or next/font in production */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>

      <body>
        {/*
          Shell structure:
          ┌──────────┬────────────────────────────────────┐
          │          │  Header (fixed 56px)                │
          │          ├────────────────────────────────────┤
          │ Sidebar  │  Main content (scrollable)          │
          │          │                                     │
          └──────────┴────────────────────────────────────┘
        */}
        <ToastProvider>
          <NavBadgeProvider>
            <div className="cf-layout">
              {/* Left sidebar — navigation */}
              <Sidebar />

              {/* Right panel — header + page content */}
              <div className="cf-main min-w-0">
                {/* Sticky top header */}
                <Header />

                {/* Page content */}
                <main
                  id="main-content"
                  className="cf-content"
                  aria-label="Main content"
                >
                  <ErrorBoundary>
                    <div className="max-w-screen-2xl mx-auto w-full animate-fade-in">
                      {children}
                    </div>
                  </ErrorBoundary>
                </main>
              </div>
            </div>
          </NavBadgeProvider>
          <AskCapitalForge />
        </ToastProvider>
      </body>
    </html>
  );
}
