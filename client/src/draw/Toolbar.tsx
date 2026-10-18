import { BRUSH_SIZES, ERASER_SIZES, PALETTE } from '@flipbook/shared';

interface Props {
  color: string;
  sizeIndex: number;
  erase: boolean;
  onColor: (color: string) => void;
  onSize: (index: number) => void;
  onErase: (erase: boolean) => void;
}

export function Toolbar({ color, sizeIndex, erase, onColor, onSize, onErase }: Props) {
  const sizes = erase ? ERASER_SIZES : BRUSH_SIZES;
  return (
    <div className="toolbar">
      <div className="tool-group tools" role="radiogroup" aria-label="Tool">
        <button className={`tool ${!erase ? 'active' : ''}`} onClick={() => onErase(false)} title="Pen (B)">
          ✏️
        </button>
        <button className={`tool ${erase ? 'active' : ''}`} onClick={() => onErase(true)} title="Eraser (E)">
          🧽
        </button>
      </div>
      <div className="tool-group sizes" role="radiogroup" aria-label="Size">
        {sizes.map((s, i) => (
          <button key={s} className={`tool ${i === sizeIndex ? 'active' : ''}`} onClick={() => onSize(i)} title={`Size ${i + 1} (${i + 1})`}>
            <span
              className="size-dot"
              style={{ width: 6 + i * 7, height: 6 + i * 7, background: erase ? '#c9c3b6' : color }}
            />
          </button>
        ))}
      </div>
      <div className="tool-group palette" role="radiogroup" aria-label="Color">
        {PALETTE.map((c) => (
          <button
            key={c}
            className={`swatch ${c === color && !erase ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => {
              onColor(c);
              onErase(false);
            }}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>
    </div>
  );
}
