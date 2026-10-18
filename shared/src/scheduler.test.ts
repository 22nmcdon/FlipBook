import { describe, expect, it } from 'vitest';
import { seededRng } from './rng';
import { assignRound, type ChainSlot } from './scheduler';

interface Sim {
  chains: ChainSlot[];
  counts: Map<string, number>;
  /** Per-round assignments, for inspecting what happened. */
  rounds: Map<string, string>[];
}

/** Play a whole Relay game: round 0 is owners drawing frame 1, then the scheduler takes over. */
function simulate(
  playerCount: number,
  targetFrames: number,
  seed: string,
  dropAfterRound?: { round: number; player: string },
): Sim {
  let players = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  const chains: ChainSlot[] = players.map((p) => ({ id: `c-${p}`, ownerId: p, frames: 1, lastDrawerId: p }));
  const counts = new Map<string, number>();
  const rng = seededRng(seed);
  const rounds: Map<string, string>[] = [];

  for (let round = 1; round < 200; round++) {
    if (dropAfterRound && round === dropAfterRound.round) {
      players = players.filter((p) => p !== dropAfterRound.player);
    }
    if (chains.every((c) => c.frames >= targetFrames)) break;
    const assignment = assignRound({
      players,
      chains,
      targetFrames,
      count: (p, c) => counts.get(`${p}|${c}`) ?? 0,
      rng,
    });
    expect(assignment.size).toBeGreaterThan(0);
    // Nobody draws two chains in one round.
    expect(new Set(assignment.values()).size).toBe(assignment.size);
    for (const [chainId, playerId] of assignment) {
      const chain = chains.find((c) => c.id === chainId)!;
      expect(players).toContain(playerId);
      chain.frames++;
      chain.lastDrawerId = playerId;
      counts.set(`${playerId}|${chainId}`, (counts.get(`${playerId}|${chainId}`) ?? 0) + 1);
    }
    rounds.push(assignment);
  }
  return { chains, counts, rounds };
}

describe('assignRound', () => {
  for (const n of [3, 4, 5, 6, 8, 10, 12]) {
    it(`with ${n} players: every chain fills in exactly frameCount - 1 rounds`, () => {
      for (let s = 0; s < 50; s++) {
        const { chains, rounds } = simulate(n, 20, `room-${n}-${s}`);
        expect(rounds.length).toBe(19);
        expect(chains.every((c) => c.frames === 20)).toBe(true);
      }
    });
  }

  it('never assigns your own chain, and never the same chain twice in a row', () => {
    for (const n of [3, 4, 5, 7, 9]) {
      for (let s = 0; s < 50; s++) {
        const { rounds, chains } = simulate(n, 16, `rules-${n}-${s}`);
        const last = new Map(chains.map((c) => [c.id, c.ownerId]));
        for (const round of rounds) {
          for (const [chainId, playerId] of round) {
            expect(chainId).not.toBe(`c-${playerId}`);
            expect(last.get(chainId)).not.toBe(playerId);
            last.set(chainId, playerId);
          }
        }
      }
    }
  });

  it('keeps contributions balanced with 5+ players', () => {
    for (const n of [5, 6, 8]) {
      for (let s = 0; s < 30; s++) {
        const { counts } = simulate(n, 20, `balance-${n}-${s}`);
        const fair = Math.ceil(19 / (n - 1));
        for (const c of counts.values()) expect(c).toBeLessThanOrEqual(fair);
      }
    }
  });

  it('is reproducible from the seed', () => {
    const a = simulate(6, 20, 'same-seed').rounds.map((r) => [...r]);
    const b = simulate(6, 20, 'same-seed').rounds.map((r) => [...r]);
    expect(a).toEqual(b);
  });

  it('finishes every chain after a player drops out mid-game', () => {
    for (const n of [4, 5, 6]) {
      for (let s = 0; s < 30; s++) {
        const { chains } = simulate(n, 20, `drop-${n}-${s}`, { round: 6, player: 'p1' });
        expect(chains.every((c) => c.frames === 20)).toBe(true);
      }
    }
  });

  it('still makes progress with only two players left', () => {
    const { chains } = simulate(3, 12, 'two-left', { round: 3, player: 'p2' });
    expect(chains.every((c) => c.frames === 12)).toBe(true);
  });
});
