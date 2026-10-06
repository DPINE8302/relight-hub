export const metricTypes = ["page_view", "engagement", "game_start", "game_complete", "game_choice", "wall_submit", "education_interaction", "puff_start", "puff_complete", "puff_clue", "inside_start", "inside_complete"] as const;
export type MetricType = typeof metricTypes[number];
export function trackMetric(type: MetricType, detail: Record<string, string | number> = {}) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("relight:metric", { detail: { type, ...detail } }));
}
