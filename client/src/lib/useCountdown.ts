import { useEffect, useState } from 'react';
import { serverNow } from './store';

/** Whole seconds left until a server-clock deadline, updated a few times a second. */
export function useCountdown(deadline: number | null): number {
  const compute = () => (deadline === null ? 0 : Math.max(0, Math.ceil((deadline - serverNow()) / 1000)));
  const [left, setLeft] = useState(compute);
  useEffect(() => {
    setLeft(compute());
    if (deadline === null) return;
    const id = setInterval(() => setLeft(compute()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  return left;
}
