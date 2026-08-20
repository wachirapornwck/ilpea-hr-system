'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Search,
  Bell,
  LogOut,
  User,
  ChevronRight,
  Menu,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/context';

// Maps pathnames to breadcrumb labels
const BREADCRUMB_MAP: Record<string, string[]> = {
  '/dashboard': ['Dashboard'],
  '/employees': ['Employee', 'Employee List'],
  '/departments': ['Employee', 'Departments'],
  '/positions': ['Employee', 'Positions'],
  '/attendance': ['Attendance', 'Daily Attendance'],
  '/attendance/adjustment': ['Attendance', 'Attendance Adjustment'],
  '/attendance/gps': ['Attendance', 'GPS Logs'],
  '/shifts': ['Shift Management', 'Shift Management'],
  '/shifts/override': ['Shift Management', 'Shift Override'],
  '/leave': ['Leave & Holiday', 'Leave Requests'],
  '/holidays': ['Leave & Holiday', 'Holiday Calendar'],
  '/leave-balances': ['Leave & Holiday', 'Leave Balance Management'],
  '/payroll': ['Payroll', 'Payroll'],
  '/payroll/overtime': ['Payroll', 'Overtime'],
  '/payroll/payslips': ['Payroll', 'Payslips'],
  '/reports': ['Reports'],
  '/notifications': ['Notifications'],
  '/settings': ['Settings'],
};

const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    msg: 'Somchai Wongsakul arrived 23 min late today',
    time: '8m ago',
    unread: true,
  },
  {
    id: 2,
    msg: 'Preecha Tanakul: absent — no check-in recorded',
    time: '1h ago',
    unread: true,
  },
  {
    id: 3,
    msg: 'Wichai Prasoet reached 3 warning letters',
    time: '2h ago',
    unread: true,
  },
  {
    id: 4,
    msg: 'Leave request approved: Siriporn Kamon',
    time: 'Yesterday',
    unread: false,
  },
];
type SearchResultItem = {
  id: string;
  name: string;
  positionName: string;
  departmentName: string;
};

interface TopNavbarProps {
  onMobileMenuOpen: () => void;
}

export default function TopNavbar({ onMobileMenuOpen }: TopNavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const breadcrumbs = BREADCRUMB_MAP[pathname] ?? ['Dashboard'];
  const pageTitle = breadcrumbs[breadcrumbs.length - 1];
  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => n.unread).length;

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() ||
      'HR'
    : 'HR';
  const fullName = user
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.employeeId
    : 'Guest';

  const handleSignOut = async () => {
    setProfileOpen(false);
    await signOut();
    router.replace('/login');
  };

  const handleGoToProfile = () => {
    setProfileOpen(false);
    if (user?.id) router.push(`/employees/${user.id}`);
  };

  const handleGoToSettings = () => {
    setProfileOpen(false);
    router.push('/settings');
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced live employee search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || !user?.id) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/employees?requesterId=${user.id}&search=${encodeURIComponent(
            q
          )}`
        );
        const json = await res.json();
        if (json.success) {
          setSearchResults(
            json.data.items.map((e: any) => ({
              id: e.id,
              name: `${e.firstNameTH} ${e.lastNameTH}`.trim() || e.employeeId,
              positionName: e.positionName,
              departmentName: e.departmentName,
            }))
          );
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, user?.id]);

  const handleSelectSearchResult = (id: string) => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);
    router.push(`/employees/${id}`);
  };

  return (
    <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 gap-3 sticky top-0 z-30 shrink-0">
      {/* Mobile menu button */}
      <button
        onClick={onMobileMenuOpen}
        className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      {/* Page Title + Breadcrumbs */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {pageTitle}
          </h1>
          {breadcrumbs.length > 1 && (
            <div className="hidden sm:flex items-center gap-1 mt-0.5">
              <span className="text-[11px] text-slate-400">ILPEA HR</span>
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight
                    size={10}
                    className="text-slate-300 dark:text-slate-600"
                  />
                  <span
                    className={cn(
                      'text-[11px]',
                      i === breadcrumbs.length - 1
                        ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-slate-400'
                    )}
                  >
                    {crumb}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div ref={searchRef} className="relative hidden md:block">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-150',
            searchFocused
              ? 'border-blue-400 bg-white dark:bg-slate-900 w-64 shadow-sm shadow-blue-100 dark:shadow-blue-900/20'
              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 w-48'
          )}
        >
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            placeholder="Search employees, records..."
            className="bg-transparent text-sm text-slate-700 dark:text-slate-300 placeholder:text-slate-400 outline-none w-full"
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {searchFocused && searchQuery.trim() && (
          <div className="absolute right-0 top-11 w-80 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/60 dark:shadow-slate-900/60 overflow-hidden z-50">
            {searchLoading ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">
                กำลังค้นหา...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">
                ไม่พบพนักงานที่ตรงกับ &quot;{searchQuery}&quot;
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectSearchResult(r.id)}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0"
                  >
                    <p className="text-xs font-medium text-slate-900 dark:text-white">
                      {r.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {r.positionName} · {r.departmentName}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1">
        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
            aria-label="Notifications"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-11 w-80 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/60 dark:shadow-slate-900/60 overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  Notifications
                </span>
                <span className="text-xs bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
                  {unreadCount} new
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {MOCK_NOTIFICATIONS.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'px-4 py-3 border-b border-slate-50 dark:border-slate-800 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
                      n.unread && 'bg-blue-50/50 dark:bg-blue-950/20'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {n.unread && (
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 shrink-0" />
                      )}
                      <div className={cn(!n.unread && 'pl-3.5')}>
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          {n.msg}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {n.time}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800">
                <button className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div ref={profileRef} className="relative ml-1">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                {initials}
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                {fullName}
              </div>
              <div className="text-[10px] text-slate-400 leading-tight">
                {user?.role ?? ''}
              </div>
            </div>
            <ChevronDown size={12} className="text-slate-400 hidden sm:block" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-11 w-52 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/60 dark:shadow-slate-900/60 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  {fullName}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {user?.employeeId ?? ''}
                </div>
              </div>
              <div className="py-1">
                <button
                  onClick={handleGoToProfile}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <User size={14} /> My Profile
                </button>
                <button
                  onClick={handleGoToSettings}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Settings size={14} /> Settings
                </button>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 py-1">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
