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
import { Plus, GripHorizontal, Trash2 } from 'lucide-react';

interface TierBuilderProps {
    initialTiers?: Tier[];
}

export function TierBuilder() {
    const [tiers, setTiers] = useState<Tier[]>([]);
    const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
    const [activeId, setActiveId] = useState<number | null>(null);
    const [activePlayer, setActivePlayer] = useState<Player | null>(null);
    const [loading, setLoading] = useState(true);

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
            const res = await fetch('/api/players?limit=100');
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
    const reallyAvailablePlayers = availablePlayers.filter((p: Player) => !tieredPlayerIds.has(p.id));

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
            <div className="flex gap-6 h-[calc(100vh-100px)]">
                {/* Available Pool */}
                <div className="w-1/3 border-r pr-4 overflow-y-auto">
                    <h3 className="font-bold mb-4 sticky top-0 bg-background py-2">Available Players</h3>
                    <SortableContext
                        id="available"
                        items={reallyAvailablePlayers.map(p => p.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-2">
                            {reallyAvailablePlayers.map(player => (
                                <DraggablePlayerCard key={player.id} player={player} />
                            ))}
                            {reallyAvailablePlayers.length === 0 && <div className="text-muted-foreground text-sm">No players available</div>}
                        </div>
                    </SortableContext>
                </div>

                {/* Tiers Area */}
                <div className="w-2/3 space-y-6 overflow-y-auto pb-20">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold tracking-tight">My Rankings</h2>
                        <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Tier</Button>
                    </div>

                    <div className="space-y-4">
                        {tiers.map((tier) => (
                            <div key={tier.id} className="border rounded-lg bg-card/50">
                                {/* Tier Header */}
                                <div className={`p-3 rounded-t-lg flex items-center justify-between ${tier.tier_color.replace('text-', 'bg-').replace('/10', '/80')} text-white`}>
                                    <div className="flex items-center gap-2">
                                        <GripHorizontal className="w-4 h-4 opacity-50 cursor-grab" />
                                        <span className="font-bold">{tier.tier_name}</span>
                                        <span className="text-xs opacity-80">({tier.players?.length || 0})</span>
                                    </div>
                                    {/* <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-white/20"><Trash2 className="w-3 h-3" /></Button> */}
                                </div>

                                {/* Sortable Area */}
                                <div className="p-2 min-h-[50px]">
                                    <SortableContext
                                        id={tier.id.toString()} // Use string ID for context
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
                                                <div className="text-center text-xs text-muted-foreground py-4 border-dashed border-2 border-border/50 rounded-md">
                                                    Drop players here
                                                </div>
                                            )}
                                        </div>
                                    </SortableContext>
                                </div>
                            </div>
                        ))}
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
