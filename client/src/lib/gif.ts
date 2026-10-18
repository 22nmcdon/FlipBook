import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { APP_NAME, type RevealChain } from '@flipbook/shared';
import { renderFrame } from '../draw/render';

const SIZE = 480;

/** Encode a chain as a looping GIF: a title card with the word, then every frame. */
export function chainToGif(chain: RevealChain, fps: number): Blob {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();

  const write = (delay: number) => {
    watermark(ctx);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), SIZE, SIZE, { palette, delay });
  };

  titleCard(ctx, chain);
  write(1500);
  for (const f of chain.frames) {
    renderFrame(ctx, f.frame, SIZE);
    write(Math.round(1000 / fps));
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
}

function titleCard(ctx: CanvasRenderingContext2D, chain: RevealChain) {
  ctx.fillStyle = '#fffdf6';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#1d1d1f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 22px Fredoka, system-ui, sans-serif';
  ctx.fillText(`${chain.ownerName}'s secret word was`, SIZE / 2, SIZE / 2 - 40);
  ctx.font = '700 40px Fredoka, system-ui, sans-serif';
  ctx.fillText(`“${chain.word}”`, SIZE / 2, SIZE / 2 + 12, SIZE - 40);
}

function watermark(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.font = '500 13px Fredoka, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(29, 29, 31, 0.45)';
  ctx.fillText(`${APP_NAME} · ${window.location.host}`, SIZE - 10, SIZE - 8);
  ctx.restore();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
