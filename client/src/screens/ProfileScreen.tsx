import { useState, type FormEvent } from 'react';
import { AVATAR_COLORS, MAX_NICKNAME_LENGTH, type RoomView } from '@flipbook/shared';
import { Avatar } from '../components/Avatar';
import { actions } from '../lib/store';

const PROFILE_KEY = 'flipbook.profile';

function savedProfile(): { nickname: string; color: string } {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}');
    return { nickname: String(p.nickname ?? ''), color: String(p.color ?? '') };
  } catch {
    return { nickname: '', color: '' };
  }
}

/**
 * Pick a name and color after creating or joining a room. Also used from the
 * lobby to edit your profile (pass onClose).
 */
export function ProfileScreen({ room, me, onClose }: { room: RoomView; me: string; onClose?: () => void }) {
  const self = room.players.find((p) => p.id === me);
  // Players still picking hold a placeholder color that anyone can take.
  const here = room.players.filter((p) => p.id !== me && p.named);
  const taken = new Set(here.map((p) => p.color));

  const [nickname, setNickname] = useState(() => (self?.named ? self.nickname : savedProfile().nickname));
  const [color, setColor] = useState(() => {
    if (self?.named) return self.color;
    const saved = savedProfile().color;
    const usable = (AVATAR_COLORS as readonly string[]).includes(saved) && !taken.has(saved);
    return usable ? saved : (self?.color ?? AVATAR_COLORS[0]);
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) return setError('Pick a nickname first.');
    setBusy(true);
    const err = await actions.setProfile({ nickname: name, color });
    setBusy(false);
    if (err) return setError(err);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ nickname: name, color }));
    } catch {
      // ignore
    }
    onClose?.();
  };

  return (
    <form className="card profile-card" onSubmit={submit}>
      <h2>{onClose ? 'Edit your profile' : 'Who are you?'}</h2>

      <label className="field">
        <span>Your name</span>
        <div className="name-row">
          <Avatar name={nickname || '?'} color={color} size={44} />
          <input
            className="input"
            value={nickname}
            maxLength={MAX_NICKNAME_LENGTH}
            placeholder="Nickname"
            autoFocus
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>
      </label>

      <div className="field">
        <span>Your color</span>
        <div className="color-row" role="radiogroup" aria-label="Avatar color">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${c === color ? 'active' : ''}`}
              style={{ background: c }}
              disabled={taken.has(c)}
              onClick={() => setColor(c)}
              aria-label={taken.has(c) ? `Color ${c} (taken)` : `Color ${c}`}
            />
          ))}
        </div>
      </div>

      {here.length > 0 && (
        <p className="muted small here">
          Already here:{' '}
          {here.map((p) => (
            <span key={p.id} className="here-name" style={{ color: p.color }}>
              {p.nickname}
            </span>
          ))}
        </p>
      )}

      <div className="profile-actions">
        {onClose && (
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        )}
        <button className="btn primary big" type="submit" disabled={busy}>
          {onClose ? 'Save' : 'Join the lobby'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
