import { useState, type FormEvent } from 'react';
import { APP_NAME, ROOM_CODE_LENGTH } from '@flipbook/shared';
import { actions } from '../lib/store';

/** Landing page: create a room or join one by code. Name and color come after, inside the room. */
export function HomeScreen({ notice, connected }: { notice: string | null; connected: boolean }) {
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(await fn());
    setBusy(false);
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== ROOM_CODE_LENGTH) return setError(`Room codes are ${ROOM_CODE_LENGTH} letters.`);
    void run(() => actions.join(code));
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

        <button className="btn primary big wide" disabled={busy || !connected} onClick={() => run(actions.create)}>
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
            aria-label="Room code"
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
