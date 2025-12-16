/**
 * Format duration in human-readable format (e.g., "2d 5h 30m")
 *
 * @param durationMs - Duration in milliseconds
 * @returns Formatted string like "2d 5h 30m" or "N/A" if invalid
 */
export function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) {
    return 'N/A';
  }

  const totalMinutes = Math.floor(durationMs / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(' ');
}
