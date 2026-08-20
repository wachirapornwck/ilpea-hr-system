'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import TopNavbar from './TopNavbar';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Right Column: TopNav + Content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopNavbar onMobileMenuOpen={() => setMobileOpen(true)} />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-[1400px] mx-auto">{children}</div>
        </main>

        {/* Footer (optional) */}
        <footer className="shrink-0 px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>ILPEA HR System · Thailand</span>
            <span>v1.0.0 · © 2026 ILPEA Industries</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
