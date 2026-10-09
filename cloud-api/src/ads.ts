/**
 * Rewarded-ads layer — provider-agnostic, server-authoritative.
 *
 * A rewarded ad completion is only accepted when a REAL ad provider is
 * configured and cryptographically verifies the completion proof. If no
 * provider is configured the acquisition flow stays unavailable: the API
 * returns 503 ADS_UNAVAILABLE and no progress/ownership is ever granted.
 *
 * There is intentionally NO endpoint that trusts a client saying
 * "the user watched an ad". The client only forwards the provider's
 * completion proof; the server verifies it.
 */

export interface RewardedAdVerification {
  /** true only when the provider cryptographically confirmed the completion */
  verified: boolean;
  /** provider's unique completion/token id — used as the replay barrier */
  providerCompletionId?: string;
  reason?: string;
}

export interface RewardedAdProvider {
  name: string;
  /**
   * Verify a completion proof against the provider. Must perform a real
   * verification call/check — never trust the caller.
   */
  verifyCompletion(proof: string, context: { userId: string; itemKind: string; itemId: string }): Promise<RewardedAdVerification>;
}

/**
 * Ad providers are registered here as real integrations become available.
 * VOXELPLUS_AD_PROVIDER selects the provider name; each provider needs its
 * own server-side credentials (never shipped to the client).
 */
const providers = new Map<string, RewardedAdProvider>();

export function registerAdProvider(provider: RewardedAdProvider): void {
  providers.set(provider.name, provider);
}

/** The configured provider, or null when none is set up — ads stay unavailable. */
export function getAdProvider(): RewardedAdProvider | null {
  const name = process.env.VOXELPLUS_AD_PROVIDER;
  if (!name) return null;
  return providers.get(name) ?? null;
}

/** Server-side ad costs. Never trust client-supplied costs. */
export const ADS_REQUIRED: Record<'cosmetic' | 'vpack', (meta: { rarity?: string }) => number> = {
  cosmetic: ({ rarity }) => ({ common: 2, rare: 3, epic: 4, legendary: 5 } as Record<string, number>)[rarity || 'common'] ?? 2,
  vpack: () => 1
};
