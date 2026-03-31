import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const POS_COLORS: Record<string, string> = {
    QB: "#ef4444",
    RB: "#38bdf8",
    WR: "#34d399",
    TE: "#a78bfa",
};

const TIER_COLORS: Record<string, string> = {
    "S Tier": "#f97316",
    "A Tier": "#22c55e",
    "B Tier": "#38bdf8",
    "C Tier": "#a78bfa",
    "D Tier": "#f59e0b",
};

export async function GET(req: NextRequest) {
    const p = req.nextUrl.searchParams;
    const name   = p.get("name")  || "Unknown Player";
    const pos    = p.get("pos")   || "RB";
    const school = p.get("school")|| "";
    const rank   = p.get("rank")  || "—";
    const tier   = p.get("tier")  || "";
    const forty  = p.get("forty") || "";
    const ras    = p.get("ras")   || "";
    const stats = [0, 1, 2]
        .map(i => ({ label: p.get("s" + i + "l") || "", value: p.get("s" + i + "v") || "—" }))
        .filter(s => s.label);

    const posColor  = POS_COLORS[pos]  || "#a78bfa";
    const tierColor = TIER_COLORS[tier] || "#f97316";

    return new ImageResponse(
        (
            <div style={{ width: 1200, height: 630, background: "linear-gradient(135deg, #060a10 0%, #0d1420 60%, #060a10 100%)", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, sans-serif", padding: "52px 64px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: "#f97316" }} />
                <div style={{ position: "absolute", right: 48, top: "50%", transform: "translateY(-50%)", fontSize: 320, fontWeight: 900, color: "rgba(255,255,255,0.025)", lineHeight: 1, display: "flex" }}>{pos}</div>
                <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 28 }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ fontSize: 72, fontWeight: 900, color: "#f1f5f9", lineHeight: 1, letterSpacing: -2 }}>{name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ background: posColor + "22", border: "2px solid " + posColor + "55", color: posColor, fontSize: 17, fontWeight: 800, padding: "5px 16px", borderRadius: 999, display: "flex" }}>{pos}</div>
                            {school && <div style={{ color: "#94a3b8", fontSize: 20, display: "flex" }}>{school}</div>}
                            {forty && <div style={{ color: "#64748b", fontSize: 18, display: "flex" }}>· {forty}s 40yd</div>}
                            {ras && <div style={{ color: "#64748b", fontSize: 18, display: "flex" }}>· {ras} RAS</div>}
                        </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginLeft: 32 }}>
                        <div style={{ fontSize: 90, fontWeight: 900, color: tierColor, lineHeight: 1, display: "flex" }}>#{rank}</div>
                        {tier && <div style={{ color: tierColor, fontSize: 15, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase", display: "flex" }}>{tier}</div>}
                    </div>
                </div>
                <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 28 }} />
                {stats.length > 0 && (
                    <div style={{ display: "flex", gap: 16, flex: 1 }}>
                        {stats.map((s, i) => (
                            <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "24px 28px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, display: "flex" }}>{s.label}</div>
                                <div style={{ color: "#f1f5f9", fontSize: 44, fontWeight: 900, lineHeight: 1, display: "flex" }}>{s.value}</div>
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ position: "absolute", bottom: 32, left: 64, right: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ color: "#334155", fontSize: 16, fontWeight: 600, display: "flex" }}>dycharts.com</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 999, background: "#f97316", display: "flex" }} />
                        <div style={{ color: "#f97316", fontSize: 16, fontWeight: 700, display: "flex" }}>2026 Dynasty Draft · DyCharts</div>
                    </div>
                </div>
            </div>
        ),
        { width: 1200, height: 630 }
    );
}
