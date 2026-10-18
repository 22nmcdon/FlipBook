import { shuffle, type Rng } from './rng';

export interface ChainSlot {
  id: string;
  ownerId: string;
  /** Frames drawn so far (frame 1 counts). */
  frames: number;
  lastDrawerId: string | null;
}

export interface AssignInput {
  /** Players available to draw this round. */
  players: readonly string[];
  chains: readonly ChainSlot[];
  /** Frames every chain should end up with. */
  targetFrames: number;
  /** How many frames `playerId` has already drawn on `chainId`. */
  count: (playerId: string, chainId: string) => number;
  rng: Rng;
}

type Eligible = (playerId: string, chain: ChainSlot) => boolean;

/**
 * Relay assignment for one round (rounds after frame 1). Returns chainId → playerId.
 *
 * Rules, strongest first:
 *   1. Never your own chain.
 *   2. Never the same chain twice in a row.
 *   3. Balanced: nobody draws more than their fair share of any chain.
 *   4. Varied predecessors, which falls out of the shuffling.
 *
 * Balance is relaxed if it would leave someone idle, and rule 2 is relaxed only
 * when nobody could draw at all (e.g. two players left). Chains with the fewest
 * frames get priority, so when players drop out the chains stay roughly level.
 * Players can be left without a chain when there are fewer chains than players.
 */
export function assignRound(input: AssignInput): Map<string, string> {
  const { players, chains, targetFrames, count, rng } = input;

  // Shuffle first, then stable-sort, so ties in frame count are broken randomly.
  const needing = shuffle(
    chains.filter((c) => c.frames < targetFrames),
    rng,
  ).sort((a, b) => a.frames - b.frames);
  const target = Math.min(players.length, needing.length);
  if (target === 0) return new Map();

  const maxAllowed = (chain: ChainSlot) => {
    const eligible = players.filter((p) => p !== chain.ownerId).length;
    return Math.ceil((targetFrames - 1) / Math.max(1, eligible));
  };

  const strict: Eligible = (p, c) =>
    p !== c.ownerId && p !== c.lastDrawerId && count(p, c.id) < maxAllowed(c);
  const noRepeat: Eligible = (p, c) => p !== c.ownerId && p !== c.lastDrawerId;
  const notOwner: Eligible = (p, c) => p !== c.ownerId;

  const first = maximumMatching(needing, players, strict, input, target);
  if (first.size === target) return first;
  const second = maximumMatching(needing, players, noRepeat, input, target);
  const best = second.size > first.size ? second : first;
  if (best.size > 0) return best;
  return maximumMatching(needing, players, notOwner, input, target);
}

/**
 * Kuhn's augmenting-path bipartite matching. Chains are tried in priority order;
 * each chain's candidates are shuffled and then ordered by how little they've
 * drawn on it, which keeps contributions balanced.
 */
function maximumMatching(
  chains: readonly ChainSlot[],
  players: readonly string[],
  eligible: Eligible,
  { count, rng }: AssignInput,
  limit: number,
): Map<string, string> {
  const playerOfChain = new Map<string, string>();
  const chainOfPlayer = new Map<string, string>();
  const candidates = new Map<string, string[]>();
  for (const chain of chains) {
    const list = shuffle(
      players.filter((p) => eligible(p, chain)),
      rng,
    ).sort((a, b) => count(a, chain.id) - count(b, chain.id));
    candidates.set(chain.id, list);
  }

  const tryAssign = (chainId: string, seen: Set<string>): boolean => {
    for (const p of candidates.get(chainId) ?? []) {
      if (seen.has(p)) continue;
      seen.add(p);
      const current = chainOfPlayer.get(p);
      if (current === undefined || tryAssign(current, seen)) {
        chainOfPlayer.set(p, chainId);
        playerOfChain.set(chainId, p);
        return true;
      }
    }
    return false;
  };

  for (const chain of chains) {
    if (playerOfChain.size >= limit) break;
    tryAssign(chain.id, new Set());
  }
  return playerOfChain;
}
