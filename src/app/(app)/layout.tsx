/**
 * (app)/layout.tsx
 *
 * This layout wraps every authenticated page with the AppLayout
 * (Sidebar + TopNavbar + Footer). Place this file at:
 *
 *   src/app/(app)/layout.tsx
 *
 * And move all authenticated pages under the (app) route group:
 *   src/app/(app)/dashboard/page.tsx
 *   src/app/(app)/attendance/page.tsx
 *   src/app/(app)/employees/page.tsx
 *   ... etc.
 *
 * The login page stays OUTSIDE (app) so it doesn't get the sidebar:
 *   src/app/login/page.tsx  ← stays here, no AppLayout
 */

import AppLayout from '@/components/layout/AppLayout';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
