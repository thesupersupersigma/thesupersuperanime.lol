import { db } from "@/lib/db";
import { providers, getProvider } from "@/providers/index";
import type { BaseProvider } from "@/providers/base";
import { sendProviderAlert, sendProviderRecovery } from "@/lib/discord";

export interface CheckSummary {
  providerId: string;
  displayName: string;
  success: boolean;
  latencyMs: number;
  status: string;
  consecutiveFails: number;
  error?: string;
}

/**
 * Run a health check for a single provider and persist the result.
 * Handles DB writes, Discord alerts, and recovery notifications.
 */
export async function runProviderCheck(
  provider: BaseProvider
): Promise<CheckSummary> {
  const now = new Date();

  // Fetch existing status for this provider (if any)
  const existing = await db.providerStatus.findUnique({
    where: { providerId: provider.id },
  });

  let result;
  try {
    result = await provider.check();
  } catch (err) {
    result = {
      success: false,
      latencyMs: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }

  // Determine new consecutive fail count
  const prevFails = existing?.consecutiveFails ?? 0;
  const consecutiveFails = result.success ? 0 : prevFails + 1;

  // Determine status label
  let status: string;
  if (!result.success) {
    status = consecutiveFails >= 3 ? "broken" : "degraded";
  } else if (result.latencyMs > 2000) {
    status = "degraded";
  } else {
    status = "healthy";
  }

  // Upsert ProviderStatus
  await db.providerStatus.upsert({
    where: { providerId: provider.id },
    create: {
      providerId: provider.id,
      displayName: provider.displayName,
      status,
      latencyMs: result.latencyMs,
      lastCheckedAt: now,
      lastSuccessAt: result.success ? now : null,
      consecutiveFails,
      errorMessage: result.error ?? null,
    },
    update: {
      displayName: provider.displayName,
      status,
      latencyMs: result.latencyMs,
      lastCheckedAt: now,
      lastSuccessAt: result.success ? now : existing?.lastSuccessAt ?? null,
      consecutiveFails,
      errorMessage: result.error ?? null,
    },
  });

  // Append to log
  await db.providerLog.create({
    data: {
      providerId: provider.id,
      level: result.success ? "success" : consecutiveFails >= 3 ? "error" : "warn",
      message: result.success
        ? `Check passed in ${result.latencyMs}ms`
        : `Check failed: ${result.error ?? "unknown error"}`,
      latencyMs: result.latencyMs,
    },
  });

  // ── Discord alerts ─────────────────────────────────────────────────────────

  // Alert when we cross the 3-fail threshold (exactly at 3, not every time after)
  if (consecutiveFails === 3) {
    await sendProviderAlert({
      providerId: provider.id,
      displayName: provider.displayName,
      consecutiveFails,
      errorMessage: result.error ?? "unknown error",
      lastSuccessAt: existing?.lastSuccessAt ?? null,
    });
  }

  // Recovery notification: was broken/degraded, now healthy
  if (result.success && prevFails >= 3) {
    const downSinceMs =
      existing?.lastSuccessAt != null
        ? Date.now() - existing.lastSuccessAt.getTime()
        : null;

    await sendProviderRecovery(
      provider.id,
      provider.displayName,
      result.latencyMs,
      downSinceMs
    );
  }

  return {
    providerId: provider.id,
    displayName: provider.displayName,
    success: result.success,
    latencyMs: result.latencyMs,
    status,
    consecutiveFails,
    error: result.error,
  };
}

/**
 * Run checks for all registered providers concurrently.
 */
export async function runAllProviderChecks(): Promise<CheckSummary[]> {
  const results = await Promise.allSettled(
    providers.map((p) => runProviderCheck(p))
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // If the check itself threw unexpectedly, return a failed summary
    return {
      providerId: providers[i].id,
      displayName: providers[i].displayName,
      success: false,
      latencyMs: 0,
      status: "broken",
      consecutiveFails: 0,
      error: r.reason instanceof Error ? r.reason.message : "Unknown error",
    };
  });
}

/**
 * Run a check for one provider by ID.
 */
export async function runSingleProviderCheck(
  providerId: string
): Promise<CheckSummary | null> {
  const provider = getProvider(providerId);
  if (!provider) return null;
  return runProviderCheck(provider);
}
