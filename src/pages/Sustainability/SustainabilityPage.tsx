import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Award,
  Flame,
  Leaf,
  Trophy,
  CalendarCheck,
  Gauge,
  Users,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { useAuth } from '@/features/auth/AuthProvider';
import { optimizerService } from '@/services/optimizerService';
import type { PersistedOptimization } from '@/types/domain';

import {
  sustainabilityService,
  type SustainabilityScore,
  type UserBadge,
  type LeaderboardEntry,
  type GlobalLeaderboardEntry,
  type EcoPointTransaction,
} from '@/services/sustainabilityService';

export function SustainabilityPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [score, setScore] = useState<SustainabilityScore | null>(null);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [transactions, setTransactions] = useState<EcoPointTransaction[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [globalLeaderboard, setGlobalLeaderboard] = useState<GlobalLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; isAuthError?: boolean } | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);
  const [globalLeaderboardOptIn, setGlobalLeaderboardOptIn] = useState(false);
  const [leaderboardScope, setLeaderboardScope] = useState<'organization' | 'global'>('organization');
  const [optInLoading, setOptInLoading] = useState(false);
  const [optInError, setOptInError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [latest, setLatest] = useState<PersistedOptimization | null>(null);

  const activeUserIdRef = useRef<number | string | null>(user?.id ?? null);
  useEffect(() => {
    activeUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    let ignore = false;
    optimizerService.getLatestOptimization().then((res) => {
      if (!ignore && res.success) setLatest(res.data ?? null);
    });
    return () => {
      ignore = true;
    };
  }, []);

  const savings = latest?.response.savings;
  const moved = latest?.response.recommendations.filter(
    (r) => r.status === 'scheduled'
  ).length ?? 0;

  const formatG = (g: number) =>
    Math.abs(g) >= 1000
      ? `${(g / 1000).toFixed(2)} kgCO₂e`
      : `${g.toFixed(1)} gCO₂e`;

  const organizationId =
    user?.organizationId != null && String(user.organizationId).trim() !== ''
      ? String(user.organizationId)
      : user?.organization?.id != null && String(user.organization.id).trim() !== ''
        ? String(user.organization.id)
        : score?.organizationId != null && String(score.organizationId).trim() !== ''
          ? String(score.organizationId)
          : null;

  // Load primary sustainability data when user identity is ready
  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    const currentUser = user;
    let ignore = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      setLeaderboardError(null);

      try {
        const [scoreResponse, badgeResponse, txResponse] = await Promise.all([
          sustainabilityService.getSustainabilityScore(currentUser.id),
          sustainabilityService.getUserBadges(currentUser.id),
          sustainabilityService.getTransactions(currentUser.id),
        ]);

        if (ignore || activeUserIdRef.current !== currentUser.id) return;

        if (
          scoreResponse.status === 401 ||
          badgeResponse.status === 401 ||
          txResponse.status === 401
        ) {
          setError({
            title: 'Session Expired',
            message: 'Your authentication session has expired. Please log in again to view your sustainability impact.',
            isAuthError: true,
          });
          return;
        }

        if (
          scoreResponse.status === 403 ||
          badgeResponse.status === 403 ||
          txResponse.status === 403
        ) {
          setError({
            title: 'Access Denied',
            message: 'You do not have permission to access this sustainability data.',
          });
          return;
        }

        const networkError =
          (scoreResponse.status === 0 ? scoreResponse.error : null) ||
          (badgeResponse.status === 0 ? badgeResponse.error : null) ||
          (txResponse.status === 0 ? txResponse.error : null);

        if (networkError) {
          setError({
            title: 'Connection Error',
            message: networkError,
          });
          return;
        }

        if (
          (scoreResponse.status && scoreResponse.status >= 500) ||
          (badgeResponse.status && badgeResponse.status >= 500) ||
          (txResponse.status && txResponse.status >= 500)
        ) {
          setError({
            title: 'Service Error',
            message: 'The sustainability service encountered an unexpected error. Please try again later.',
          });
          return;
        }

        let optInValue = false;
        let scoreOrgId: string | null = null;

        if (scoreResponse.success && scoreResponse.data) {
          setScore(scoreResponse.data);
          optInValue = Boolean(scoreResponse.data.leaderboardOptIn);
          setLeaderboardOptIn(optInValue);
          setGlobalLeaderboardOptIn(Boolean(scoreResponse.data.globalLeaderboardOptIn));
          scoreOrgId = scoreResponse.data.organizationId
            ? String(scoreResponse.data.organizationId)
            : null;
        } else if (scoreResponse.status === 404) {
          setScore(null);
          setLeaderboardOptIn(false);
        }

        if (badgeResponse.success && badgeResponse.data) {
          setBadges(badgeResponse.data.badges || []);
        } else {
          setBadges([]);
        }

        if (txResponse.success && txResponse.data) {
          setTransactions(txResponse.data.transactions || []);
        } else {
          setTransactions([]);
        }

        const effectiveOrgId =
          currentUser.organizationId != null && String(currentUser.organizationId).trim() !== ''
            ? String(currentUser.organizationId)
            : currentUser.organization?.id != null && String(currentUser.organization.id).trim() !== ''
              ? String(currentUser.organization.id)
              : scoreOrgId;

        if (optInValue && effectiveOrgId) {
          setLeaderboardLoading(true);

          const boardRes =
            await sustainabilityService.getOrganizationLeaderboard(effectiveOrgId);

          if (ignore || activeUserIdRef.current !== currentUser.id) return;

          if (boardRes.status === 401) {
            setLeaderboardError('Session expired. Please log in again to view the leaderboard.');
            setLeaderboard([]);
          } else if (boardRes.status === 403) {
            setLeaderboardError("Access denied: You are not authorized to access this organization's leaderboard.");
            setLeaderboard([]);
          } else if (boardRes.success && boardRes.data) {
            setLeaderboard(boardRes.data.leaderboard || []);
          } else {
            setLeaderboardError(
              boardRes.error || 'Failed to load organization leaderboard.'
            );
            setLeaderboard([]);
          }

          setLeaderboardLoading(false);
        } else {
          setLeaderboard([]);
        }
        if (scoreResponse.success && scoreResponse.data?.globalLeaderboardOptIn) {
          setLeaderboardLoading(true);
          const globalRes = await sustainabilityService.getGlobalLeaderboard();
          if (ignore || activeUserIdRef.current !== currentUser.id) return;
          if (globalRes.success && globalRes.data) {
            setGlobalLeaderboard(globalRes.data.leaderboard || []);
          } else {
            setLeaderboardError(globalRes.error || 'Failed to load global leaderboard.');
            setGlobalLeaderboard([]);
          }
          setLeaderboardLoading(false);
        } else {
          setGlobalLeaderboard([]);
        }
      } catch (err) {
        if (ignore || activeUserIdRef.current !== currentUser.id) return;

        setError({
          title: 'Failed to load sustainability data',
          message: err instanceof Error
            ? err.message
            : 'An unexpected error occurred while loading sustainability data.',
        });
      } finally {
          if (!ignore && activeUserIdRef.current === currentUser.id) {
            setLoading(false);
          }
        }
      }

      void loadData();

      return () => {
        ignore = true;
      };
    }, [authLoading, user, reloadKey]);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadKey((prev) => prev + 1);
  }, []);

  const handleRetryLeaderboard = useCallback(async () => {
    if ((!organizationId && leaderboardScope === 'organization') || !user || leaderboardLoading) {
      return;
    }
    const currentUserId = user.id;
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    if (leaderboardScope === 'organization') {
      const response = await sustainabilityService.getOrganizationLeaderboard(organizationId!);
      if (activeUserIdRef.current !== currentUserId) return;
      if (response.status === 401) {
        setLeaderboardError('Session expired. Please log in again to view the leaderboard.');
        setLeaderboard([]);
      } else if (response.status === 403) {
        setLeaderboardError("Access denied: You are not authorized to access this organization's leaderboard.");
        setLeaderboard([]);
      } else if (response.success && response.data) {
        setLeaderboard(response.data.leaderboard || []);
      } else {
        setLeaderboardError(response.error || 'Failed to load organization leaderboard.');
        setLeaderboard([]);
      }
    } else {
      const response = await sustainabilityService.getGlobalLeaderboard();
      if (activeUserIdRef.current !== currentUserId) return;
      if (response.status === 401) {
        setLeaderboardError('Session expired. Please log in again to view the leaderboard.');
        setGlobalLeaderboard([]);
      } else if (response.success && response.data) {
        setGlobalLeaderboard(response.data.leaderboard || []);
      } else {
        setLeaderboardError(response.error || 'Failed to load global leaderboard.');
        setGlobalLeaderboard([]);
      }
    }
    setLeaderboardLoading(false);
  }, [organizationId, user, leaderboardLoading, leaderboardScope]);

// Handle opt-in toggle
const handleLeaderboardOptIn = async () => {
    if (!organizationId || !user || optInLoading) {
      return;
    }

    const currentUserId = user.id;
    setOptInLoading(true);
    setOptInError(null);

    const newValue = !leaderboardOptIn;

    const response = await sustainabilityService.setLeaderboardOptIn(
      organizationId,
      currentUserId,
      newValue
    );

    if (activeUserIdRef.current !== currentUserId) return;

    if (response.success && response.data) {
      const updatedOptIn = response.data.leaderboardOptIn;
      setLeaderboardOptIn(updatedOptIn);

      if (!updatedOptIn) {
        // Opting out immediately removes user's participation from the displayed leaderboard
        setLeaderboard([]);
      } else {
        // Reload fresh leaderboard rankings
        setLeaderboardLoading(true);
        const boardRes = await sustainabilityService.getOrganizationLeaderboard(organizationId);
        if (activeUserIdRef.current !== currentUserId) return;
        if (boardRes.success && boardRes.data) {
          setLeaderboard(boardRes.data.leaderboard || []);
        } else {
          setLeaderboardError(boardRes.error || 'Failed to load updated leaderboard.');
          setLeaderboard([]);
        }
        setLeaderboardLoading(false);
      }

      // Synchronize latest score record
      const scoreRes = await sustainabilityService.getSustainabilityScore(currentUserId);
      if (activeUserIdRef.current !== currentUserId) return;
      if (scoreRes.success && scoreRes.data) {
        setScore(scoreRes.data);
      }
    } else {
      // Retain current opt-in state without displaying a false success
      setOptInError(response.error || 'Failed to update leaderboard preference.');
    }

    setOptInLoading(false);
  };

  const handleGlobalLeaderboardOptIn = async () => {
      if (!user || optInLoading) return;
      const currentUserId = user.id;
      setOptInLoading(true);
      setOptInError(null);
      const response = await sustainabilityService.setGlobalLeaderboardOptIn(!globalLeaderboardOptIn);
      if (activeUserIdRef.current !== currentUserId) return;
      if (response.success && response.data) {
        const updated = response.data.globalLeaderboardOptIn;
        setGlobalLeaderboardOptIn(updated);
        if (updated) {
          const boardRes = await sustainabilityService.getGlobalLeaderboard();
          if (boardRes.success && boardRes.data) setGlobalLeaderboard(boardRes.data.leaderboard || []);
        } else {
          setGlobalLeaderboard([]);
        }
        const scoreRes = await sustainabilityService.getSustainabilityScore(currentUserId);
        if (scoreRes.success && scoreRes.data) setScore(scoreRes.data);
      } else {
        setOptInError(response.error || 'Failed to update global leaderboard preference.');
      }
      setOptInLoading(false);
    };

  // 1. Session Loading State
  if (authLoading) {
    return (
      <div className="page-shell page-stack">
        <GlassCard padding="lg">
          <div className="text-center py-10">
            <p className="text-slate-400">Loading authenticated session...</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  // 2. Authentication Missing State
  if (!isAuthenticated || !user) {
    return (
      <div className="page-shell page-stack">
        <ErrorState
          title="Authentication Required"
          message="Please log in to view your sustainability impact, points, and organization leaderboard."
        />
      </div>
    );
  }

  // 3. Primary Data Error State
  if (error) {
    return (
      <div className="page-shell page-stack">
        <ErrorState
          title={error.title}
          message={error.message}
          onRetry={error.isAuthError ? undefined : handleRetry}
        />
      </div>
    );
  }

  const totalPoints = score?.totalPoints ?? 0;
  const sustainabilityScore = score?.score ?? 0;
  const currentStreak = score?.currentStreak ?? 0;
  const longestStreak = score?.longestStreak ?? 0;
  const currentUserIdStr = String(user.id);

  return (
    <div className="page-shell page-stack">

      {/* Header */}
      <div>
        <h1 className="page-header-title heading-row">
          Sustainability

          <span className="ds-badge bg-green-500/10 text-green-400 border-green-500/20">
            Impact Tracker
          </span>
        </h1>
        <p className="page-header-subtitle">Estimated impact from your latest optimization run, plus your EcoPoints progress. Figures are estimates from assumed power and duration, not measured savings.</p>
      </div >

      {/* Impact from the latest optimization run */}
      < div className="card-grid card-grid-sm-3" >
        {
          [
            {
              icon: Leaf,
              label: savings && savings.totalSavedCo2 < 0
                ? 'Estimated emissions increase (latest run)'
                : 'Estimated emissions saved (latest run)',
              value: savings ? formatG(savings.totalSavedCo2) : 'Run an optimization to see this',
              color: 'text-green-400',
              bg: 'bg-green-500/10 border-green-500/20',
            },
            {
              icon: Gauge,
              label: 'Estimated reduction vs baseline',
              value: savings ? `${savings.reductionPercent.toFixed(1)}%` : '—',
              color: 'text-teal-400',
              bg: 'bg-teal-500/10 border-teal-500/20',
            },
            {
              icon: CalendarCheck,
              label: 'Activities moved to Green Windows',
              value: latest ? String(moved) : '—',
              color: 'text-blue-400',
              bg: 'bg-blue-500/10 border-blue-500/20',
            },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <GlassCard key={label} variant="elevated">
              <div className={`ds-icon-box mb-4 ${bg} ${color}`}>
                <Icon className="ds-icon-lg" />
              </div>

              <p className="label-text mb-1">{label}</p>

              <p className="text-xl font-bold text-white">
                {value}
              </p>
            </GlassCard>
          ))
        }
      </div >

      {
        loading ? (
          <GlassCard padding="lg" >
            <div className="text-center py-10">
              <p className="text-slate-400">
                Loading sustainability data...
              </p>
            </div>
          </GlassCard>
        ) : (
          <>
            {/* Main Metrics */}
            <div className="card-grid card-grid-sm-3">

              <GlassCard variant="elevated">
                <div className="ds-icon-box mb-4 bg-green-500/10 border-green-500/20 text-green-400">
                  <Leaf className="ds-icon-lg" />
                </div>

                <p className="label-text mb-1">
                  EcoPoints
                </p>

                <p className="text-2xl font-extrabold text-white tracking-tight">
                  {totalPoints}
                </p>
              </GlassCard>

              <GlassCard variant="elevated">
                <div className="ds-icon-box mb-4 bg-blue-500/10 border-blue-500/20 text-blue-400">
                  <Award className="ds-icon-lg" />
                </div>

                <p className="label-text mb-1">
                  Sustainability Score
                </p>

                <p className="text-2xl font-extrabold text-white tracking-tight">
                  {sustainabilityScore}
                </p>
              </GlassCard>

              <GlassCard variant="elevated">
                <div className="ds-icon-box mb-4 bg-orange-500/10 border-orange-500/20 text-orange-400">
                  <Flame className="ds-icon-lg" />
                </div>

                <p className="label-text mb-1">
                  Current Streak
                </p>

                <p className="text-2xl font-extrabold text-white tracking-tight">
                  {currentStreak} days
                </p>
              </GlassCard>

            </div>

            {/* Streak + Badges */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Streak */}
              <GlassCard padding="lg">

                <div className="flex items-center gap-3 mb-5">
                  <div className="ds-icon-box bg-orange-500/10 border-orange-500/20 text-orange-400">
                    <Flame className="ds-icon-lg" />
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Sustainability Streak
                    </h2>

                    <p className="text-sm text-slate-400">
                      Your sustainable activity streak
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">

                  <div className="rounded-xl border border-white/10 p-4">
                    <p className="text-sm text-slate-400">
                      Current Streak
                    </p>

                    <p className="text-xl font-bold text-white mt-1">
                      {currentStreak} days
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 p-4">
                    <p className="text-sm text-slate-400">
                      Longest Streak
                    </p>

                    <p className="text-xl font-bold text-white mt-1">
                      {longestStreak} days
                    </p>
                  </div>

                </div>

              </GlassCard>

              {/* Badges */}
              <GlassCard padding="lg">

                <div className="flex items-center gap-3 mb-5">

                  <div className="ds-icon-box bg-green-500/10 border-green-500/20 text-green-400">
                    <Award className="ds-icon-lg" />
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Badges
                    </h2>

                    <p className="text-sm text-slate-400">
                      Badges earned through sustainable actions
                    </p>
                  </div>

                </div>

                {badges.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No badges earned yet.
                  </p>
                ) : (
                  <div className="space-y-3">

                    {badges.map((badge) => (
                      <div
                        key={badge.id}
                        className="rounded-xl border border-white/10 p-4"
                      >
                        <p className="font-semibold text-white">
                          {badge.name}
                        </p>

                        {badge.description && (
                          <p className="text-sm text-slate-400 mt-1">
                            {badge.description}
                          </p>
                        )}

                        <p className="text-xs text-slate-500 mt-2">
                          Earned{' '}
                          {badge.earnedAt
                            ? new Date(badge.earnedAt).toLocaleDateString()
                            : '—'}
                        </p>
                      </div>
                    ))}

                  </div>
                )}

              </GlassCard>

            </div>

            {/* EcoPoint Transactions Ledger */}
            <GlassCard padding="lg">
              <div className="flex items-center gap-3 mb-5">
                <div className="ds-icon-box bg-green-500/10 border-green-500/20 text-green-400">
                  <Leaf className="ds-icon-lg" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    EcoPoint Transactions
                  </h2>
                  <p className="text-sm text-slate-400">
                    History of points earned from verified sustainable activity events
                  </p>
                </div>
              </div>

              {transactions.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-slate-400 text-sm">
                    No EcoPoint transactions recorded yet.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Complete flexible activities during green windows to earn points.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 text-slate-400">Date</th>
                        <th className="text-left py-3 text-slate-400">Event</th>
                        <th className="text-left py-3 text-slate-400">Description</th>
                        <th className="text-right py-3 text-slate-400">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-white/5">
                          <td className="py-3 text-slate-400 text-xs">
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-3 text-white font-medium capitalize">
                            {tx.eventType.replace(/_/g, ' ')}
                          </td>
                          <td className="py-3 text-slate-300">
                            {tx.description || 'Carbon-aware event completed'}
                          </td>
                          <td className="py-3 text-right text-green-400 font-semibold">
                            +{tx.points}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>

            {/* Leaderboard */}
            <GlassCard padding="lg">

              <div className="flex items-center justify-between gap-4 mb-6">

                <div className="flex items-center gap-3">

                  <div className="ds-icon-box bg-purple-500/10 border-purple-500/20 text-purple-400">
                    <Trophy className="ds-icon-lg" />
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {leaderboardScope === 'organization' ? 'Organization Leaderboard' : 'Global Leaderboard'}
                    </h2>

                    <p className="text-sm text-slate-400">
                      {leaderboardScope === 'global'
                        ? 'Compare sustainability contributions across organizations.'
                        : 'Participate only if you choose to opt in.'}
                    </p>
                  </div>

                </div>

                {((leaderboardScope === 'organization' && organizationId) || leaderboardScope === 'global') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-green-500/20 bg-green-500/10 text-green-400 hover:bg-green-500/20 hover:text-green-300"
                    onClick={leaderboardScope === 'organization'
                      ? handleLeaderboardOptIn
                      : handleGlobalLeaderboardOptIn}
                    disabled={optInLoading}
                  >
                    {optInLoading
                      ? 'Updating...'
                      : (leaderboardScope === 'organization'
                        ? leaderboardOptIn
                        : globalLeaderboardOptIn)
                        ? 'Opt Out'
                        : 'Opt In'}
                  </Button>
                )}

              </div>

              <div className="mb-6 flex gap-2 border-b border-white/10">
                <button
                  type="button"
                  className={`px-3 py-2 text-sm font-semibold ${leaderboardScope === 'organization' ? 'border-b-2 border-green-400 text-green-300' : 'text-slate-400'}`}
                  onClick={() => setLeaderboardScope('organization')}
                >
                  Organization
                </button>
                <button
                  type="button"
                  className={`px-3 py-2 text-sm font-semibold ${leaderboardScope === 'global' ? 'border-b-2 border-green-400 text-green-300' : 'text-slate-400'}`}
                  onClick={() => setLeaderboardScope('global')}
                >
                  Global
                </button>
              </div>

              {optInError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-rose-400 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{optInError}</span>
                </div>
              )}

              {!organizationId ? (
                <div className="text-center py-8">
                  <Users className="w-8 h-8 text-slate-500 mx-auto mb-3" />

                  <p className="text-slate-400">
                    Organization information is not available yet.
                  </p>

                  <p className="text-xs text-slate-500 mt-1">
                    Leaderboard participation will be available when
                    your organization is assigned.
                  </p>
                </div>
              ) : leaderboardLoading ? (
                <div className="text-center py-8">
                  <p className="text-slate-400">
                    Loading leaderboard...
                  </p>
                </div>
              ) : leaderboardError ? (
                <div className="text-center py-8">
                  <p className="text-rose-400 mb-3">{leaderboardError}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRetryLeaderboard}
                    iconLeft={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Retry Leaderboard
                  </Button>
                </div>
              ) : (leaderboardScope === 'organization' ? !leaderboardOptIn : !globalLeaderboardOptIn) ? (
                <div className="text-center py-8">
                  <Trophy className="w-8 h-8 text-slate-500 mx-auto mb-3" />

                  <p className="text-slate-400">
                    You are not participating in the leaderboard.
                  </p>

                  <p className="text-xs text-slate-500 mt-1">
                    Select Opt In to participate.
                  </p>
                </div>
              ) : (leaderboardScope === 'organization' ? leaderboard : globalLeaderboard).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-400">
                    No leaderboard entries yet.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">

                  <table className="w-full text-sm">

                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 text-slate-400">
                          Rank
                        </th>

                        {leaderboardScope === 'global' ? (
                          <th className="text-left py-3 text-slate-400">
                            Organization
                          </th>
                        ) : (
                          <th className="text-left py-3 text-slate-400">
                            User
                          </th>
                        )}
                        <th className="text-right py-3 text-slate-400">
                          {leaderboardScope === 'global' ? 'Average Score' : 'Score'}
                        </th>

                        <th className="text-right py-3 text-slate-400">
                          {leaderboardScope === 'global' ? 'Average EcoPoints' : 'EcoPoints'}
                        </th>

                        {leaderboardScope === 'global' && (
                          <th className="text-right py-3 text-slate-400">
                            Participating Members
                          </th>
                        )}
                        {leaderboardScope === 'organization' && (
                          <th className="text-right py-3 text-slate-400">
                            Streak
                          </th>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {(leaderboardScope === 'organization' ? leaderboard : globalLeaderboard).map((entry) => {
                        const isOrganizationEntry = 'userId' in entry;
                        const isGlobalEntry = 'averageScore' in entry;
                        const isCurrentUser = isOrganizationEntry && entry.userId === currentUserIdStr;
                        return (
                          <tr
                            key={`${entry.rank}-${isGlobalEntry ? entry.organizationName : entry.displayName}`}
                            className={`border-b border-white/5 ${isCurrentUser ? 'bg-green-500/[0.06]' : ''
                              }`}
                          >
                            <td className="py-3 text-white font-semibold">
                              #{entry.rank}
                            </td>

                            {isGlobalEntry ? (
                              <td className="py-3 text-slate-300">
                                {entry.organizationName}
                              </td>
                            ) : (
                              <td className="py-3 text-slate-300">
                                <span className="font-medium">
                                  {entry.displayName || 'Participant'}
                                </span>
                                {isCurrentUser && (
                                  <span className="ml-2 ds-badge bg-green-500/10 text-green-400 border-green-500/20 text-[10px] py-0 px-1.5">
                                    You
                                  </span>
                                )}
                              </td>
                            )}

                            <td className="py-3 text-right text-white">
                              {isGlobalEntry ? entry.averageScore : entry.score}
                            </td>

                            <td className="py-3 text-right text-green-400">
                              {isGlobalEntry ? entry.averageEcoPoints : entry.totalPoints}
                            </td>

                            {isGlobalEntry ? (
                              <td className="py-3 text-right text-slate-300">
                                {entry.participatingMembers}
                              </td>
                            ) : (
                              <td className="py-3 text-right text-orange-400">
                                {entry.currentStreak} days
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>

                  </table>

                </div>
              )}

            </GlassCard>

          </>
        )
      }

    </div >
  );
}
