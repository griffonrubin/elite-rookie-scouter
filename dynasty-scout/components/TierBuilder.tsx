'use client';

import React, { useState, useEffect } from 'react';
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Tier, Player } from '@/lib/types';
import { DraggablePlayerCard } from './DraggablePlayerCard';
import { Button } from '@/components/ui/button';
import { Plus, GripHorizontal, Search } from 'lucide-react';

interface TierBuilderProps {
    initialTiers?: Tier[];
}

export function TierBuilder() {
    const [tiers, setTiers] = useState<Tier[]>([]);
    const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
    const [activeId, setActiveId] = useState<number | null>(null);
    const [activePlayer, setActivePlayer] = useState<Player | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [posFilter, setPosFilter] = useState<'ALL' | 'QB' | 'RB' | 'WR' | 'TE'>('ALL');

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        const loadData = async () => {
            await fetchTiers();
            await fetchAvailablePlayers();
        };
        loadData();
    }, []);

    const fetchTiers = async () => {
        try {
            const res = await fetch('/api/tiers');
            const data = await res.json();
            setTiers(data);
        } catch (error) {
            console.error('Failed to fetch tiers', error);
        }
    };

    const fetchAvailablePlayers = async () => {
        try {
            const res = await fetch('/api/players?limit=300');
            const data = await res.json();

            // Filter out players already in tiers (this logic should ideally happen on backend or efficiently here)
            // But relying on state update order might be tricky. 
            // Better: fetch all tiers first, get all player IDs, then filter the fetched players.
            // Since `fetchAvailablePlayers` runs after `fetchTiers` in `loadData`, allow checking `currentTiers` (but stale closure issue).
            // Alternatively, compute "really available" players in render or effect.
            setAvailablePlayers(data);
        } catch (error) {
            console.error('Failed to fetch players', error);
        } finally {
            setLoading(false);
        }
    };

    // Computed available players (removing those in tiers)
    const tieredPlayerIds = new Set(tiers.flatMap((t: Tier) => t.players?.map((p: Player) => p.id) || []));
    const reallyAvailablePlayers = availablePlayers
        .filter((p: Player) => !tieredPlayerIds.has(p.id))
        .filter((p: Player) => posFilter === 'ALL' || p.position === posFilter)
        .filter((p: Player) => !search.trim() || p.full_name.toLowerCase().includes(search.toLowerCase()));

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const playerId = active.id as number;
        setActiveId(playerId);

        // Find player in tiers or available list
        let player = reallyAvailablePlayers.find((p: Player) => p.id === playerId);
        if (!player) {
            for (const tier of tiers) {
                const found = tier.players?.find((p: Player) => p.id === playerId);
                if (found) {
                    player = found;
                    break;
                }
            }
        }
        setActivePlayer(player || null);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        // This is mainly for visual placeholder logic during drag
        // dnd-kit handles sorting strategy visual updates automatically with SortableContext
        // We generally don't modify state in DragOver for complex structure unless using specific strategy
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        setActivePlayer(null);

        if (!over) return;

        const activeId = active.id as number;
        const overId = over.id; // Could be a player ID or a tier ID (container)

        // Identify Source and Destination Containers
        const activeContainer = findContainer(activeId);
        const overContainer = findContainer(overId);

        if (!activeContainer || !overContainer) return;

        // Same Container Reordering
        if (activeContainer === overContainer) {
            // Only if reordering within a tier
            if (activeContainer !== 'available') {
                const tierIndex = tiers.findIndex(t => t.id === activeContainer);
                const tier = tiers[tierIndex];
                const oldIndex = tier.players?.findIndex(p => p.id === activeId);
                const newIndex = tier.players?.findIndex(p => p.id === overId); // overId is player ID here

                if (tierIndex !== -1 && oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
                    const newPlayers = arrayMove(tier.players!, oldIndex, newIndex);
                    const newTiers = [...tiers];
                    newTiers[tierIndex] = { ...tier, players: newPlayers };
                    setTiers(newTiers);
                    // TODO: Persist via API
                }
            }
        }
        // Different Container (Move)
        else {
            // Moving from 'available' to a tier
            // Or moving from a tier to another tier
            // Or moving from a tier to 'available' (unranking)

            // 1. Remove from source
            let player: Player | undefined;
            if (activeContainer === 'available') {
                player = reallyAvailablePlayers.find(p => p.id === activeId);
                // No need to manually remove from 'availablePlayers' state if we rely on `tieredPlayerIds` filter,
                // but we need to Add to tier state so the filter picks it up.
            } else {
                const sourceTier = tiers.find(t => t.id === activeContainer);
                player = sourceTier?.players?.find(p => p.id === activeId);

                // Optimistic update: Remove from source tier
                setTiers(tiers.map(t => {
                    if (t.id === activeContainer) {
                        return { ...t, players: t.players?.filter(p => p.id !== activeId) || [] };
                    }
                    return t;
                }));
                // API Call to remove from tier
                fetch(`/api/tiers/${activeContainer}/players`, {
                    method: 'DELETE',
                    body: JSON.stringify({ player_id: activeId })
                });
            }

            // 2. Add to destination
            if (overContainer !== 'available' && player) {
                const destTierId = overContainer as number; // Safe assumption if it's not 'available'

                // Optimistic update: Add to dest tier
                setTiers(prev => prev.map(t => {
                    if (t.id === destTierId) {
                        return { ...t, players: [...(t.players || []), player!] };
                    }
                    return t;
                }));

                // API Call to add to dest tier
                fetch(`/api/tiers/${destTierId}/players`, {
                    method: 'POST',
                    body: JSON.stringify({ player_id: activeId, player_order: 999 })
                });
            }
        }
    };

    // Helpers
    const findTierByPlayerId = (playerId: UniqueIdentifier) => {
        return tiers.find((tier: Tier) => tier.players?.some((p: Player) => p.id === playerId));
    };

    const findTierById = (tierId: UniqueIdentifier) => {
        return tiers.find((tier: Tier) => tier.id === tierId);
    };

    const findContainer = (id: UniqueIdentifier) => {
        if (reallyAvailablePlayers.some((p: Player) => p.id === id) || id === 'available') {
            return 'available';
        }

        // Is it a tier ID directly? (Dropping on empty tier placeholder)
        const tierDirect = tiers.find((t: Tier) => t.id === id);
        if (tierDirect) return tierDirect.id;

        // Is it a player in a tier?
        const tierWithPlayer = tiers.find((t: Tier) => t.players?.some((p: Player) => p.id === id));
        if (tierWithPlayer) return tierWithPlayer.id;

        return null;
    };

    if (loading) return <div>Loading tiers...</div>;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex flex-col md:flex-row gap-4 md:gap-6 h-auto md:h-[calc(100vh-100px)]">
                {/* Available Pool */}
                <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-white/[0.05] pb-4 md:pb-0 md:pr-4 flex flex-col overflow-hidden max-h-[50vh] md:max-h-none">
                    {/* Sticky controls */}
                    <div className="sticky top-0 z-10 bg-background pb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 mb-3">Available Players</h3>
                        {/* Search */}
                        <div className="relative mb-2">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                            <input
                                placeholder="Search players..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-card border border-border/40 rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                            />
                        </div>
                        {/* Position filters */}
                        <div className="flex gap-1">
                            {(['ALL','QB','RB','WR','TE'] as const).map(pos => (
                                <button
                                    key={pos}
                                    onClick={() => setPosFilter(pos)}
                                    className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${posFilter === pos ? 'bg-primary text-white' : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                                >
                                    {pos}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Player list */}
                    <div className="overflow-y-auto flex-1">
                    <SortableContext
                        id="available"
                        items={reallyAvailablePlayers.map(p => p.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-1">
                            {reallyAvailablePlayers.map(player => (
                                <DraggablePlayerCard key={player.id} player={player} />
                            ))}
                            {reallyAvailablePlayers.length === 0 && (
                                <div className="text-muted-foreground/50 text-xs py-4 text-center">
                                    {search || posFilter !== 'ALL' ? 'No players match filters' : 'No players available'}
                                </div>
                            )}
                        </div>
                    </SortableContext>
                    </div>
                </div>

                {/* Tiers Area */}
                <div className="w-full md:w-2/3 space-y-4 md:space-y-6 overflow-y-auto pb-20">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold tracking-tight">My Rankings</h2>
                        <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Tier</Button>
                    </div>

                    <div className="space-y-5">
                        {tiers.map((tier, idx) => {
                            // Map tier index to refined accent colors
                            const tierAccents = ['#f97316', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa'];
                            const accent = tierAccents[idx % tierAccents.length];
                            return (
                            <div key={tier.id} className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'var(--bg-card)' }}>
                                {/* Tier Header */}
                                <div
                                    className="px-4 py-3 flex items-center justify-between"
                                    style={{
                                        background: `linear-gradient(90deg, ${accent}18, transparent 60%)`,
                                        borderLeft: `3px solid ${accent}`,
                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    }}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <GripHorizontal className="w-4 h-4 opacity-30 cursor-grab" />
                                        <span className="font-bold text-sm" style={{ color: accent }}>{tier.tier_name}</span>
                                        <span className="text-xs text-muted-foreground/40 font-semibold">({tier.players?.length || 0})</span>
                                    </div>
                                </div>

                                {/* Sortable Area */}
                                <div className="p-3">
                                    <DroppableTier tierId={tier.id}>
                                        <SortableContext
                                            id={tier.id.toString()}
                                            items={tier.players?.map(p => p.id) || []}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            <div className="space-y-2">
                                                {tier.players?.map((player, index) => (
                                                    <DraggablePlayerCard
                                                        key={player.id}
                                                        player={player}
                                                        rank={index + 1}
                                                    />
                                                ))}
                                                {tier.players?.length === 0 && (
                                                    <div className="text-center text-xs text-muted-foreground/30 py-5 border-dashed border border-white/[0.05] rounded-xl">
                                                        Drop players here
                                                    </div>
                                                )}
                                            </div>
                                        </SortableContext>
                                    </DroppableTier>
                                </div>
                            </div>
                        );})}
                    </div>
                </div>
            </div>

            <DragOverlay>
                {activePlayer ? (
                    <div className="opacity-90 rotate-2 scale-105 cursor-grabbing w-64">
                        {/* Force width for overlay */}
                        <DraggablePlayerCard player={activePlayer} rank={0} />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

// Helper types for dnd-kit
type UniqueIdentifier = string | number;

function DroppableTier({ tierId, children }: { tierId: number; children: React.ReactNode }) {
    const { setNodeRef } = useDroppable({ id: tierId });
    return (
        <div ref={setNodeRef} className="min-h-[60px]">
            {children}
        </div>
    );
}
