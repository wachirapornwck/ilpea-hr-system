'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  Clock,
  ClipboardList,
  MapPin,
  Timer,
  ToggleLeft,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  Wallet,
  DollarSign,
  TrendingUp,
  FileText,
  BarChart3,
  Bell,
  Settings,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ILPEA_LOGO =
  'data:image/png;base64,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';

interface NavItem {
  label: string;
  href?: string;
  icon: React.ElementType;
  children?: NavItem[];
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Employee',
    icon: Users,
    children: [
      { label: 'Employee List', href: '/employees', icon: Users },
      { label: 'Departments', href: '/departments', icon: Building2 },
      { label: 'Positions', href: '/positions', icon: Briefcase },
    ],
  },
  {
    label: 'Attendance',
    icon: Clock,
    children: [
      { label: 'Daily Attendance', href: '/attendance', icon: ClipboardList },
      {
        label: 'Attendance Adjustment',
        href: '/attendance/adjustment',
        icon: ClipboardList,
      },
      { label: 'GPS Logs', href: '/attendance/gps', icon: MapPin },
      {
        label: 'Fingerprint Import',
        href: '/attendance/raw-import',
        icon: FileText,
      },
    ],
  },
  {
    label: 'Shift Management',
    icon: Timer,
    children: [
      { label: 'Shift Management', href: '/shifts', icon: Timer },
      { label: 'Shift Override', href: '/shifts/override', icon: ToggleLeft },
    ],
  },
  {
    label: 'Leave & Holiday',
    icon: CalendarDays,
    children: [
      { label: 'Leave Requests', href: '/leave', icon: CalendarDays },
      { label: 'Holiday Calendar', href: '/holidays', icon: CalendarRange },
      {
        label: 'Leave Balance Management',
        href: '/leave-balances',
        icon: Wallet,
      },
    ],
  },
  { label: 'Events', href: '/events', icon: CalendarClock },
  {
    label: 'Payroll',
    icon: DollarSign,
    children: [
      { label: 'Payroll', href: '/payroll', icon: DollarSign },
      { label: 'Overtime', href: '/payroll/overtime', icon: TrendingUp },
      { label: 'Payslips', href: '/payroll/payslips', icon: FileText },
    ],
  },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
  { label: 'Notifications', href: '/notifications', icon: Bell, badge: 3 },
  { label: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<string[]>([
    'Attendance',
    'Employee',
  ]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    );
  };

  const isActive = (href?: string) => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const isGroupActive = (item: NavItem) => {
    if (item.href) return isActive(item.href);
    return item.children?.some((child) => isActive(child.href)) ?? false;
  };

  const NavLink = ({ item, depth = 0 }: { item: NavItem; depth?: number }) => {
    const hasChildren = item.children && item.children.length > 0;
    const active = isActive(item.href);
    const groupActive = isGroupActive(item);
    const isOpen = openGroups.includes(item.label);
    const Icon = item.icon;

    if (hasChildren) {
      return (
        <div>
          <button
            onClick={() => toggleGroup(item.label)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              'hover:bg-slate-100 dark:hover:bg-slate-800',
              groupActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? item.label : undefined}
          >
            <Icon
              size={18}
              className={cn(
                'shrink-0',
                groupActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            />
            {!collapsed && (
              <>
                <span className="flex-1 text-left truncate">{item.label}</span>
                {item.badge && (
                  <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                    {item.badge}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  className={cn(
                    'shrink-0 transition-transform duration-200 text-slate-400',
                    isOpen && 'rotate-180'
                  )}
                />
              </>
            )}
          </button>
          {!collapsed && isOpen && (
            <div className="mt-0.5 ml-4 pl-3 border-l border-slate-200 dark:border-slate-700 space-y-0.5">
              {item.children!.map((child) => (
                <NavLink key={child.label} item={child} depth={1} />
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        href={item.href!}
        onClick={onMobileClose}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
          depth === 0 ? '' : 'py-2',
          active
            ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100',
          collapsed && depth === 0 && 'justify-center px-2'
        )}
        title={collapsed ? item.label : undefined}
      >
        <Icon
          size={depth === 0 ? 18 : 15}
          className={cn(
            'shrink-0',
            active
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 dark:text-slate-400'
          )}
        />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && (
              <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                {item.badge}
              </span>
            )}
            {active && depth === 0 && (
              <ChevronRight size={14} className="text-blue-400 shrink-0" />
            )}
          </>
        )}
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* LOGO */}
      <div
        className={cn(
          'flex items-center px-4 py-4 border-b border-slate-200 dark:border-slate-800',
          collapsed && 'justify-center px-2'
        )}
      >
        <img
          src={ILPEA_LOGO}
          alt="ILPEA Thailand"
          className={cn(
            'object-contain shrink-0',
            collapsed ? 'w-8 h-8' : 'h-10 w-auto max-w-[140px]'
          )}
        />
      </div>

      {/* NAV */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-thin">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.label} item={item} />
        ))}
      </nav>

      {/* COLLAPSE */}
      <div className="p-2 border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={onToggle}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-slate-500 dark:text-slate-400',
            'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-all duration-150',
            collapsed && 'justify-center px-2'
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <>
              <PanelLeftClose size={16} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800',
          'transform transition-transform duration-300 ease-in-out lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>
      <aside
        className={cn(
          'hidden lg:flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800',
          'transition-all duration-300 ease-in-out shrink-0',
          collapsed ? 'w-[60px]' : 'w-56'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
