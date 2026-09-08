import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Activity,
  Wind,
  TrendingUp,
  Zap,
  Brain,
  CalendarClock,
  Leaf,
  Settings,
  ChevronRight,
  Gauge,
  Home,
  type LucideProps,
} from 'lucide-react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { LocationBanner } from '@/features/carbon/components/LocationBanner';
import { Logo } from '@/components/ui/Logo';

interface NavItemDef {
  label: string;
  href: string;
  icon: ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>;
  color: string;
}

// ─── Nav structure with section grouping ─────────────────────────────────────
const NAV_SECTIONS: { label: string; items: NavItemDef[] }[] = [
  {
    label: 'Monitor',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'text-green-400' },
      { label: 'Carbon Analytics', href: '/carbon', icon: Activity, color: 'text-blue-400' },
      { label: 'Forecast', href: '/forecast', icon: TrendingUp, color: 'text-purple-400' },
    ],
  },
  {
    label: 'Workloads',
    items: [
      { label: 'Activities', href: '/activities', icon: Zap, color: 'text-amber-400' },
      { label: 'Green Windows', href: '/windows', icon: Wind, color: 'text-teal-400' },
      { label: 'Scheduler', href: '/scheduler', icon: CalendarClock, color: 'text-blue-400' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'Optimization', href: '/optimization', icon: Brain, color: 'text-purple-400' },
      { label: 'Sustainability', href: '/sustainability', icon: Leaf, color: 'text-green-400' },
    ],
  },
];

const BOTTOM_NAV: NavItemDef[] = [
  { label: 'Settings', href: '/settings', icon: Settings, color: 'text-slate-400' },
];

// All items flat list for breadcrumb lookup
const ALL_NAV_ITEMS: NavItemDef[] = [
  ...NAV_SECTIONS.flatMap((s) => s.items),
  ...BOTTOM_NAV,
];

// ─── Page transition ──────────────────────────────────────────────────────────
const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12, ease: 'easeIn' as const } },
};

// ─── Nav Link Item ────────────────────────────────────────────────────────────
function NavItem({
  href,
  icon: Icon,
  label,
  color,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  color: string;
}) {
  return (
    <NavLink
      to={href}
      className={({ isActive }) => `
        nav-link-accent group relative flex items-center gap-2.5
        px-3.5 py-2.5 rounded-2xl text-[13px] font-medium
        transition-all duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20
        ${isActive
          ? 'active bg-white/[0.06] text-white border border-white/[0.08]'
          : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.035]'
        }
      `}
    >
      {({ isActive }) => (
        <>
          <Icon size={16} className={isActive ? color : 'text-slate-600 group-hover:text-slate-400 transition-colors'} />
          <span className="flex-1 truncate">{label}</span>
          {isActive && <ChevronRight size={12} className={`${color} opacity-50 flex-shrink-0`} />}
        </>
      )}
    </NavLink>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export function AppLayout() {
  const location = useLocation();

  // Derive current page label for breadcrumb
  const currentItem = ALL_NAV_ITEMS.find((item) => item.href === location.pathname);
  const currentLabel = currentItem?.label ?? 'Dashboard';
  const currentColor = currentItem?.color ?? 'text-slate-400';

  return (
    <div className="flex h-screen bg-bg-dark overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="hidden w-[236px] flex-shrink-0 flex-col bg-bg-primary border-r border-white/[0.05] relative z-20 md:flex">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/[0.05]">
          <Logo size="md" to="/dashboard" />
        </div>

        {/* Nav sections */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto space-y-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-3">
              <p className="nav-section-label">{section.label}</p>
              <div className="space-y-1.5">
                {section.items.map((item) => (
                  <NavItem key={item.href} {...item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: Settings + status */}
        <div className="px-3 pb-4 border-t border-white/[0.05] pt-4 space-y-1.5">
          {BOTTOM_NAV.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}

          {/* System status pill */}
          <div className="flex items-center gap-3 px-3.5 py-3 mt-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-300 truncate leading-none mb-0.5">System Online</p>
              <p className="text-[10px] text-slate-600 truncate">Grid monitoring active</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar */}
        <header className="flex-shrink-0 h-16 flex items-center justify-between px-5 sm:px-6 lg:px-8 border-b border-white/[0.05] bg-bg-primary/90 backdrop-blur-md z-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-3 text-[13px] min-w-0">
            <a
              href="/"
              className="flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] border border-white/[0.06] transition-all duration-150 flex-shrink-0"
              aria-label="Go to Landing"
            >
              <Home size={13} />
            </a>
            <div className="topbar-divider" />
            <span className="text-slate-600 hidden sm:block">EcoTime</span>
            <ChevronRight size={12} className="text-slate-700 hidden sm:block flex-shrink-0" />
            <span className={`font-semibold truncate ${currentColor}`}>
              {currentLabel}
            </span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2.5 text-[11px] font-bold h-8 px-3.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-70" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
              </span>
              Live
            </div>
          </div>
        </header>

        <LocationBanner />

        {/* Page content with animation */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="min-h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
