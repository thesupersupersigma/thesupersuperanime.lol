import { providers as coreProviders } from "@/lib/core";
import type { BaseProvider as CoreBaseProvider } from "@tsss/core";
import type { BaseProvider, ProviderCheckResult } from "./base";

// ── Bridge adapter ───────────────────────────────────────────────────────────
// Wraps core providers (which have findEpisodeId, getSources, check) to match
// the simpler Phase 2 dashboard interface (which only needs id, displayName, check)

class CoreProviderAdapter implements BaseProvider {
  id: string;
  displayName: string;
  private coreProvider: CoreBaseProvider;

  constructor(coreProvider: CoreBaseProvider) {
    this.id = coreProvider.id;
    this.displayName = coreProvider.displayName;
    this.coreProvider = coreProvider;
  }

  async check(): Promise<ProviderCheckResult> {
    const result = await this.coreProvider.check();
    return {
      success: result.success,
      latencyMs: result.latencyMs,
      error: result.error,
    };
  }
}

// ── Provider registry ─────────────────────────────────────────────────────────
// Wraps all real core providers for the dashboard

export const providers: BaseProvider[] = (coreProviders as CoreBaseProvider[]).map(
  (p) => new CoreProviderAdapter(p)
);

/** Look up a single provider by its ID */
export function getProvider(id: string): BaseProvider | undefined {
  return providers.find((p) => p.id === id);
}
