/** Human wording for a pre-booked pickup time — "today at 14:30",
 *  "tomorrow at 09:00", or "Sat 8 Aug at 09:00". */
export function formatScheduledTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) {
    return `today at ${time}`;
  }
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  if (d.toDateString() === tomorrow.toDateString()) {
    return `tomorrow at ${time}`;
  }
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} at ${time}`;
}

/** True when a pre-booked pickup time is still meaningfully in the future */
export function isUpcoming(scheduledFor: number | null | undefined): scheduledFor is number {
  return typeof scheduledFor === 'number' && scheduledFor > Date.now() + 60 * 1000;
}
