import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  ChevronLeft,
  Search,
  Bell,
  User,
  HelpCircle,
  Command,
  X,
  Menu,
  LogOut,
  type LucideProps,
} from 'lucide-react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { LocationBanner } from '@/features/carbon/components/LocationBanner';
import { Logo } from '@/components/ui/Logo';
import { useZone } from '@/app/ZoneProvider';
import { AUTH_STORAGE_KEY } from '@/components/auth/AuthGuard';

interface NavItemDef {
  label: string;
  href: string;
  icon: ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>;
  color: string;
}

// ─── Nav Structure matching inspiration image ──────────────────────────────
const NAV_SECTIONS: { label: string; items: NavItemDef[] }[] = [
  {
    label: 'MONITOR',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'text-emerald-400' },
      { label: 'Carbon Analytics', href: '/carbon', icon: Activity, color: 'text-emerald-400' },
      { label: 'Forecast', href: '/forecast', icon: TrendingUp, color: 'text-emerald-400' },
    ],
  },
  {
    label: 'WORKLOADS',
    items: [
      { label: 'Activities', href: '/activities', icon: Zap, color: 'text-amber-400' },
      { label: 'Green Windows', href: '/windows', icon: Wind, color: 'text-teal-400' },
      { label: 'Scheduler', href: '/scheduler', icon: CalendarClock, color: 'text-blue-400' },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { label: 'Optimization', href: '/optimization', icon: Brain, color: 'text-purple-400' },
      { label: 'Sustainability', href: '/sustainability', icon: Leaf, color: 'text-emerald-400' },
    ],
  },
];

const BOTTOM_NAV: NavItemDef[] = [
  { label: 'Profile', href: '/settings', icon: User, color: 'text-slate-400' },
  { label: 'Settings', href: '/settings', icon: Settings, color: 'text-slate-400' },
];

const ALL_NAV_ITEMS: NavItemDef[] = [
  ...NAV_SECTIONS.flatMap((s) => s.items),
  ...BOTTOM_NAV,
];

// ─── Notifications Data ──────────────────────────────────────────────────────
interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  type: 'green' | 'amber' | 'purple';
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    title: 'Optimal Green Window Active',
    message: 'Grid carbon intensity in IN-SO dropped to 142 gCO₂/kWh. Ideal for batch jobs.',
    time: '5m ago',
    unread: true,
    type: 'green',
  },
  {
    id: '2',
    title: 'AI Recommendation Ready',
    message: 'Delay training job by 2 hours to achieve 42% carbon emission reduction.',
    time: '25m ago',
    unread: true,
    type: 'purple',
  },
  {
    id: '3',
    title: 'Weekly Carbon Summary',
    message: 'You saved 4.82 kg CO₂ this week across 14 scheduled workloads.',
    time: '2h ago',
    unread: false,
    type: 'green',
  },
];

// ─── Nav Item Component ──────────────────────────────────────────────────────
function NavItem({
  href,
  icon: Icon,
  label,
  collapsed,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  color?: string;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={({ isActive }) => `
        group relative flex items-center gap-3.5
        ${collapsed ? 'justify-center px-2 py-3 mx-auto w-11 h-11' : 'px-4 py-3'}
        rounded-2xl text-[13px] font-medium
        transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40
        ${
          isActive
            ? 'active bg-[#064e3b]/80 text-emerald-400 border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.25)] font-semibold'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
        }
      `}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={19}
            className={`flex-shrink-0 transition-colors ${
              isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'
            }`}
          />
          {!collapsed && <span className="flex-1 truncate leading-none">{label}</span>}
          {!collapsed && isActive && (
            <ChevronRight size={14} className="text-emerald-400 opacity-80 flex-shrink-0" />
          )}
        </>
      )}
    </NavLink>
  );
}

// ─── AppLayout Component ──────────────────────────────────────────────────────
export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedZone } = useZone();

  // Collapsible Sidebar State
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('ecotime_sidebar_collapsed') === 'true';
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('ecotime_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Interactive UI States
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => n.unread).length;

  // Keyboard Shortcuts (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setNotificationsOpen(false);
        setProfileOpen(false);
        setHelpOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close popovers on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter search results
  const filteredNavItems = ALL_NAV_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  // Formatted date string (matches inspiration screenshot)
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="flex h-screen bg-[#070c13] text-slate-100 overflow-hidden font-sans">
      
      {/* ── Desktop Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col bg-[#080e1a] border-r border-white/[0.06] relative z-20 transition-all duration-300 ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        {/* Logo Header */}
        <div className={`py-5 flex items-center border-b border-white/[0.06] ${collapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
          <Logo size="md" to="/dashboard" collapsed={collapsed} showSubtitle={!collapsed} />
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors focus-visible:outline-none"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label="Toggle Sidebar"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Scrollable Nav Sections */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto space-y-6 custom-scrollbar">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="space-y-1.5">
              {!collapsed ? (
                <p className="px-3 text-[10px] font-extrabold text-slate-500 tracking-wider uppercase mb-2">
                  {section.label}
                </p>
              ) : (
                <div className="h-px bg-white/[0.05] my-3" />
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavItem key={item.href} {...item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Nav: Profile, Settings, Help & Motivational Card */}
        <div className="px-4 py-4 border-t border-white/[0.06] space-y-1 flex-shrink-0 bg-[#070d18]">
          {BOTTOM_NAV.map((item) => (
            <NavItem key={item.href} {...item} collapsed={collapsed} />
          ))}

          {/* Help & Feedback Button */}
          <button
            onClick={() => setHelpOpen(true)}
            title={collapsed ? 'Help & Feedback' : undefined}
            className={`
              w-full group flex items-center gap-3.5
              ${collapsed ? 'justify-center px-2 py-3 mx-auto w-11 h-11' : 'px-4 py-3'}
              rounded-2xl text-[13px] font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]
              transition-all duration-150 focus-visible:outline-none
            `}
          >
            <HelpCircle size={19} className="text-slate-400 group-hover:text-slate-200 flex-shrink-0" />
            {!collapsed && <span className="flex-1 truncate text-left">Help & Feedback</span>}
          </button>

          {/* Motivational Card at Bottom (Expanded Sidebar) */}
          {!collapsed && (
            <div className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-emerald-950/70 via-[#071610] to-[#0a1e16] border border-emerald-500/25 relative overflow-hidden group shadow-lg">
              <div className="absolute top-0 right-0 -mt-2 -mr-2 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all duration-300" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-5 h-5 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-sm">
                    <Leaf size={12} />
                  </div>
                  <h5 className="text-[12px] font-bold text-emerald-300 leading-none">Small steps</h5>
                </div>
                <p className="text-[13px] font-black text-white mb-1 leading-tight">Big impact 🌱</p>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Schedule smart.<br />Emit less.
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main Content Area ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-[#070c13]">
        
        {/* Top Header Bar */}
        <header className="flex-shrink-0 h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-white/[0.06] bg-[#080e1a]/95 backdrop-blur-md z-30 gap-4 relative">
          
          {/* Mobile Drawer Hamburger Button */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.08]"
              aria-label="Open Navigation Menu"
            >
              <Menu size={20} />
            </button>
            <Logo size="sm" to="/dashboard" showSubtitle={false} />
          </div>

          {/* Search Trigger Bar (Desktop & Tablet) */}
          <div className="hidden md:flex items-center gap-3 flex-1 max-w-md">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center justify-between h-10 px-4 rounded-xl bg-[#0d1525] border border-white/[0.08] text-slate-400 hover:text-slate-200 hover:border-white/[0.15] transition-all text-xs focus-visible:outline-none shadow-inner"
            >
              <div className="flex items-center gap-2.5 truncate">
                <Search size={15} className="text-slate-400 flex-shrink-0" />
                <span className="truncate">Search anything...</span>
              </div>
              <kbd className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-white/[0.06] border border-white/[0.08] rounded-md">
                <Command size={10} /> K
              </kbd>
            </button>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
            
            {/* Live Telemetry Date/Location */}
            <div className="hidden lg:flex items-center gap-3 text-xs text-slate-400 border-r border-white/[0.06] pr-4">
              <span className="font-semibold text-slate-200">{todayFormatted}</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">Karnataka, India ({selectedZone})</span>
            </div>

            {/* Live Monitoring Badge */}
            <div className="hidden sm:flex items-center gap-2 h-9 px-3.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span>Live Monitoring</span>
              <span className="text-slate-400 font-medium">| Grid: {selectedZone}</span>
            </div>

            {/* Notifications Bell Button */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="relative p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.08] transition-all focus-visible:outline-none"
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 border border-[#080e1a]" />
                  </span>
                )}
              </button>

              {/* Notifications Popover */}
              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl bg-[#0c1322] border border-white/[0.12] shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06] bg-white/[0.02]">
                      <div className="flex items-center gap-2">
                        <Bell size={16} className="text-emerald-400" />
                        <h4 className="text-xs font-bold text-white">Notifications</h4>
                        {unreadCount > 0 && (
                          <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30">
                            {unreadCount} new
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllNotificationsRead}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.04]">
                      {notifications.map((item) => (
                        <div
                          key={item.id}
                          className={`p-4 text-xs transition-colors hover:bg-white/[0.03] ${
                            item.unread ? 'bg-emerald-500/[0.04]' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="font-bold text-slate-200">{item.title}</span>
                            <span className="text-[10px] text-slate-500 flex-shrink-0">{item.time}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">{item.message}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile Dropdown Chip */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((prev) => !prev)}
                className="flex items-center gap-2.5 p-1 sm:pr-3 rounded-xl hover:bg-white/[0.06] border border-white/[0.08] transition-all focus-visible:outline-none cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center font-black text-xs text-slate-950 shadow-md">
                  S
                </div>
                <div className="hidden sm:flex flex-col text-left leading-tight">
                  <span className="text-xs font-bold text-slate-200">Sakshi H.C</span>
                  <span className="text-[10px] text-slate-400">Student</span>
                </div>
              </button>

              {/* Profile Popover */}
              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-3 w-60 rounded-2xl bg-[#0c1322] border border-white/[0.12] shadow-2xl z-50 overflow-hidden p-2 space-y-1"
                  >
                    <div className="px-3.5 py-3 border-b border-white/[0.06] mb-1">
                      <p className="text-xs font-bold text-white">Sakshi H.C</p>
                      <p className="text-[10px] text-slate-400">sakshi@ecotime.dev</p>
                    </div>
                    <button
                      onClick={() => {
                        navigate('/settings');
                        setProfileOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                    >
                      <User size={15} className="text-slate-400" />
                      <span>Account Profile</span>
                    </button>
                    <button
                      onClick={() => {
                        navigate('/settings');
                        setProfileOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                    >
                      <Settings size={15} className="text-slate-400" />
                      <span>Platform Settings</span>
                    </button>
                    <button
                      onClick={() => {
                        setHelpOpen(true);
                        setProfileOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                    >
                      <HelpCircle size={15} className="text-slate-400" />
                      <span>Help & Feedback</span>
                    </button>
                    <div className="border-t border-white/[0.06] my-1" />
                    <button
                      onClick={() => {
                        localStorage.removeItem(AUTH_STORAGE_KEY);
                        setProfileOpen(false);
                        navigate('/login');
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <LogOut size={15} className="text-rose-400" />
                      <span>Sign Out</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </header>

        <LocationBanner />

        {/* Page Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="min-h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ── Mobile Navigation Drawer (Responsive view matching Stitch spec) ── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2 }}
              className="w-72 bg-[#080e1a] border-r border-white/[0.08] h-full flex flex-col p-5 overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-4">
                <Logo size="md" to="/dashboard" />
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <nav className="space-y-4 flex-1">
                {NAV_SECTIONS.map((section) => (
                  <div key={section.label} className="space-y-1">
                    <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      {section.label}
                    </p>
                    {section.items.map((item) => (
                      <NavItem
                        key={item.href}
                        {...item}
                        onClick={() => setMobileMenuOpen(false)}
                      />
                    ))}
                  </div>
                ))}
              </nav>

              <div className="border-t border-white/[0.06] pt-4 space-y-1">
                {BOTTOM_NAV.map((item) => (
                  <NavItem
                    key={item.href}
                    {...item}
                    onClick={() => setMobileMenuOpen(false)}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Command Palette Search Modal (⌘K) ─────────────────────────────────── */}
      <AnimatePresence>
        {searchOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/65 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="w-full max-w-lg rounded-2xl bg-[#0c1322] border border-white/[0.12] shadow-2xl overflow-hidden"
            >
              <div className="flex items-center px-4 border-b border-white/[0.08]">
                <Search size={17} className="text-slate-400 mr-3 flex-shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search pages, telemetry, features..."
                  className="w-full py-4 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="p-1 rounded-lg text-slate-500 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto p-2 space-y-1">
                {filteredNavItems.map((item) => (
                  <button
                    key={item.href}
                    onClick={() => {
                      navigate(item.href);
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon size={17} className="text-slate-400 group-hover:text-emerald-400 transition-colors" />
                      <span className="font-semibold">{item.label}</span>
                    </div>
                    <ChevronRight size={14} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
                  </button>
                ))}

                {filteredNavItems.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-6">No matching pages found</p>
                )}
              </div>

              <div className="px-4 py-2.5 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-500">
                <span>Navigate pages instantly</span>
                <kbd className="px-2 py-0.5 text-[10px] bg-white/[0.06] rounded border border-white/[0.08]">ESC to close</kbd>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Help & Feedback Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {helpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl bg-[#0c1322] border border-white/[0.12] shadow-2xl p-6 overflow-hidden relative"
            >
              <button
                onClick={() => setHelpOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md">
                  <HelpCircle size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">EcoTime Support & Help</h3>
                  <p className="text-xs text-slate-400">Carbon-Aware Scheduling Platform v2.0</p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-slate-300 mb-6">
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="font-bold text-emerald-400 mb-1">🌱 What is a Green Window?</p>
                  <p className="text-slate-400 leading-relaxed">
                    A period when the regional electricity grid runs primarily on renewable energy, minimizing emissions.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="font-bold text-emerald-400 mb-1">⚡ How to schedule workloads?</p>
                  <p className="text-slate-400 leading-relaxed">
                    Use the <strong>Activities</strong> or <strong>Scheduler</strong> page to queue tasks automatically during low-carbon windows.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setHelpOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
