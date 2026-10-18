import { useEffect, useState } from 'react';
import type { RoomView, TurnView } from '@flipbook/shared';
import { WaitingPanel } from '../components/WaitingPanel';
import { sfx } from '../lib/sfx';
import { socket } from '../lib/store';
import { TurnScreen } from './TurnScreen';

interface Props {
  room: RoomView;
  turn: TurnView | null;
  turnRound: number;
  isHost: boolean;
}

export function GameScreen({ room, turn, turnRound, isHost }: Props) {
  const current = turnRound === room.round;
  const [submittedRound, setSubmittedRound] = useState(-1);

  useEffect(() => {
    if (current && turn) sfx.roundStart();
  }, [current, turn]);

  const done = turn?.submitted || submittedRound === room.round;

  let body;
  if (!current) {
    body = <WaitingPanel room={room} title="Passing the flipbook…" />;
  } else if (!turn) {
    body = (
      <WaitingPanel
        room={room}
        title="You're sitting this round out"
        subtitle="There are more players than flipbooks that need a frame right now."
      />
    );
  } else if (done) {
    body = <WaitingPanel room={room} title="Nice! Waiting for the others…" />;
  } else {
    body = <TurnScreen key={`${room.round}`} turn={turn} onSubmitted={() => setSubmittedRound(room.round)} />;
  }

  return (
    <div className="game">
      {body}
      {isHost && (
        <div className="host-bar">
          <span className="muted">Round {room.round + 1}</span>
          <button className="btn ghost small" onClick={() => socket.emit('host:skip')} title="End this round now">
            Skip round ⏭
          </button>
        </div>
      )}
    </div>
  );
}
