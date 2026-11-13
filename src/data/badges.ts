export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  tier: 'bronze' | 'silver' | 'gold';
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: 'first-log', title: 'First Entry', description: 'Logged your first real self-care task or tracker metric.', tier: 'bronze' },
  { id: 'streak-3', title: '3-Day Momentum', description: 'Completed planned protocol tasks 3 days in a row.', tier: 'bronze' },
  { id: 'streak-7', title: '7-Day Standard', description: 'Maintained a full 7-day consistency streak.', tier: 'silver' },
  { id: 'streak-30', title: '30-Day Discipline', description: 'Sustained a 30-day self-care streak.', tier: 'gold' },
  { id: 'first-scan', title: 'Baseline Scan', description: 'Completed your first on-device PSL LAB scan.', tier: 'bronze' },
  { id: 'rescan-3', title: 'Steady Check-Ins', description: 'Logged 3+ PSL LAB scans across your timeline.', tier: 'silver' },
  { id: 'spf-14', title: 'UV Guardian', description: 'Checked off daily SPF protection 14+ times.', tier: 'silver' },
  { id: 'spf-56', title: '8 Weeks of SPF', description: 'Logged 56 days of daily sun protection.', tier: 'gold' },
  { id: 'workout-10', title: 'Iron Habit', description: 'Logged 10 progressive training sessions.', tier: 'silver' },
  { id: 'workout-30', title: '30 Workouts', description: 'Logged 30 real workouts in your training log.', tier: 'gold' },
  { id: 'skin-diary-7', title: 'Skin Observer', description: 'Recorded 7 skin diary entries in Skin Lab.', tier: 'bronze' },
  { id: 'level-5', title: 'Level 5 Operator', description: 'Reached Level 5 through consistent daily execution.', tier: 'silver' },
];

export function getRankForLevel(level: number): string {
  if (level >= 20) return 'Mastery';
  if (level >= 12) return 'Vanguard';
  if (level >= 7) return 'Disciplined';
  if (level >= 4) return 'Builder';
  return 'Initiate';
}

export function xpRequiredForLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.3));
}
