import { useEffect, useState } from 'react';
import {
  Award,
  Flame,
  Leaf,
  Trophy,
  Users,
} from 'lucide-react';

import { GlassCard } from '@/components/ui/GlassCard';
import {apiClient} from '@/services/api';

import type{
  SustainabilityScore,
  UserBadge,
  LeaderboardEntry,
} from '@/services/api';

export function SustainabilityPage() {
  const [score, setScore] = useState<SustainabilityScore | null>(null);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);
  const [optInLoading, setOptInLoading] = useState(false);

  const userId =
    localStorage.getItem('ecotime_user_id') || 'demo-user';

  useEffect(() => {
    const loadSustainabilityData = async () => {
      setLoading(true);

      const [scoreResponse, badgeResponse] = await Promise.all([
        apiClient.getSustainabilityScore(userId),
        apiClient.getUserBadges(userId),
      ]);

      if (scoreResponse.success && scoreResponse.data) {
        setScore(scoreResponse.data);
      }

      if (badgeResponse.success && badgeResponse.data) {
        setBadges(badgeResponse.data.badges);
      }

      setLoading(false);
    };

    loadSustainabilityData();
  }, [userId]);

  useEffect(() => {
    const loadLeaderboard = async () => {
      if (!score?.organizationId) {
        return;
      }

      setLeaderboardLoading(true);

      const response = await apiClient.getOrganizationLeaderboard(
        score.organizationId
      );

      if (response.success && response.data) {
        setLeaderboard(response.data.leaderboard);
      }

      setLeaderboardLoading(false);
    };

    loadLeaderboard();
  }, [score?.organizationId]);

  const handleLeaderboardOptIn = async () => {
    if (!score?.organizationId) {
      return;
    }

    setOptInLoading(true);

    const newValue = !leaderboardOptIn;

    const response = await apiClient.setLeaderboardOptIn(
      score.organizationId,
      userId,
      newValue
    );

    if (response.success && response.data) {
      setLeaderboardOptIn(response.data.leaderboardOptIn);

      if (!newValue) {
        setLeaderboard([]);
      } else {
        const leaderboardResponse =
          await apiClient.getOrganizationLeaderboard(
            score.organizationId
          );

        if (
          leaderboardResponse.success &&
          leaderboardResponse.data
        ) {
          setLeaderboard(
            leaderboardResponse.data.leaderboard
          );
        }
      }
    }

    setOptInLoading(false);
  };

  const totalPoints = score?.totalPoints ?? 0;
  const sustainabilityScore = score?.score ?? 0;
  const currentStreak = score?.currentStreak ?? 0;
  const longestStreak = score?.longestStreak ?? 0;

  return (
    <div className="page-shell page-stack max-w-[1650px] mx-auto">

      {/* Header */}
      <div>
        <h1 className="page-header-title heading-row">
          Sustainability

          <span className="ds-badge bg-green-500/10 text-green-400 border-green-500/20">
            Impact Tracker
          </span>
        </h1>

        <p className="page-header-subtitle">
          Track your EcoPoints, sustainability score, badges and
          streaks.
        </p>
      </div>

      {loading ? (
        <GlassCard padding="lg">
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
                        {new Date(
                          badge.earnedAt
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  ))}

                </div>
              )}

            </GlassCard>

          </div>


          {/* Leaderboard */}
          <GlassCard padding="lg">

            <div className="flex items-center justify-between gap-4 mb-6">

              <div className="flex items-center gap-3">

                <div className="ds-icon-box bg-purple-500/10 border-purple-500/20 text-purple-400">
                  <Trophy className="ds-icon-lg" />
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Organization Leaderboard
                  </h2>

                  <p className="text-sm text-slate-400">
                    Participate only if you choose to opt in.
                  </p>
                </div>

              </div>


              {score?.organizationId && (
                <button
                  type="button"
                  onClick={handleLeaderboardOptIn}
                  disabled={optInLoading}
                  className="px-4 py-2 rounded-lg border border-green-500/20 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition disabled:opacity-50"
                >
                  {optInLoading
                    ? 'Updating...'
                    : leaderboardOptIn
                      ? 'Opt Out'
                      : 'Opt In'}
                </button>
              )}

            </div>


            {!score?.organizationId ? (
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
            ) : !leaderboardOptIn ? (
              <div className="text-center py-8">
                <Trophy className="w-8 h-8 text-slate-500 mx-auto mb-3" />

                <p className="text-slate-400">
                  You are not participating in the leaderboard.
                </p>

                <p className="text-xs text-slate-500 mt-1">
                  Select Opt In to participate.
                </p>
              </div>
            ) : leaderboard.length === 0 ? (
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

                      <th className="text-left py-3 text-slate-400">
                        User
                      </th>

                      <th className="text-right py-3 text-slate-400">
                        Score
                      </th>

                      <th className="text-right py-3 text-slate-400">
                        EcoPoints
                      </th>

                      <th className="text-right py-3 text-slate-400">
                        Streak
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {leaderboard.map((entry) => (
                      <tr
                        key={entry.userId}
                        className="border-b border-white/5"
                      >
                        <td className="py-3 text-white font-semibold">
                          #{entry.rank}
                        </td>

                        <td className="py-3 text-slate-300">
                          {entry.userId}
                        </td>

                        <td className="py-3 text-right text-white">
                          {entry.score}
                        </td>

                        <td className="py-3 text-right text-green-400">
                          {entry.totalPoints}
                        </td>

                        <td className="py-3 text-right text-orange-400">
                          {entry.currentStreak} days
                        </td>
                      </tr>
                    ))}
                  </tbody>

                </table>

              </div>
            )}

          </GlassCard>

        </>
      )}

    </div>
  );
}