// Not importing sqlite anymore
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { TeamNeedsChart } from "@/components/TeamNeedsChart";

export const dynamic = "force-dynamic";

interface PageProps {
    params: { slug: string };
}

async function getTeamData(slug: string) {
    try {
        // Mock team data for now since we didn't fully seed nfl_teams table with logos/colors
        // But in real SQLite impl:
        // const team = sqlite.prepare("SELECT * FROM nfl_teams WHERE abbreviation = ?").get(slug);

        // Return Mock for reliability until nfl_teams is seeded
        return {
            team: {
                id: 1, name: "Chicago Bears", code: "CHI", conference: "NFC", division: "North", log_url: ""
            },
            needs: [
                { position: "QB", severity: 10 },
                { position: "WR", severity: 8 },
                { position: "EDGE", severity: 7 },
                { position: "C", severity: 6 },
                { position: "DT", severity: 5 }
            ],
            cap_space: 62.5 // Millions
        };
    } catch (e) {
        return null;
    }
}

export default async function TeamPage({ params }: PageProps) {
    const data = await getTeamData(params.slug);

    if (!data) return <div>Team not found</div>;

    const { team, needs, cap_space } = data;

    return (
        <main className="min-h-screen bg-background text-foreground p-4 sm:p-8 max-w-7xl mx-auto">
            <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Board
            </Link>

            <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center font-bold text-2xl">
                    {team.code}
                </div>
                <div>
                    <h1 className="text-3xl font-bold">{team.name}</h1>
                    <div className="text-muted-foreground">{team.conference} {team.division}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Needs Chart */}
                <div>
                    <TeamNeedsChart
                        teamName={team.name}
                        needs={needs}
                        capSpace={cap_space}
                    />
                </div>

                {/* Depth Chart (Future) */}
                <div className="bg-card border rounded-lg p-6">
                    <h3 className="font-semibold mb-4">Projected Depth Chart</h3>
                    <div className="flex items-center justify-center h-48 text-muted-foreground border border-dashed rounded">
                        Full Depth Chart Coming Soon
                    </div>
                </div>
            </div>
        </main>
    );
}
