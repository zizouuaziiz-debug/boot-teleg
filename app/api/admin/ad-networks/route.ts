import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifySessionToken, COOKIE_NAME } from "@/lib/admin-auth";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

type NetworkFields = Record<string, string>;
type PerNetworkConfig = Record<string, NetworkFields>;

type LegacyConfig = {
  primary?: string;
  rewardedZoneId?: string;
  monetagZoneId?: string;
};

const KNOWN_NETWORKS = [
  "admob",
  "unity",
  "applovin",
  "ironsource",
  "facebook",
  "vungle",
  "chartboost",
  "mintegral",
  "monetag",
];

function isPerNetwork(obj: any): obj is PerNetworkConfig {
  return (
    obj &&
    typeof obj === "object" &&
    !Array.isArray(obj) &&
    Object.keys(obj).some((k) => KNOWN_NETWORKS.includes(k))
  );
}

function isLegacy(obj: any): obj is LegacyConfig {
  return obj && typeof obj === "object" && !Array.isArray(obj);
}

/**
 * GET
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("admin_config")
    .select("ad_networks")
    .eq("id", 1)
    .maybeSingle();

  // ✅ FIX: force safe type
  const stored: any = data?.ad_networks;

  let configs: PerNetworkConfig = {};

  if (isPerNetwork(stored)) {
    configs = stored;
  } 
  else if (isLegacy(stored)) {
    const networkId = stored.primary ?? "monetag";

    const fields: NetworkFields = {};

    if (stored.rewardedZoneId) {
      fields.rewardedZoneId = stored.rewardedZoneId;
    }

    if (stored.monetagZoneId) {
      fields.rewardedZoneId = stored.monetagZoneId; // ✅ FIXED
    }

    configs[networkId] = fields;
  }

  return NextResponse.json({ configs });
}

/**
 * POST
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) return unauthorized();

  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));

  const { networkId, fields, connected } = body as {
    networkId?: string;
    fields?: NetworkFields;
    connected?: boolean;
  };

  if (!networkId) {
    return NextResponse.json({ error: "networkId is required" }, { status: 400 });
  }

  const { data } = await supabase
    .from("admin_config")
    .select("ad_networks")
    .eq("id", 1)
    .maybeSingle();

  let current: PerNetworkConfig = {};

  const stored: any = data?.ad_networks; // ✅ FIX

  if (isPerNetwork(stored)) {
    current = stored;
  }

  if (connected === false) {
    delete current[networkId];
  } else {
    current[networkId] = fields ?? {};
  }

  const { error } = await supabase.from("admin_config").upsert({
    id: 1,
    ad_networks: current,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
