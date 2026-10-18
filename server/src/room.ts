import { randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  assignRound,
  AVATAR_COLORS,
  cloneFrame,
  DEADLINE_GRACE_MS,
  DEFAULT_SETTINGS,
  emptyFrame,
  FALLBACK_WORDS,
  isBlankFrame,
  MAX_NICKNAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  pick,
  sanitizeFrame,
  sanitizeSettings,
  sanitizeWord,
  seededRng,
  type ClientToServerEvents,
  type Frame,
  type GameSettings,
  type Phase,
  type RevealView,
  type Rng,
  type RoomView,
  type ServerToClientEvents,
  type TurnView,
} from '@flipbook/shared';
import { botFrame, botWord } from './bots';

export interface SocketData {
  code?: string;
  playerId?: string;
}
export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

interface PlayerRec {
  id: string;
  token: string;
  nickname: string;
  color: string;
  connected: boolean;
  sockets: Set<string>;
  isBot: boolean;
  named: boolean;
}

interface ChainRec {
  id: string;
  ownerId: string;
  word: string;
  frames: { authorId: string; frame: Frame; held: boolean }[];
  lastDrawerId: string | null;
}

interface TurnRec {
  playerId: string;
  chainId: string;
  draft: Frame | null;
  draftWord: string;
  submitted: boolean;
  lastDraftAt: number;
}

const LOBBY_DISCONNECT_REMOVE_MS = 20_000;
const HOST_HANDOFF_MS = 15_000;
const EMPTY_ROOM_TTL_MS = 5 * 60_000;
const DRAFT_MIN_INTERVAL_MS = 100;

const BOT_NAMES = ['Botticelli', 'Pixel', 'Doodlebot', 'Scribbles', 'Inky', 'Sketchy', 'Crayonne', 'Smudge'];

/**
 * One game room. The server is authoritative: it owns the phase, the round timer,
 * the chains and who draws what. Clients only ever see their own turn's onion-skin
 * frames until the reveal.
 */
export class Room {
  readonly id = randomUUID();
  hostId = '';
  settings: GameSettings = { ...DEFAULT_SETTINGS };
  phase: Phase = 'lobby';
  readonly players = new Map<string, PlayerRec>();

  /** Everyone who played this game, so the reveal can credit players who left. */
  private roster = new Map<string, { nickname: string; color: string }>();
  private chains: ChainRec[] = [];
  private counts = new Map<string, number>();
  private turns = new Map<string, TurnRec>();
  private round = 0;
  private deadline: number | null = null;
  private revealIndex = 0;
  private gameNumber = 0;
  private rng: Rng = seededRng(this.id);

  private roundTimer: NodeJS.Timeout | null = null;
  private hostTimer: NodeJS.Timeout | null = null;
  private emptyTimer: NodeJS.Timeout | null = null;
  private removalTimers = new Map<string, NodeJS.Timeout>();
  private botTimers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly io: IO,
    readonly code: string,
    private readonly botsAllowed: boolean,
    private readonly onEmpty: (room: Room) => void,
  ) {}

  // ---------------------------------------------------------------- players

  /**
   * Add a seat to the room. Humans join nameless and pick a name and color
   * afterwards (setProfile); bots are named straight away.
   */
  addPlayer(botName?: string): PlayerRec | string {
    if (this.phase !== 'lobby') return 'That game has already started.';
    if (this.players.size >= MAX_PLAYERS) return 'That room is full.';

    const isBot = botName !== undefined;
    const player: PlayerRec = {
      id: randomUUID(),
      token: randomBytes(16).toString('hex'),
      nickname: botName ?? '',
      color: this.freeColor(),
      connected: isBot,
      sockets: new Set(),
      isBot,
      named: isBot,
    };
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
    return player;
  }

  /** Set a player's name and color. Returns an error message, or null on success. */
  setProfile(playerId: string, profile: unknown): string | null {
    const player = this.players.get(playerId);
    if (!player) return 'You are not in this room.';
    if (this.phase !== 'lobby') return "Names can't change during a game.";
    const p = (typeof profile === 'object' && profile !== null ? profile : {}) as Record<string, unknown>;

    const nickname = sanitizeWord(p.nickname).slice(0, MAX_NICKNAME_LENGTH);
    if (!nickname) return 'Pick a nickname first.';
    // Only chosen names and colors count; a nameless player's placeholder color is up for grabs.
    const others = [...this.players.values()].filter((o) => o.id !== playerId && o.named);
    if (others.some((o) => o.nickname.toLowerCase() === nickname.toLowerCase())) {
      return 'Someone in this room already has that name.';
    }
    const color = typeof p.color === 'string' ? p.color : '';
    if (!(AVATAR_COLORS as readonly string[]).includes(color)) return 'Pick a color.';
    if (others.some((o) => o.color === color)) return 'Someone just took that color. Pick another.';

    player.nickname = nickname;
    player.color = color;
    player.named = true;
    for (const o of this.players.values()) {
      if (!o.named && o.color === color) o.color = this.freeColor();
    }
    this.broadcastState();
    return null;
  }

  attach(socket: GameSocket, player: PlayerRec) {
    socket.data.code = this.code;
    socket.data.playerId = player.id;
    void socket.join(this.code);
    void socket.join(this.personalRoom(player.id));
    player.sockets.add(socket.id);
    player.connected = true;

    this.clearTimer(this.removalTimers.get(player.id));
    this.removalTimers.delete(player.id);
    if (player.id === this.hostId) this.hostTimer = this.clearTimer(this.hostTimer);
    this.emptyTimer = this.clearTimer(this.emptyTimer);

    this.broadcastState();
    if (this.phase === 'drawing') socket.emit('turn:start', this.turnView(player.id));
    if (this.phase === 'reveal') socket.emit('reveal:data', this.revealView());
  }

  detach(socket: GameSocket) {
    const player = this.players.get(socket.data.playerId ?? '');
    void socket.leave(this.code);
    if (socket.data.playerId) void socket.leave(this.personalRoom(socket.data.playerId));
    socket.data.code = undefined;
    socket.data.playerId = undefined;
    if (!player) return;
    player.sockets.delete(socket.id);
    if (player.sockets.size > 0) return;

    player.connected = false;
    if (this.phase === 'lobby') {
      // Give a refreshing tab time to come back before dropping them from the lobby.
      this.removalTimers.set(
        player.id,
        setTimeout(() => this.removePlayer(player.id), LOBBY_DISCONNECT_REMOVE_MS),
      );
    }
    if (player.id === this.hostId && !this.hostTimer) {
      this.hostTimer = setTimeout(() => {
        this.hostTimer = null;
        if (!this.players.get(this.hostId)?.connected) this.transferHost();
      }, HOST_HANDOFF_MS);
    }
    this.maybeEndRound();
    this.broadcastState();
    this.checkEmpty();
  }

  /** Remove a player for good (kick, leave, or lobby timeout). Their chain keeps going without them. */
  removePlayer(playerId: string, kicked = false) {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.clearTimer(this.removalTimers.get(playerId));
    this.removalTimers.delete(playerId);

    const personal = this.personalRoom(playerId);
    if (kicked) this.io.to(personal).emit('kicked');
    this.io.in(personal).socketsLeave([this.code, personal]);
    for (const id of player.sockets) {
      const s = this.io.sockets.sockets.get(id);
      if (s) {
        s.data.code = undefined;
        s.data.playerId = undefined;
      }
    }

    if (playerId === this.hostId) this.transferHost();
    this.maybeEndRound();
    this.broadcastState();
    this.checkEmpty();
  }

  findPlayer(playerId: string, token: string): PlayerRec | undefined {
    const p = this.players.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  // ---------------------------------------------------------- host actions

  setSettings(by: string, update: unknown) {
    if (by !== this.hostId || this.phase !== 'lobby') return;
    this.settings = sanitizeSettings(update, this.settings);
    this.broadcastState();
  }

  addBot(by: string) {
    if (by !== this.hostId || this.phase !== 'lobby' || !this.botsAllowed) return;
    const taken = new Set([...this.players.values()].map((p) => p.nickname.toLowerCase()));
    const name = BOT_NAMES.find((n) => !taken.has(n.toLowerCase())) ?? `Bot ${this.players.size + 1}`;
    const result = this.addPlayer(name);
    if (typeof result !== 'string') this.broadcastState();
  }

  kick(by: string, playerId: string) {
    if (by !== this.hostId || playerId === this.hostId) return;
    this.removePlayer(playerId, true);
  }

  start(by: string): string | null {
    if (by !== this.hostId) return 'Only the host can start the game.';
    if (this.phase !== 'lobby') return 'The game has already started.';
    for (const p of [...this.players.values()]) if (!p.connected) this.removePlayer(p.id);
    if (this.players.size < MIN_PLAYERS) return `You need at least ${MIN_PLAYERS} players.`;
    const picking = [...this.players.values()].filter((p) => !p.named).length;
    if (picking > 0) {
      return `Waiting for ${picking} ${picking === 1 ? 'player' : 'players'} to pick a name. You can kick them if they're stuck.`;
    }

    this.gameNumber++;
    const seed = `${this.id}:${this.gameNumber}`;
    this.rng = seededRng(seed);
    console.log(`[${this.code}] game ${this.gameNumber} starting, ${this.players.size} players, seed ${seed}`);

    this.roster = new Map([...this.players.values()].map((p) => [p.id, { nickname: p.nickname, color: p.color }]));
    this.chains = [...this.players.values()].map((p) => ({
      id: randomUUID(),
      ownerId: p.id,
      word: '',
      frames: [],
      lastDrawerId: null,
    }));
    this.counts.clear();
    this.round = 0;
    this.phase = 'drawing';
    this.beginRound();
    return null;
  }

  skip(by: string) {
    if (by === this.hostId && this.phase === 'drawing') this.endRound();
  }

  setReveal(by: string, index: number) {
    if (by !== this.hostId || this.phase !== 'reveal' || !Number.isInteger(index)) return;
    this.revealIndex = Math.max(0, Math.min(this.chains.length - 1, index));
    this.broadcastState();
  }

  backToLobby(by: string) {
    if (by !== this.hostId || this.phase !== 'reveal') return;
    this.phase = 'lobby';
    this.chains = [];
    this.turns.clear();
    this.revealIndex = 0;
    this.deadline = null;
    for (const p of [...this.players.values()]) if (!p.connected) this.removePlayer(p.id);
    this.broadcastState();
  }

  // ------------------------------------------------------------ turn input

  draft(playerId: string, frame: unknown, word: unknown) {
    const turn = this.turns.get(playerId);
    if (this.phase !== 'drawing' || !turn || turn.submitted) return;
    const now = Date.now();
    if (now - turn.lastDraftAt < DRAFT_MIN_INTERVAL_MS) return;
    turn.lastDraftAt = now;
    turn.draft = sanitizeFrame(frame) ?? turn.draft;
    if (this.round === 0 && word !== undefined) turn.draftWord = sanitizeWord(word);
  }

  submit(playerId: string, frame: unknown, word: unknown) {
    const turn = this.turns.get(playerId);
    if (this.phase !== 'drawing' || !turn || turn.submitted) return;
    turn.draft = sanitizeFrame(frame) ?? turn.draft;
    if (this.round === 0 && word !== undefined) turn.draftWord = sanitizeWord(word);
    turn.submitted = true;
    this.broadcastState();
    this.maybeEndRound();
  }

  // ------------------------------------------------------------ game loop

  private beginRound() {
    this.turns.clear();
    const active = [...this.players.values()].filter((p) => p.connected).map((p) => p.id);

    if (this.round === 0) {
      for (const chain of this.chains) this.turns.set(chain.ownerId, this.newTurn(chain.ownerId, chain.id));
    } else {
      if (active.length < 2) return this.finishGame();
      const assignment = assignRound({
        players: active,
        chains: this.chains.map((c) => ({
          id: c.id,
          ownerId: c.ownerId,
          frames: c.frames.length,
          lastDrawerId: c.lastDrawerId,
        })),
        targetFrames: this.settings.frameCount,
        count: (p, c) => this.counts.get(`${p}|${c}`) ?? 0,
        rng: this.rng,
      });
      if (assignment.size === 0) return this.finishGame();
      for (const [chainId, playerId] of assignment) this.turns.set(playerId, this.newTurn(playerId, chainId));
    }

    const seconds = this.round === 0 ? this.settings.firstFrameSeconds : this.settings.frameSeconds;
    this.deadline = Date.now() + seconds * 1000;
    this.roundTimer = setTimeout(() => this.endRound(), seconds * 1000 + DEADLINE_GRACE_MS);

    this.broadcastState();
    for (const p of this.players.values()) {
      if (p.isBot) this.scheduleBot(p.id);
      else this.io.to(this.personalRoom(p.id)).emit('turn:start', this.turnView(p.id));
    }
  }

  /** End early once every connected player with a turn has pressed Done. */
  private maybeEndRound() {
    if (this.phase !== 'drawing') return;
    const live = [...this.turns.values()].filter((t) => this.players.get(t.playerId)?.connected);
    if (live.length > 0 && live.every((t) => t.submitted)) this.endRound();
  }

  private endRound() {
    if (this.phase !== 'drawing') return;
    this.roundTimer = this.clearTimer(this.roundTimer);

    for (const turn of this.turns.values()) {
      const chain = this.chains.find((c) => c.id === turn.chainId);
      if (!chain) continue;
      const prev = chain.frames.at(-1)?.frame;
      // A blank or timed-out turn becomes a copy of the previous frame, which reads as a "hold".
      const blank = isBlankFrame(turn.draft);
      const frame = !blank ? turn.draft! : prev ? cloneFrame(prev) : emptyFrame();
      chain.frames.push({ authorId: turn.playerId, frame, held: blank && !!prev });
      chain.lastDrawerId = turn.playerId;
      const key = `${turn.playerId}|${chain.id}`;
      this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
      if (this.round === 0) chain.word = turn.draftWord || pick(FALLBACK_WORDS, this.rng);
    }

    this.round++;
    if (this.chains.every((c) => c.frames.length >= this.settings.frameCount)) return this.finishGame();
    this.beginRound();
  }

  private finishGame() {
    this.roundTimer = this.clearTimer(this.roundTimer);
    for (const t of this.botTimers) clearTimeout(t);
    this.botTimers.clear();
    this.turns.clear();
    this.deadline = null;
    this.phase = 'reveal';
    this.revealIndex = 0;
    console.log(`[${this.code}] game ${this.gameNumber} finished after ${this.round} rounds`);
    this.broadcastState();
    this.io.to(this.code).emit('reveal:data', this.revealView());
  }

  private scheduleBot(playerId: string) {
    const turn = this.turns.get(playerId);
    if (!turn) return;
    const round = this.round;
    const delay = 800 + Math.random() * 2500;
    const timer = setTimeout(() => {
      this.botTimers.delete(timer);
      if (this.round !== round || this.phase !== 'drawing') return;
      const view = this.turnView(playerId);
      if (!view) return;
      this.submit(playerId, botFrame(view), view.isFirst ? botWord() : undefined);
    }, delay);
    this.botTimers.add(timer);
  }

  // ------------------------------------------------------------------ views

  private broadcastState() {
    this.io.to(this.code).emit('room:state', this.view());
  }

  view(): RoomView {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        nickname: p.nickname,
        color: p.color,
        connected: p.connected,
        isBot: p.isBot,
        named: p.named,
      })),
      round: this.round,
      deadline: this.deadline,
      serverNow: Date.now(),
      progress: {
        assigned: [...this.turns.keys()],
        submitted: [...this.turns.values()].filter((t) => t.submitted).map((t) => t.playerId),
      },
      revealIndex: this.revealIndex,
      botsAllowed: this.botsAllowed,
    };
  }

  private turnView(playerId: string): TurnView | null {
    const turn = this.turns.get(playerId);
    const chain = turn && this.chains.find((c) => c.id === turn.chainId);
    if (!turn || !chain || this.deadline === null) return null;
    const onion = this.settings.easyMode ? 2 : 1;
    return {
      round: this.round,
      isFirst: chain.frames.length === 0,
      frameNumber: chain.frames.length + 1,
      totalFrames: this.settings.frameCount,
      prevFrames: chain.frames.slice(-onion).map((f) => f.frame),
      deadline: this.deadline,
      draft: turn.draft,
      draftWord: turn.draftWord,
      submitted: turn.submitted,
    };
  }

  private revealView(): RevealView {
    const who = (id: string) => this.roster.get(id) ?? { nickname: '???', color: AVATAR_COLORS[0] };
    return {
      chains: this.chains.map((c) => ({
        id: c.id,
        ownerId: c.ownerId,
        ownerName: who(c.ownerId).nickname,
        ownerColor: who(c.ownerId).color,
        word: c.word,
        frames: c.frames.map((f) => ({
          authorId: f.authorId,
          authorName: who(f.authorId).nickname,
          authorColor: who(f.authorId).color,
          frame: f.frame,
          held: f.held,
        })),
      })),
    };
  }

  // ---------------------------------------------------------------- helpers

  destroy() {
    this.roundTimer = this.clearTimer(this.roundTimer);
    this.hostTimer = this.clearTimer(this.hostTimer);
    this.emptyTimer = this.clearTimer(this.emptyTimer);
    for (const t of this.removalTimers.values()) clearTimeout(t);
    for (const t of this.botTimers) clearTimeout(t);
  }

  private newTurn(playerId: string, chainId: string): TurnRec {
    return { playerId, chainId, draft: null, draftWord: '', submitted: false, lastDraftAt: 0 };
  }

  private transferHost() {
    const humans = [...this.players.values()].filter((p) => !p.isBot);
    const next = humans.find((p) => p.connected) ?? humans[0];
    this.hostId = next?.id ?? '';
    this.broadcastState();
  }

  private checkEmpty() {
    const anyone = [...this.players.values()].some((p) => p.connected && !p.isBot);
    if (anyone || this.emptyTimer) return;
    this.emptyTimer = setTimeout(() => this.onEmpty(this), EMPTY_ROOM_TTL_MS);
  }

  private personalRoom(playerId: string) {
    return `${this.code}:${playerId}`;
  }

  /** A color nobody in the room is using yet (or any color once all are taken). */
  private freeColor(): string {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return AVATAR_COLORS.find((c) => !used.has(c)) ?? pick(AVATAR_COLORS, Math.random);
  }

  private clearTimer(timer: NodeJS.Timeout | null | undefined): null {
    if (timer) clearTimeout(timer);
    return null;
  }
}
