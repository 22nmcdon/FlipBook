export function Timer({ seconds }: { seconds: number }) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return (
    <div className={`timer ${seconds <= 10 ? 'urgent' : ''}`} role="timer" aria-live="off">
      {m}:{s}
    </div>
  );
}
