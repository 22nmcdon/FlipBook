import { useState, type FormEvent } from 'react';
import { APP_NAME, AVATAR_COLORS, MAX_NICKNAME_LENGTH, ROOM_CODE_LENGTH } from '@flipbook/shared';
import { Avatar } from '../components/Avatar';
import { actions } from '../lib/store';

const PROFILE_KEY = 'flipbook.profile';

function loadProfile(): { nickname: string; color: string } {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}');
    return { nickname: String(p.nickname ?? ''), color: AVATAR_COLORS.includes(p.color) ? p.color : AVATAR_COLORS[0] };
  } catch {
    return { nickname: '', color: AVATAR_COLORS[0] };
  }
}

export function HomeScreen({ notice, connected }: { notice: string | null; connected: boolean }) {
  const [profile, setProfile] = useState(loadProfile);
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nickname = profile.nickname.trim();

  const run = async (fn: () => Promise<string | null>) => {
    if (!nickname) return setError('Pick a nickname first.');
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // ignore
    }
    setBusy(true);
    setError(await fn());
    setBusy(false);
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== ROOM_CODE_LENGTH) return setError(`Room codes are ${ROOM_CODE_LENGTH} letters.`);
    void run(() => actions.join(code, { nickname, color: profile.color }));
  };

  return (
    <div className="home">
      <div className="hero">
        <div className="logo-stack" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <h1>{APP_NAME}</h1>
        <p className="tagline">Pass the flipbook. One frame each. Nobody knows what it was supposed to be.</p>
      </div>

      <div className="card home-card">
        {notice && (
          <div className="notice" onClick={actions.dismissNotice}>
            {notice}
          </div>
        )}

        <label className="field">
          <span>Your name</span>
          <div className="name-row">
            <Avatar name={profile.nickname || '?'} color={profile.color} size={44} />
            <input
              className="input"
              value={profile.nickname}
              maxLength={MAX_NICKNAME_LENGTH}
              placeholder="Nickname"
              autoFocus
              onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
            />
          </div>
        </label>

        <div className="color-row" role="radiogroup" aria-label="Avatar color">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${c === profile.color ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => setProfile({ ...profile, color: c })}
              aria-label={`Avatar color ${c}`}
            />
          ))}
        </div>

        <button
          className="btn primary big wide"
          disabled={busy || !connected}
          onClick={() => run(() => actions.create({ nickname, color: profile.color }))}
        >
          Create a room
        </button>

        <div className="divider">
          <span>or join one</span>
        </div>

        <form className="join-row" onSubmit={join}>
          <input
            className="input code-input"
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="CODE"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          />
          <button className="btn" type="submit" disabled={busy || !connected}>
            Join
          </button>
        </form>

        {error && <p className="error">{error}</p>}
        {!connected && <p className="muted small">Connecting to the server…</p>}
      </div>
    </div>
  );
}
