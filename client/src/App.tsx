import { useState } from 'react';
import { APP_NAME } from '@flipbook/shared';
import { isMuted, setMuted } from './lib/sfx';
import { actions, useGame } from './lib/store';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { RevealScreen } from './screens/RevealScreen';

export function App() {
  const game = useGame();
  const [muted, setMutedState] = useState(isMuted);
  const { room, session } = game;

  if (!session || !room) {
    return (
      <main className="app">
        {session && !room ? (
          <div className="card centered">Rejoining room {session.code}…</div>
        ) : (
          <HomeScreen notice={game.notice} connected={game.connected} />
        )}
      </main>
    );
  }

  const me = session.playerId;
  const leave = () => {
    if (room.phase === 'lobby' || confirm('Leave this game? Your flipbook keeps going without you.')) actions.leave();
  };

  return (
    <main className="app">
      <header className="topbar">
        <span className="brand">{APP_NAME}</span>
        <span className="code-pill" title="Room code">
          {room.code}
        </span>
        <span className="spacer" />
        <button
          className="btn ghost small"
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
          }}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="btn ghost small" onClick={leave}>
          Leave
        </button>
      </header>

      {!game.connected && <div className="banner">Connection lost. Reconnecting…</div>}

      {room.phase === 'lobby' &&
        (room.players.find((p) => p.id === me)?.named ? (
          <LobbyScreen room={room} me={me} />
        ) : (
          <ProfileScreen room={room} me={me} />
        ))}
      {room.phase === 'drawing' && (
        <GameScreen room={room} turn={game.turn} turnRound={game.turnRound} isHost={room.hostId === me} />
      )}
      {room.phase === 'reveal' &&
        (game.reveal ? (
          <RevealScreen room={room} reveal={game.reveal} me={me} />
        ) : (
          <div className="card centered">Loading the reveal…</div>
        ))}
    </main>
  );
}
