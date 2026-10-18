import { useState } from 'react';
import {
  MIN_PLAYERS,
  PRESETS,
  RECOMMENDED_PLAYERS,
  SETTINGS_LIMITS,
  type GameSettings,
  type PresetName,
  type RoomView,
} from '@flipbook/shared';
import { Avatar } from '../components/Avatar';
import { socket } from '../lib/store';

export function LobbyScreen({ room, me }: { room: RoomView; me: string }) {
  const isHost = room.hostId === me;
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const count = room.players.length;

  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy. The link is in the address bar.');
    }
  };

  const start = async () => {
    setError(null);
    const res = await socket.emitWithAck('host:start');
    if (!res.ok) setError(res.error);
  };

  const update = (patch: Partial<GameSettings>) => socket.emit('host:settings', patch);

  return (
    <div className="lobby">
      <div className="card room-card">
        <p className="muted small">Room code</p>
        <div className="room-code">{room.code}</div>
        <button className="btn ghost small" onClick={copyInvite}>
          {copied ? 'Copied!' : 'Copy invite link'}
        </button>
      </div>

      <div className="lobby-grid">
        <section className="card">
          <h2>
            Players <span className="muted">({count})</span>
          </h2>
          <ul className="player-list">
            {room.players.map((p) => (
              <li key={p.id} className={p.connected ? '' : 'away'}>
                <Avatar name={p.nickname} color={p.color} />
                <span className="name">
                  {p.nickname}
                  {p.id === me && <span className="tag">you</span>}
                  {p.id === room.hostId && <span className="tag host">host</span>}
                  {p.isBot && <span className="tag">bot</span>}
                  {!p.connected && <span className="tag">reconnecting…</span>}
                </span>
                {isHost && p.id !== me && (
                  <button className="btn ghost small" onClick={() => socket.emit('host:kick', { playerId: p.id })}>
                    Kick
                  </button>
                )}
              </li>
            ))}
          </ul>
          {isHost && room.botsAllowed && (
            <button className="btn ghost small" onClick={() => socket.emit('host:addBot')}>
              + Add a test bot
            </button>
          )}
          {count < RECOMMENDED_PLAYERS && (
            <p className="hint">
              {count < MIN_PLAYERS
                ? `Need at least ${MIN_PLAYERS} players to start.`
                : `Relay is best with ${RECOMMENDED_PLAYERS}+ players. With fewer, the same people take turns a lot.`}
            </p>
          )}
        </section>

        <section className="card">
          <h2>Relay mode</h2>
          <ol className="rules">
            <li>Everyone writes a secret word and draws the first frame of their own flipbook.</li>
            <li>Flipbooks get passed around. You only ever see the previous frame, faded under your canvas.</li>
            <li>Draw what comes next. Nobody but the owner knows what it's supposed to be.</li>
            <li>At the end, every word is revealed and every animation plays.</li>
          </ol>

          <h3>Settings</h3>
          <div className="presets">
            {(Object.keys(PRESETS) as PresetName[]).map((name) => {
              const preset = PRESETS[name];
              const active = Object.entries(preset).every(([k, v]) => room.settings[k as keyof GameSettings] === v);
              return (
                <button key={name} className={`chip ${active ? 'active' : ''}`} disabled={!isHost} onClick={() => update(preset)}>
                  {name}
                </button>
              );
            })}
          </div>
          <div className="settings">
            <NumberSetting
              label="Frames per flipbook"
              value={room.settings.frameCount}
              limits={SETTINGS_LIMITS.frameCount}
              disabled={!isHost}
              onChange={(frameCount) => update({ frameCount })}
            />
            <NumberSetting
              label="First frame timer (sec)"
              value={room.settings.firstFrameSeconds}
              limits={SETTINGS_LIMITS.firstFrameSeconds}
              step={5}
              disabled={!isHost}
              onChange={(firstFrameSeconds) => update({ firstFrameSeconds })}
            />
            <NumberSetting
              label="Frame timer (sec)"
              value={room.settings.frameSeconds}
              limits={SETTINGS_LIMITS.frameSeconds}
              step={5}
              disabled={!isHost}
              onChange={(frameSeconds) => update({ frameSeconds })}
            />
            <NumberSetting
              label="Playback speed (fps)"
              value={room.settings.fps}
              limits={SETTINGS_LIMITS.fps}
              disabled={!isHost}
              onChange={(fps) => update({ fps })}
            />
            <label className="setting toggle">
              <input
                type="checkbox"
                checked={room.settings.easyMode}
                disabled={!isHost}
                onChange={(e) => update({ easyMode: e.target.checked })}
              />
              <span>Easy mode: see the last 2 frames instead of 1</span>
            </label>
          </div>
        </section>
      </div>

      <div className="lobby-actions">
        {isHost ? (
          <button className="btn primary big" onClick={start} disabled={count < MIN_PLAYERS}>
            Start game
          </button>
        ) : (
          <p className="muted">Waiting for the host to start…</p>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function NumberSetting(props: {
  label: string;
  value: number;
  limits: readonly [number, number];
  step?: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const { label, value, limits, step = 1, disabled, onChange } = props;
  const clamp = (v: number) => Math.min(limits[1], Math.max(limits[0], v));
  return (
    <div className="setting">
      <span>{label}</span>
      <div className="stepper">
        <button className="btn ghost small" disabled={disabled || value <= limits[0]} onClick={() => onChange(clamp(value - step))}>
          −
        </button>
        <span className="value">{value}</span>
        <button className="btn ghost small" disabled={disabled || value >= limits[1]} onClick={() => onChange(clamp(value + step))}>
          +
        </button>
      </div>
    </div>
  );
}
