import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/earn/ad-config
 *
 * Returns the active ad networks from admin_config.
 * Handles all storage formats:
 *   - PerNetworkConfig: { monetag: { rewardedZoneId: "xxx" } }
 *   - Array:            [{ networkId: "monetag", fields: { rewardedZoneId: "xxx" } }]
 *   - Legacy:           { primary: "monetag", monetagZoneId: "xxx" }
 */

const KNOWN_NETWORKS = [
  "monetag","admob","unity","applovin","ironsource",
  "facebook","vungle","chartboost","mintegral",
];

function isPerNetwork(obj: unknown): obj is Record<string, Record<string, string>> {
  return (
    !!obj &&
    typeof obj === "object" &&
    !Array.isArray(obj) &&
    Object.keys(obj as object).some((k) => KNOWN_NETWORKS.includes(k))
  );
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("admin_config")
      .select("ad_networks")
      .eq("id", 1)
      .maybeSingle();

    const stored = data?.ad_networks as unknown;
    let activeNetworks: { networkId: string; fields: Record<string, string> }[] = [];

    if (Array.isArray(stored) && stored.length > 0) {
      // Already in array format
      activeNetworks = stored as { networkId: string; fields: Record<string, string> }[];
    } else if (isPerNetwork(stored)) {
      // Admin panel saves as { monetag: { rewardedZoneId: "xxx" }, ... }
      activeNetworks = Object.entries(stored)
        .filter(([, fields]) => {
          const f = fields as Record<string, string>;
          return Object.keys(f).length > 0 &&
            Object.values(f).some((v) => v && String(v).trim() !== "");
        })
        .map(([networkId, fields]) => ({ networkId, fields: fields as Record<string, string> }));
    } else if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      // Legacy: { primary: "monetag", monetagZoneId: "xxx" }
      const legacy = stored as Record<string, string>;
      const networkId = legacy.primary ?? legacy.networkId ?? "monetag";
      const fields: Record<string, string> = {};
      if (legacy.rewardedZoneId)     fields.rewardedZoneId     = legacy.rewardedZoneId;
      if (legacy.monetagZoneId)      fields.rewardedZoneId     = legacy.monetagZoneId;
      if (legacy.interstitialZoneId) fields.interstitialZoneId = legacy.interstitialZoneId;
      if (Object.keys(fields).length > 0) {
        activeNetworks = [{ networkId, fields }];
      }
    }

    return NextResponse.json({
      activeNetworks,
      adsEnabled: activeNetworks.length > 0,
    });
  } catch {
    return NextResponse.json({ activeNetworks: [], adsEnabled: false });
  }
}
