// ============================================================
// /portal — Client Portal layout
// Standalone shell WITHOUT the main advisor sidebar/header.
// Dark theme: navy #0A1628, gold #C9A84C
// ============================================================

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Client Portal | CapitalForge',
  description: 'CapitalForge Client Portal — view your funding status, payments, and documents.',
};

interface PortalLayoutProps {
  children: React.ReactNode;
}

export default function PortalLayout({ children }: PortalLayoutProps) {
  return (
    <div
      className="min-h-screen bg-[#0A1628] text-gray-100"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {children}
    </div>
  );
}
