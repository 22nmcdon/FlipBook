import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BRUSH_SIZES,
  ERASER_SIZES,
  FALLBACK_WORDS,
  MAX_WORD_LENGTH,
  PALETTE,
  pick,
  type Stroke,
  type TurnView,
} from '@flipbook/shared';
import { Timer } from '../components/Timer';
import { DrawCanvas } from '../draw/DrawCanvas';
import { Toolbar } from '../draw/Toolbar';
import { sfx } from '../lib/sfx';
import { socket } from '../lib/store';
import { useCountdown } from '../lib/useCountdown';

const DRAFT_THROTTLE_MS = 300;
const MAX_UNDO = 100;

/** One drawing turn. Remounted (via key) every round. */
export function TurnScreen({ turn, onSubmitted }: { turn: TurnView; onSubmitted: () => void }) {
  const [strokes, setStrokes] = useState<Stroke[]>(() => turn.draft?.strokes ?? []);
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);
  const [word, setWord] = useState(turn.draftWord);
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [sizeIndex, setSizeIndex] = useState(1);
  const [erase, setErase] = useState(false);
  const [showOnion, setShowOnion] = useState(true);
  const left = useCountdown(turn.deadline);

  // --- history ------------------------------------------------------------
  const commit = useCallback(
    (next: Stroke[]) => {
      setUndoStack((u) => [...u.slice(-MAX_UNDO + 1), strokes]);
      setRedoStack([]);
      setStrokes(next);
    },
    [strokes],
  );
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    setRedoStack((r) => [...r, strokes]);
    setStrokes(undoStack[undoStack.length - 1]!);
    setUndoStack(undoStack.slice(0, -1));
  }, [undoStack, strokes]);
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    setUndoStack((u) => [...u, strokes]);
    setStrokes(redoStack[redoStack.length - 1]!);
    setRedoStack(redoStack.slice(0, -1));
  }, [redoStack, strokes]);

  // --- draft sync: the server keeps the latest draft, so time-outs and refreshes lose nothing.
  const latest = useRef({ strokes, word });
  latest.current = { strokes, word };
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    const { strokes, word } = latest.current;
    socket.emit('turn:draft', { frame: { strokes }, word: turn.isFirst ? word : undefined });
  }, [turn.isFirst]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    draftTimer.current ??= setTimeout(sendDraft, DRAFT_THROTTLE_MS);
  }, [strokes, word, sendDraft]);
  useEffect(() => () => void (draftTimer.current && clearTimeout(draftTimer.current)), []);

  // --- timer --------------------------------------------------------------
  useEffect(() => {
    if (left > 0 && left <= 10) sfx.tick();
    if (left === 0) sendDraft();
  }, [left, sendDraft]);

  const submit = () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    socket.emit('turn:submit', { frame: { strokes }, word: turn.isFirst ? word : undefined });
    sfx.submit();
    onSubmitted();
  };

  // --- keyboard shortcuts ---------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (!mod && e.key === 'b') setErase(false);
      else if (!mod && e.key === 'e') setErase(true);
      else if (!mod && e.key === 'o') setShowOnion((v) => !v);
      else if (!mod && ['1', '2', '3'].includes(e.key)) setSizeIndex(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const size = (erase ? ERASER_SIZES : BRUSH_SIZES)[sizeIndex]!;
  const needsWord = turn.isFirst && word.trim() === '';

  return (
    <div className="turn">
      <div className="turn-head">
        <div className="frame-badge">
          Frame {turn.frameNumber}
          <span> of {turn.totalFrames}</span>
        </div>
        <p className="turn-hint">
          {turn.isFirst
            ? 'Pick a secret word and draw the first frame. Nobody else will ever see the word.'
            : 'Draw the next frame. The faded drawing is the frame before yours.'}
        </p>
        <Timer seconds={left} />
      </div>

      {turn.isFirst && (
        <div className="word-row">
          <input
            className="input word-input"
            value={word}
            maxLength={MAX_WORD_LENGTH}
            placeholder="Your secret word…"
            onChange={(e) => setWord(e.target.value)}
            autoFocus
          />
          <button className="btn ghost" onClick={() => setWord(pick(FALLBACK_WORDS, Math.random))} title="Suggest a word">
            🎲 Suggest
          </button>
        </div>
      )}

      <div className="turn-body">
        <Toolbar
          color={color}
          sizeIndex={sizeIndex}
          erase={erase}
          onColor={setColor}
          onSize={setSizeIndex}
          onErase={setErase}
        />
        <DrawCanvas
          strokes={strokes}
          onion={turn.prevFrames}
          showOnion={showOnion}
          tool={{ color, size, erase }}
          onStroke={(s) => commit([...strokes, s])}
        />
      </div>

      <div className="turn-actions">
        <div className="tool-group">
          <button className="btn ghost" onClick={undo} disabled={undoStack.length === 0} title="Undo (⌘Z)">
            ↶ Undo
          </button>
          <button className="btn ghost" onClick={redo} disabled={redoStack.length === 0} title="Redo (⇧⌘Z)">
            ↷ Redo
          </button>
          <button className="btn ghost" onClick={() => commit([])} disabled={strokes.length === 0}>
            Clear
          </button>
          {turn.prevFrames.length > 0 && (
            <label className="toggle" title="Onion skin (O)">
              <input type="checkbox" checked={showOnion} onChange={(e) => setShowOnion(e.target.checked)} />
              Show previous frame
            </label>
          )}
        </div>
        <button className="btn primary big" onClick={submit} disabled={needsWord} title={needsWord ? 'Write a secret word first' : ''}>
          Done ✓
        </button>
      </div>
    </div>
  );
}
