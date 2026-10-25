export const metricTypes = ["site_error", "site_performance", "page_view", "engagement", "game_start", "game_complete", "game_choice", "wall_submit", "education_interaction", "puff_start", "puff_complete", "puff_clue", "inside_start", "inside_complete", "skyfront_start", "skyfront_resume", "skyfront_tutorial_step", "skyfront_tutorial_complete", "skyfront_tutorial_skip", "skyfront_mission_start", "skyfront_mission_complete", "skyfront_campaign_complete", "skyfront_exit", "skyfront_error", "hub_launch", "hub_download"] as const;
export type MetricType = typeof metricTypes[number];
export function trackMetric(type: MetricType, detail: Record<string, string | number> = {}) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("relight:metric", { detail: { type, ...detail } }));
}
