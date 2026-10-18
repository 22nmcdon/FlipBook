import { useEffect, useState } from 'react';
import type { RevealView, RoomView } from '@flipbook/shared';
import { Avatar } from '../components/Avatar';
import { FrameCanvas } from '../draw/FrameCanvas';
import { chainToGif, downloadBlob } from '../lib/gif';
import { sfx } from '../lib/sfx';
import { socket } from '../lib/store';

type Stage = 'word' | 'slow' | 'loop';

const WORD_MS = 2500;
const SLOW_FRAME_MS = 650;

export function RevealScreen({ room, reveal, me }: { room: RoomView; reveal: RevealView; me: string }) {
  const isHost = room.hostId === me;
  const chains = reveal.chains;
  const chainIndex = Math.min(room.revealIndex, chains.length - 1);
  const chain = chains[chainIndex];

  // Playback: show the word, step through slowly with credits, then loop at full speed.
  const [stage, setStage] = useState<Stage>('word');
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [exporting, setExporting] = useState(false);
  const count = chain?.frames.length ?? 0;
  const fps = room.settings.fps;

  const restart = () => {
    setStage('word');
    setIndex(0);
    setPlaying(true);
  };

  useEffect(() => {
    restart();
    sfx.reveal();
  }, [chain?.id]);

  useEffect(() => {
    if (!playing || count === 0) return;
    if (stage === 'word') {
      const t = setTimeout(() => setStage('slow'), WORD_MS);
      return () => clearTimeout(t);
    }
    if (stage === 'slow') {
      const t = setTimeout(() => {
        if (index < count - 1) setIndex(index + 1);
        else {
          setStage('loop');
          setIndex(0);
        }
      }, SLOW_FRAME_MS);
      return () => clearTimeout(t);
    }
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 1000 / fps);
    return () => clearInterval(t);
  }, [stage, index, playing, count, fps]);

  if (!chain) return <div className="card">No flipbooks to show.</div>;

  const frame = chain.frames[Math.min(index, count - 1)];
  const isLast = chainIndex === chains.length - 1;

  const exportGif = async () => {
    setExporting(true);
    // Let the button repaint before the (synchronous) encode.
    await new Promise((r) => setTimeout(r, 30));
    const slug = chain.word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flipbook';
    downloadBlob(chainToGif(chain, fps), `${slug}.gif`);
    setExporting(false);
  };

  const scrub = (i: number) => {
    setStage('loop');
    setPlaying(false);
    setIndex(i);
  };

  return (
    <div className="reveal">
      <div className="reveal-head">
        <span className="muted">
          Flipbook {chainIndex + 1} of {chains.length}
        </span>
        <h2>
          <Avatar name={chain.ownerName} color={chain.ownerColor} size={30} /> {chain.ownerName}'s secret word was…
        </h2>
        <div className={`secret-word ${stage === 'word' ? 'pop' : ''}`}>“{chain.word}”</div>
      </div>

      <div className="reveal-body">
        <div className="stage">
          <FrameCanvas frame={stage === 'word' ? null : (frame?.frame ?? null)} className="stage-canvas" />
          {stage === 'word' && <div className="stage-overlay">Get ready…</div>}
        </div>

        <div className="stage-info">
          {stage !== 'word' && frame && (
            <div className="credit">
              <Avatar name={frame.authorName} color={frame.authorColor} size={28} />
              <span>
                Frame {index + 1} by <strong>{frame.authorName}</strong>
                {frame.held && <span className="tag">held</span>}
              </span>
            </div>
          )}
          <input
            className="scrubber"
            type="range"
            min={0}
            max={Math.max(0, count - 1)}
            value={stage === 'word' ? 0 : index}
            onChange={(e) => scrub(Number(e.target.value))}
            aria-label="Scrub frames"
          />
          <div className="tool-group">
            {stage === 'loop' && (
              <button className="btn ghost small" onClick={() => setPlaying(!playing)}>
                {playing ? '❚❚ Pause' : '▶ Play'}
              </button>
            )}
            <button className="btn ghost small" onClick={restart}>
              ↺ Replay
            </button>
            <button className="btn ghost small" onClick={exportGif} disabled={exporting}>
              {exporting ? 'Encoding…' : '⬇ GIF'}
            </button>
          </div>
        </div>
      </div>

      <div className="filmstrip">
        {chain.frames.map((f, i) => (
          <button
            key={i}
            className={`thumb ${stage !== 'word' && i === index ? 'active' : ''}`}
            style={{ borderColor: f.authorColor }}
            onClick={() => scrub(i)}
            title={`Frame ${i + 1}: ${f.authorName}${f.held ? ' (held)' : ''}`}
          >
            <FrameCanvas frame={f.frame} />
          </button>
        ))}
      </div>

      <div className="reveal-actions">
        {isHost ? (
          <>
            <button
              className="btn"
              disabled={chainIndex === 0}
              onClick={() => socket.emit('host:reveal', { index: chainIndex - 1 })}
            >
              ← Previous
            </button>
            {isLast ? (
              <button className="btn primary big" onClick={() => socket.emit('host:lobby')}>
                Play again with this group
              </button>
            ) : (
              <button className="btn primary big" onClick={() => socket.emit('host:reveal', { index: chainIndex + 1 })}>
                Next flipbook →
              </button>
            )}
          </>
        ) : (
          <p className="muted">The host controls which flipbook is shown.</p>
        )}
      </div>
    </div>
  );
}
