import { useState, useEffect, useRef } from 'react';
import {
  Outlet,
  NavLink,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  motion,
  AnimatePresence,
} from 'framer-motion';

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

import type {
  ForwardRefExoticComponent,
  RefAttributes,
} from 'react';

import { LocationBanner } from '@/features/carbon/components/LocationBanner';
import { Logo } from '@/components/ui/Logo';
import { useZone } from '@/app/ZoneProvider';
import { AUTH_STORAGE_KEY } from '@/components/auth/AuthGuard';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type IconType = ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
>;

interface NavItemDef {
  label: string;
  to: string;
  icon: IconType;
  color: string;
}

interface NotificationItem {
  id: number;
  title: string;
  description: string;
  time: string;
  unread: boolean;
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

const NAV_SECTIONS = [
  {
    label: 'Monitor',
    items: [
      {
        label: 'Dashboard',
        to: '/dashboard',
        icon: LayoutDashboard,
        color: 'text-green-400',
      },
      {
        label: 'Activities',
        to: '/activities',
        icon: Activity,
        color: 'text-blue-400',
      },
      {
        label: 'Carbon Monitor',
        to: '/carbon',
        icon: Wind,
        color: 'text-cyan-400',
      },
    ],
  },
  {
    label: 'Optimize',
    items: [
      {
        label: 'Optimization',
        to: '/optimization',
        icon: TrendingUp,
        color: 'text-purple-400',
      },
      {
        label: 'Energy Insights',
        to: '/energy',
        icon: Zap,
        color: 'text-amber-400',
      },
      {
        label: 'AI Recommendations',
        to: '/recommendations',
        icon: Brain,
        color: 'text-violet-400',
      },
      {
        label: 'Schedule',
        to: '/schedule',
        icon: CalendarClock,
        color: 'text-teal-400',
      },
    ],
  },
  {
    label: 'Sustainability',
    items: [
      {
        label: 'Impact',
        to: '/impact',
        icon: Leaf,
        color: 'text-green-400',
      },
    ],
  },
] satisfies {
  label: string;
  items: NavItemDef[];
}[];

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 1,
    title: 'Green Window available',
    description:
      'A low-carbon window is available for your next activity.',
    time: '2 min ago',
    unread: true,
  },
  {
    id: 2,
    title: 'Carbon intensity decreased',
    description:
      'Grid carbon intensity has dropped by 12% in your selected zone.',
    time: '18 min ago',
    unread: true,
  },
  {
    id: 3,
    title: 'Activity completed',
    description:
      'Your scheduled activity completed successfully.',
    time: '1 hr ago',
    unread: false,
  },
];

/* -------------------------------------------------------------------------- */
/* Nav Item                                                                   */
/* -------------------------------------------------------------------------- */

function NavItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItemDef;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        [
          'group relative flex items-center rounded-xl border transition-all duration-200',
          collapsed
            ? 'mx-auto h-11 w-11 justify-center'
            : 'w-full gap-3 px-3 py-2.5',
          isActive
            ? 'border-white/[0.08] bg-white/[0.06] text-white shadow-sm'
            : 'border-transparent text-slate-400 hover:bg-white/[0.035] hover:text-white',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-green-400"
              aria-hidden="true"
            />
          )}

          <Icon
            size={collapsed ? 19 : 16}
            strokeWidth={isActive ? 2.2 : 1.9}
            className={`flex-shrink-0 transition-colors ${
              isActive ? item.color : 'text-slate-500 group-hover:text-slate-300'
            }`}
          />

          {!collapsed && (
            <>
              <span
                className={`min-w-0 flex-1 truncate text-[13px] font-medium ${
                  isActive ? 'text-white' : ''
                }`}
              >
                {item.label}
              </span>

              <ChevronRight
                size={14}
                className={`flex-shrink-0 transition-all ${
                  isActive
                    ? 'translate-x-0 text-slate-400 opacity-100'
                    : '-translate-x-1 text-slate-600 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'
                }`}
              />
            </>
          )}

          {collapsed && (
            <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-lg border border-white/[0.08] bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-xl group-hover:block">
              {item.label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedZone } = useZone();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return (
      localStorage.getItem('ecotime_sidebar_collapsed') === 'true'
    );
  });

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  const [searchOpen, setSearchOpen] =
    useState(false);

  const [searchQuery, setSearchQuery] =
    useState('');

  const [notificationsOpen, setNotificationsOpen] =
    useState(false);

  const [notifications, setNotifications] =
    useState(INITIAL_NOTIFICATIONS);

  const [profileOpen, setProfileOpen] =
    useState(false);

  const [helpOpen, setHelpOpen] =
    useState(false);

  const searchInputRef =
    useRef<HTMLInputElement>(null);

  const notificationRef =
    useRef<HTMLDivElement>(null);

  const profileRef =
    useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------------------------ */
  /* Sidebar                                                                  */
  /* ------------------------------------------------------------------------ */

  const toggleSidebar = () => {
    setCollapsed((previous) => {
      const next = !previous;

      localStorage.setItem(
        'ecotime_sidebar_collapsed',
        String(next)
      );

      return next;
    });
  };

  /* ------------------------------------------------------------------------ */
  /* Keyboard shortcuts                                                       */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCommand =
        event.ctrlKey || event.metaKey;

      if (isCommand && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }

      if (event.key === 'Escape') {
        setSearchOpen(false);
        setNotificationsOpen(false);
        setProfileOpen(false);
        setHelpOpen(false);
      }
    };

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Search focus                                                             */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (searchOpen) {
      window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [searchOpen]);

  /* ------------------------------------------------------------------------ */
  /* Close popovers on outside click                                          */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        notificationRef.current &&
        !notificationRef.current.contains(target)
      ) {
        setNotificationsOpen(false);
      }

      if (
        profileRef.current &&
        !profileRef.current.contains(target)
      ) {
        setProfileOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Close mobile menu when route changes                                     */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  /* ------------------------------------------------------------------------ */
  /* Navigation helpers                                                       */
  /* ------------------------------------------------------------------------ */

  const allNavItems = NAV_SECTIONS.flatMap(
    (section) => section.items
  );

  const filteredNavItems = searchQuery.trim()
    ? allNavItems.filter((item) =>
        item.label
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : allNavItems;

  const unreadCount = notifications.filter(
    (notification) => notification.unread
  ).length;

  const markNotificationsRead = () => {
    setNotifications((previous) =>
      previous.map((notification) => ({
        ...notification,
        unread: false,
      }))
    );
  };

  const handleSignOut = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setProfileOpen(false);
    navigate('/login');
  };

  /* ------------------------------------------------------------------------ */
  /* Sidebar content                                                          */
  /* ------------------------------------------------------------------------ */

  const SidebarContent = ({
    mobile = false,
  }: {
    mobile?: boolean;
  }) => {
    const sidebarCollapsed = mobile
      ? false
      : collapsed;

    return (
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div
          className={`flex h-[76px] items-center ${
            sidebarCollapsed
              ? 'justify-center px-3'
              : 'justify-between px-5'
          }`}
        >
          <Logo
            collapsed={sidebarCollapsed}
            showSubtitle={!sidebarCollapsed}
            size="md"
          />

          {mobile && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV_SECTIONS.map((section) => (
            <div
              key={section.label}
              className="mb-5"
            >
              {!sidebarCollapsed && (
                <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">
                  {section.label}
                </p>
              )}

              {sidebarCollapsed && (
                <div className="mx-auto mb-2 h-px w-6 bg-white/[0.05]" />
              )}

              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavItem
                    key={item.to}
                    item={item}
                    collapsed={sidebarCollapsed}
                    onNavigate={
                      mobile
                        ? () => setMobileMenuOpen(false)
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Settings */}
          <div className="mb-5">
            {!sidebarCollapsed && (
              <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">
                System
              </p>
            )}

            {sidebarCollapsed && (
              <div className="mx-auto mb-2 h-px w-6 bg-white/[0.05]" />
            )}

            <NavItem
              item={{
                label: 'Settings',
                to: '/settings',
                icon: Settings,
                color: 'text-slate-300',
              }}
              collapsed={sidebarCollapsed}
              onNavigate={
                mobile
                  ? () => setMobileMenuOpen(false)
                  : undefined
              }
            />
          </div>
        </nav>

        {/* Bottom sidebar section */}
        <div className="border-t border-white/[0.05] p-3">
          {!sidebarCollapsed ? (
            <div className="space-y-3">
              {/* System status */}
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-50" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
                  </span>

                  <span className="text-[11px] font-semibold text-slate-300">
                    System operational
                  </span>
                </div>

                <p className="mt-1 pl-4 text-[10px] text-slate-600">
                  Carbon monitoring active
                </p>
              </div>

              {/* Help */}
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-slate-500 transition hover:bg-white/[0.035] hover:text-white"
              >
                <HelpCircle
                  size={16}
                  className="flex-shrink-0"
                />

                <span className="flex-1 text-[12px] font-medium">
                  Help & Feedback
                </span>

                <ChevronRight
                  size={14}
                  className="opacity-0 transition group-hover:opacity-100"
                />
              </button>

              {/* Sustainability card */}
              <div className="overflow-hidden rounded-2xl border border-green-500/[0.12] bg-gradient-to-br from-green-500/[0.08] to-teal-500/[0.04] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/10">
                    <Leaf
                      size={14}
                      className="text-green-400"
                    />
                  </div>

                  <span className="text-[11px] font-bold text-green-300">
                    Think Green
                  </span>
                </div>

                <p className="text-[10px] leading-relaxed text-slate-500">
                  Schedule energy-intensive work during cleaner grid windows.
                </p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              title="Help & Feedback"
              className="group relative mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white/[0.035] hover:text-white"
            >
              <HelpCircle size={18} />

              <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-lg border border-white/[0.08] bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-xl group-hover:block">
                Help & Feedback
              </span>
            </button>
          )}
        </div>
      </div>
    );
  };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="min-h-screen bg-bg-primary text-white">
      {/* ------------------------------------------------------------------ */}
      {/* Desktop Sidebar                                                    */}
      {/* ------------------------------------------------------------------ */}

      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden border-r border-white/[0.05] bg-[#080e1a] transition-[width] duration-300 lg:block ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        <SidebarContent />

        {/* Collapse button */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="absolute -right-3 top-[82px] flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.08] bg-[#101827] text-slate-500 shadow-lg transition hover:border-green-500/30 hover:bg-[#162033] hover:text-green-400"
          title={
            collapsed
              ? 'Expand sidebar'
              : 'Collapse sidebar'
          }
          aria-label={
            collapsed
              ? 'Expand sidebar'
              : 'Collapse sidebar'
          }
        >
          {collapsed ? (
            <ChevronRight size={13} />
          ) : (
            <ChevronLeft size={13} />
          )}
        </button>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile Sidebar Overlay                                              */}
      {/* ------------------------------------------------------------------ */}

      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() =>
                setMobileMenuOpen(false)
              }
            />

            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-white/[0.06] bg-[#080e1a] shadow-2xl lg:hidden"
              initial={{
                x: '-100%',
              }}
              animate={{
                x: 0,
              }}
              exit={{
                x: '-100%',
              }}
              transition={{
                duration: 0.22,
                ease: 'easeOut',
              }}
            >
              <SidebarContent mobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* Main Content                                                        */}
      {/* ------------------------------------------------------------------ */}

      <div
        className={`min-h-screen transition-[padding] duration-300 ${
          collapsed
            ? 'lg:pl-[72px]'
            : 'lg:pl-[260px]'
        }`}
      >
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-[#070a13]/90 backdrop-blur-xl">
          <div className="flex h-[68px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() =>
                setMobileMenuOpen(true)
              }
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.05] hover:text-white lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

            {/* Breadcrumb / page title */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="hidden text-[11px] font-medium text-slate-600 sm:block">
                  EcoTime
                </span>

                <ChevronRight
                  size={12}
                  className="hidden text-slate-700 sm:block"
                />

                <span className="truncate text-sm font-semibold text-white">
                  {location.pathname === '/dashboard'
                    ? 'Dashboard'
                    : location.pathname
                        .split('/')
                        .filter(Boolean)
                        .map((part) =>
                          part
                            .replace(/-/g, ' ')
                            .replace(/\b\w/g, (letter) =>
                              letter.toUpperCase()
                            )
                        )
                        .join(' / ') || 'Dashboard'}
                </span>
              </div>

              <div className="mt-0.5 hidden items-center gap-2 md:flex">
                <span className="text-[10px] text-slate-600">
                  Karnataka, India
                </span>

                {selectedZone && (
                  <>
                    <span className="text-slate-700">
                      •
                    </span>

                    <span className="text-[10px] text-slate-600">
                      {selectedZone}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Search */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden h-9 items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-slate-500 transition hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-slate-300 md:flex"
              aria-label="Search"
            >
              <Search size={14} />

              <span className="text-xs">
                Search
              </span>

              <kbd className="ml-2 rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-slate-600">
                Ctrl K
              </kbd>
            </button>

            {/* Mobile search */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.05] hover:text-white md:hidden"
              aria-label="Search"
            >
              <Search size={18} />
            </button>

            {/* Live monitoring */}
            <div className="hidden items-center gap-2 rounded-lg border border-green-500/[0.12] bg-green-500/[0.04] px-3 py-2 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
              </span>

              <span className="text-[10px] font-semibold text-green-300">
                Live monitoring
              </span>
            </div>

            {/* Notifications */}
            <div
              ref={notificationRef}
              className="relative"
            >
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen(
                    (previous) => !previous
                  );
                  setProfileOpen(false);
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
                aria-label="Notifications"
              >
                <Bell size={17} />

                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-green-500 px-1 text-[8px] font-bold text-black">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    initial={{
                      opacity: 0,
                      y: -5,
                      scale: 0.98,
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                    }}
                    exit={{
                      opacity: 0,
                      y: -5,
                      scale: 0.98,
                    }}
                    className="absolute right-0 top-12 z-50 w-[340px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1220] shadow-2xl"
                  >
                    <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-3">
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          Notifications
                        </h3>

                        <p className="mt-0.5 text-[10px] text-slate-600">
                          {unreadCount} unread
                        </p>
                      </div>

                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={
                            markNotificationsRead
                          }
                          className="text-[10px] font-semibold text-green-400 transition hover:text-green-300"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="max-h-[360px] overflow-y-auto">
                      {notifications.map(
                        (notification) => (
                          <button
                            key={notification.id}
                            type="button"
                            className="flex w-full gap-3 border-b border-white/[0.04] px-4 py-3 text-left transition hover:bg-white/[0.03]"
                          >
                            <span
                              className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                                notification.unread
                                  ? 'bg-green-400'
                                  : 'bg-slate-700'
                              }`}
                            />

                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold text-white">
                                {notification.title}
                              </span>

                              <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">
                                {notification.description}
                              </span>

                              <span className="mt-1.5 block text-[9px] text-slate-700">
                                {notification.time}
                              </span>
                            </span>
                          </button>
                        )
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile */}
            <div
              ref={profileRef}
              className="relative"
            >
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(
                    (previous) => !previous
                  );
                  setNotificationsOpen(false);
                }}
                className="flex h-9 items-center gap-2 rounded-lg px-1.5 transition hover:bg-white/[0.05]"
                aria-label="Profile menu"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-green-500/20 to-teal-500/20 text-green-300">
                  <User size={15} />
                </div>

                <ChevronRight
                  size={13}
                  className={`hidden text-slate-600 transition-transform sm:block ${
                    profileOpen
                      ? 'rotate-90'
                      : ''
                  }`}
                />
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{
                      opacity: 0,
                      y: -5,
                      scale: 0.98,
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                    }}
                    exit={{
                      opacity: 0,
                      y: -5,
                      scale: 0.98,
                    }}
                    className="absolute right-0 top-12 z-50 w-[220px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1220] shadow-2xl"
                  >
                    <div className="border-b border-white/[0.05] px-4 py-3">
                      <p className="text-xs font-bold text-white">
                        EcoTime User
                      </p>

                      <p className="mt-1 text-[10px] text-slate-600">
                        Carbon-aware computing
                      </p>
                    </div>

                    <div className="p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          navigate('/settings');
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
                      >
                        <Settings size={15} />
                        Settings
                      </button>

                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-rose-400 transition hover:bg-rose-500/[0.07]"
                      >
                        <LogOut size={15} />
                        Sign out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Location banner */}
        <LocationBanner />

        {/* Page content */}
        <main className="min-h-[calc(100vh-68px)] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{
                opacity: 0,
                y: 6,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              transition={{
                duration: 0.18,
              }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Command Palette                                                     */}
      {/* ------------------------------------------------------------------ */}

      <AnimatePresence>
        {searchOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSearchOpen(false)}
            />

            <motion.div
              initial={{
                opacity: 0,
                y: -20,
                scale: 0.98,
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                y: -20,
                scale: 0.98,
              }}
              className="fixed left-1/2 top-[12vh] z-[90] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b1220] shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-4">
                <Search
                  size={18}
                  className="flex-shrink-0 text-slate-500"
                />

                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(
                      event.target.value
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Escape'
                    ) {
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Search EcoTime..."
                  className="h-14 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                />

                <button
                  type="button"
                  onClick={() =>
                    setSearchOpen(false)
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="max-h-[420px] overflow-y-auto p-2">
                {filteredNavItems.length > 0 ? (
                  filteredNavItems.map((item) => {
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.to}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          navigate(item.to);
                        }}
                        className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.05]"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
                          <Icon
                            size={16}
                            className={item.color}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white">
                            {item.label}
                          </p>

                          <p className="mt-0.5 text-[10px] text-slate-600">
                            Navigate to {item.label}
                          </p>
                        </div>

                        <ChevronRight
                          size={14}
                          className="text-slate-700 transition group-hover:text-slate-400"
                        />
                      </button>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <Command
                      size={24}
                      className="mb-3 text-slate-700"
                    />

                    <p className="text-sm font-semibold text-slate-400">
                      No results found
                    </p>

                    <p className="mt-1 text-[10px] text-slate-600">
                      Try searching for a different page.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-white/[0.05] px-4 py-2.5">
                <span className="text-[9px] text-slate-700">
                  Navigation
                </span>

                <div className="flex items-center gap-2 text-[9px] text-slate-700">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-white/[0.06] px-1">
                      ESC
                    </kbd>
                    close
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* Help Modal                                                          */}
      {/* ------------------------------------------------------------------ */}

      <AnimatePresence>
        {helpOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHelpOpen(false)}
            />

            <motion.div
              initial={{
                opacity: 0,
                y: 20,
                scale: 0.98,
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                y: 20,
                scale: 0.98,
              }}
              className="fixed left-1/2 top-1/2 z-[90] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1220] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/10">
                    <HelpCircle
                      size={17}
                      className="text-green-400"
                    />
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Help & Feedback
                    </h3>

                    <p className="mt-0.5 text-[10px] text-slate-600">
                      EcoTime support
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setHelpOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white/[0.05] hover:text-white"
                  aria-label="Close help"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 p-5">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-xs font-semibold text-white">
                    Need help using EcoTime?
                  </p>

                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                    Use the Dashboard to monitor carbon
                    intensity, Activities to manage your
                    digital workloads, and Optimization to
                    find cleaner scheduling windows.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setHelpOpen(false);
                      navigate('/dashboard');
                    }}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.04]"
                  >
                    <p className="text-xs font-semibold text-white">
                      Open Dashboard
                    </p>

                    <p className="mt-1 text-[10px] text-slate-600">
                      View current carbon data
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setHelpOpen(false);
                      navigate('/optimization');
                    }}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.04]"
                  >
                    <p className="text-xs font-semibold text-white">
                      View Optimization
                    </p>

                    <p className="mt-1 text-[10px] text-slate-600">
                      Find greener execution windows
                    </p>
                  </button>
                </div>
              </div>

              <div className="border-t border-white/[0.05] px-5 py-3">
                <p className="text-[9px] text-slate-700">
                  EcoTime • Carbon-Aware Computing
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AppLayout;