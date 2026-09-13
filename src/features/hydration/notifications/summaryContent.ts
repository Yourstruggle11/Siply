/**
 * Scheduled summaries cannot safely embed progress because their content is
 * created ahead of delivery. Keep the message state-independent and route the
 * action to the live History screen instead.
 */
export const buildDailySummaryBody = () =>
  "Your hydration window is ending. Open Siply to review today's progress.";
