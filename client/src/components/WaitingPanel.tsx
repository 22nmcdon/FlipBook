import type { RoomView } from '@flipbook/shared';
import { useCountdown } from '../lib/useCountdown';
import { Avatar } from './Avatar';
import { Timer } from './Timer';

/** Shown after pressing Done, or when sitting a round out: who's still drawing. */
export function WaitingPanel({ room, title, subtitle }: { room: RoomView; title: string; subtitle?: string }) {
  const left = useCountdown(room.deadline);
  const assigned = new Set(room.progress.assigned);
  const submitted = new Set(room.progress.submitted);
  const drawing = room.players.filter((p) => assigned.has(p.id));

  return (
    <div className="card waiting">
      <div className="waiting-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        <Timer seconds={left} />
      </div>
      <ul className="progress-list">
        {drawing.map((p) => (
          <li key={p.id} className={submitted.has(p.id) ? 'done' : ''}>
            <Avatar name={p.nickname} color={p.color} size={28} />
            <span>{p.nickname}</span>
            <span className="status">{submitted.has(p.id) ? 'done' : p.connected ? 'drawing…' : 'away'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
