import { useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Building2,
  ShieldCheck,
  Calendar,
  Hash,
  LogOut,
  Settings,
  Users,
  CheckCircle2,
  ExternalLink,
  Globe,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useAuth } from '@/features/auth/AuthProvider';
import { useZone } from '@/app/ZoneProvider';

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { selectedZone } = useZone();

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'EcoTime Member';
  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    'U';

  const roleName = user?.role?.name ?? 'Employee';
  const isAdmin = roleName === 'Organization Admin';

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Active';

  const orgCreated = user?.organization?.createdAt
    ? new Date(user.organization.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="page-shell-narrow page-stack">
      {/* Page Header */}
      <div>
        <h1 className="page-header-title heading-row">
          Profile
          <span className="ds-badge bg-white/[0.06] text-slate-400">
            Account Details
          </span>
        </h1>
        <p className="page-header-subtitle">
          Manage your personal identity, organization affiliation, and system credentials.
        </p>
      </div>

      <div className="section-stack">
        {/* Hero User Identity Card */}
        <GlassCard variant="elevated" padding="lg" className="relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 relative z-10">
            {/* Avatar with Initials & Active Status Dot */}
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-400 to-emerald-600 flex items-center justify-center text-slate-950 font-black text-2xl shadow-xl shadow-emerald-500/20 border border-emerald-400/30">
                {initials}
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-[#10192c]" />
              </span>
            </div>

            {/* Core Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
                  {fullName}
                </h2>
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                    isAdmin
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-white/10 bg-white/5 text-slate-300'
                  }`}
                >
                  {isAdmin ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  {roleName}
                </div>
              </div>

              <p className="text-sm text-slate-400 flex items-center gap-1.5 mb-3 truncate">
                <Mail className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                <span className="truncate">{user?.email ?? 'No email associated'}</span>
              </p>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-200 font-medium">
                    {user?.organization?.name ?? 'No Organization'}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                  <Hash className="h-3.5 w-3.5 text-slate-400" />
                  <span>Tenant #{user?.organizationId ?? 'N/A'}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Verified Session</span>
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex sm:flex-col gap-2 w-full sm:w-auto mt-2 sm:mt-0">
              <button
                type="button"
                onClick={() => navigate('/organization')}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.1] transition-colors"
              >
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <span>Organization</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.1] transition-colors"
              >
                <Settings className="h-3.5 w-3.5 text-slate-400" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </GlassCard>

        {/* Detailed Attribute Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Personal Information */}
          <GlassCard variant="default" className="space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <User size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Personal Information</h3>
                <p className="text-[11px] text-slate-400">User identification details</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">First Name</span>
                <span className="font-semibold text-slate-200">{user?.firstName || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-t border-white/[0.04]">
                <span className="text-slate-400">Last Name</span>
                <span className="font-semibold text-slate-200">{user?.lastName || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-t border-white/[0.04]">
                <span className="text-slate-400">Email Address</span>
                <span className="font-semibold text-slate-200 truncate max-w-[200px]" title={user?.email}>
                  {user?.email || '—'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-t border-white/[0.04]">
                <span className="text-slate-400">User ID</span>
                <span className="font-mono text-slate-300 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                  #{user?.id ?? 'N/A'}
                </span>
              </div>
            </div>
          </GlassCard>

          {/* Organization & Access Information */}
          <GlassCard variant="default" className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                  <Building2 size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Organization Access</h3>
                  <p className="text-[11px] text-slate-400">Tenant membership & role</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/organization')}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold inline-flex items-center gap-1 transition-colors"
              >
                <span>View</span>
                <ExternalLink size={12} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Organization Name</span>
                <span className="font-semibold text-white">
                  {user?.organization?.name ?? 'No Organization'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-t border-white/[0.04]">
                <span className="text-slate-400">Tenant Identifier</span>
                <span className="font-mono text-slate-300 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                  {user?.organizationId ? `ID: ${user.organizationId}` : 'None'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-t border-white/[0.04]">
                <span className="text-slate-400">Role Designation</span>
                <span className="font-semibold text-slate-200">{roleName}</span>
              </div>
              {orgCreated && (
                <div className="flex justify-between items-center py-1 border-t border-white/[0.04]">
                  <span className="text-slate-400">Tenant Established</span>
                  <span className="text-slate-300">{orgCreated}</span>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Account & Session Telemetry */}
          <GlassCard variant="default" className="space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Calendar size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Account Telemetry</h3>
                <p className="text-[11px] text-slate-400">Registration and environment details</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Account Status</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Active & Authenticated
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-t border-white/[0.04]">
                <span className="text-slate-400">Member Since</span>
                <span className="text-slate-200 font-medium">{memberSince}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-t border-white/[0.04]">
                <span className="text-slate-400">Active Grid Zone</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-200">
                  <Globe className="h-3 w-3 text-slate-400" />
                  {selectedZone ?? 'Auto-detected'}
                </span>
              </div>
            </div>
          </GlassCard>

          {/* Role Permissions Summary */}
          <GlassCard variant="default" className="space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <ShieldCheck size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Role & Permissions</h3>
                <p className="text-[11px] text-slate-400">Access authorization boundaries</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-slate-300 leading-relaxed">
                {isAdmin
                  ? 'As an Organization Admin, you have full privileges to view all tenant members, configure optimization parameters, manage telemetry integrations, and oversee workload schedules.'
                  : 'As an Employee, you have full visibility into regional grid emissions, carbon forecasts, green windows, and workload execution analytics for your organization.'}
              </p>
              <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-slate-400">
                <span>Security Token:</span>
                <span className="text-slate-300 font-mono text-[11px]">JWT Bearer (Secured)</span>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Account Actions Bar */}
        <GlassCard variant="inset" padding="md" className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="text-xs font-semibold text-white">Need to switch accounts or end session?</p>
            <p className="text-[11px] text-slate-400">Signing out will clear local authentication tokens.</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition-all hover:border-rose-500/30"
          >
            <LogOut size={15} />
            <span>Sign Out of EcoTime</span>
          </button>
        </GlassCard>
      </div>
    </div>
  );
}
