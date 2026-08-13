/**
 * Status vocabulary, split out so the pure rules in status-rules.ts can be
 * imported without pulling in status.ts's database dependency.
 */
export type ServiceStatus = "operational" | "degraded" | "outage" | "unknown";
export type OverallStatus = "operational" | "degraded" | "outage";
export type ServiceGroup = "infrastructure" | "providers";
