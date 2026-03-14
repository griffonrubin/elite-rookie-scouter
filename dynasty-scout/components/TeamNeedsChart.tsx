'use client';

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TeamNeedsProps {
    teamName: string;
    needs: { position: string; severity: number }[]; // severity 1-10
    capSpace: number; // Millions
}

export function TeamNeedsChart({ teamName, needs, capSpace }: TeamNeedsProps) {
    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <span>{teamName} Team Needs</span>
                    <Badge variant={capSpace > 0 ? "default" : "destructive"}>
                        ${capSpace}M Cap Space
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={needs} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" domain={[0, 10]} hide />
                            <YAxis
                                dataKey="position"
                                type="category"
                                width={40}
                                tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ borderRadius: '8px' }}
                            />
                            <Bar
                                dataKey="severity"
                                fill="hsl(var(--primary))"
                                radius={[0, 4, 4, 0]}
                                barSize={20}
                                background={{ fill: 'hsl(var(--muted))' }}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
