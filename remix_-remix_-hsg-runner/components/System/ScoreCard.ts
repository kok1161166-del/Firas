/**
 * Score card renderer.
 *
 * The shareable result is a PNG drawn by us, not a line of text the player
 * can retype. Every number on it comes from the server-accepted payload and
 * it carries the signed receipt, so the image and the server ledger always
 * agree — a screenshot of this card is evidence, not a claim.
 */

export interface ScoreCardData {
  score: number;
  distance: number;
  gems: number;
  letters: number;
  tiers: number;
  receipt: string;
  verified: boolean;
  best: number;
}

const W = 1080;
const H = 1350;

const INK = '#0B0906';
const INK_2 = '#100C07';
const GOLD = '#C9A24B';
const GOLD_LT = '#F0DDAE';
const GOLD_PALE = '#FFF3D6';
const GOLD_DK = '#8A6A3A';
const EMBER = '#E2742B';
const FIRE = '#53FC18';

const fmt = (n: number) => Math.round(n || 0).toLocaleString('en-US');

const goldGradient = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, GOLD_PALE);
  g.addColorStop(0.28, GOLD_LT);
  g.addColorStop(0.62, GOLD);
  g.addColorStop(1, GOLD_DK);
  return g;
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const drawDiamond = (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.restore();
};

export const buildScoreCard = async (data: ScoreCardData): Promise<Blob> => {
  // Make sure the display font is rasterised before we measure anything.
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try { await (document as any).fonts.load('900 128px Outfit'); await (document as any).fonts.ready; } catch { /* fallback font is fine */ }
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  const display = (weight: number, size: number) =>
    `${weight} ${size}px Outfit, "Segoe UI", system-ui, sans-serif`;
  const arabic = (weight: number, size: number) =>
    `${weight} ${size}px Tajawal, "Segoe UI", system-ui, sans-serif`;

  /* ------------------------------- backdrop ------------------------------- */
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  // Warm blooms
  const bloomA = ctx.createRadialGradient(W * 0.28, H * 0.16, 0, W * 0.28, H * 0.16, W * 0.72);
  bloomA.addColorStop(0, 'rgba(201,162,75,0.26)');
  bloomA.addColorStop(1, 'rgba(201,162,75,0)');
  ctx.fillStyle = bloomA;
  ctx.fillRect(0, 0, W, H);

  const bloomB = ctx.createRadialGradient(W * 0.86, H * 0.9, 0, W * 0.86, H * 0.9, W * 0.62);
  bloomB.addColorStop(0, 'rgba(138,106,58,0.28)');
  bloomB.addColorStop(1, 'rgba(138,106,58,0)');
  ctx.fillStyle = bloomB;
  ctx.fillRect(0, 0, W, H);

  // Citadel grid
  ctx.save();
  ctx.strokeStyle = 'rgba(201,162,75,0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 60) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
  ctx.restore();

  // Embers
  for (let i = 0; i < 46; i++) {
    const x = (i * 137.5) % W;
    const y = H - ((i * 211) % (H * 0.9));
    const r = 1 + ((i * 7) % 3) * 0.8;
    const a = 0.10 + ((i * 13) % 10) / 34;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(240,221,174,${a})`;
    ctx.fill();
  }

  // Vignette
  const vig = ctx.createRadialGradient(W / 2, H * 0.42, W * 0.22, W / 2, H * 0.5, W * 0.86);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.66)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  /* --------------------------------- frame -------------------------------- */
  const M = 62;
  roundRect(ctx, M, M, W - M * 2, H - M * 2, 40);
  const frameGrad = ctx.createLinearGradient(0, M, 0, H - M);
  frameGrad.addColorStop(0, 'rgba(240,221,174,0.55)');
  frameGrad.addColorStop(0.35, 'rgba(201,162,75,0.28)');
  frameGrad.addColorStop(1, 'rgba(138,106,58,0.42)');
  ctx.strokeStyle = frameGrad;
  ctx.lineWidth = 2;
  ctx.stroke();

  // top hairline + corner ticks
  const hair = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
  hair.addColorStop(0, 'rgba(240,221,174,0)');
  hair.addColorStop(0.5, 'rgba(240,221,174,0.95)');
  hair.addColorStop(1, 'rgba(240,221,174,0)');
  ctx.fillStyle = hair;
  ctx.fillRect(W * 0.2, M - 1, W * 0.6, 3);

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  const tick = 26;
  const corners: [number, number, number, number][] = [
    [M, M, 1, 1], [W - M, M, -1, 1], [M, H - M, 1, -1], [W - M, H - M, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * tick, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * tick);
    ctx.stroke();
  }

  /* -------------------------------- header -------------------------------- */
  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD_LT;
  ctx.font = display(800, 30);
  ctx.letterSpacing = '14px';
  ctx.fillText('FIRAS · RISE WITH FIRE', W / 2, M + 96);
  ctx.letterSpacing = '0px';

  drawDiamond(ctx, W / 2, M + 126, 13, GOLD);

  ctx.fillStyle = 'rgba(240,221,174,0.62)';
  ctx.font = display(800, 22);
  ctx.letterSpacing = '8px';
  ctx.fillText('CITADEL RUNNER · ENDLESS RUN', W / 2, M + 176);
  ctx.letterSpacing = '0px';

  /* --------------------------------- score -------------------------------- */
  const scoreY = M + 350;
  ctx.font = display(900, 168);
  ctx.fillStyle = goldGradient(ctx, W * 0.2, scoreY - 130, W * 0.8, scoreY + 20);
  ctx.shadowColor = 'rgba(201,162,75,0.55)';
  ctx.shadowBlur = 42;
  ctx.fillText(fmt(data.score), W / 2, scoreY);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(240,221,174,0.58)';
  ctx.font = display(800, 26);
  ctx.letterSpacing = '12px';
  ctx.fillText('TOTAL SCORE', W / 2, scoreY + 62);
  ctx.letterSpacing = '0px';

  /* ------------------------------ stat strip ------------------------------ */
  const stats: [string, string][] = [
    ['DISTANCE', `${fmt(data.distance)} LY`],
    ['GEMS', fmt(data.gems)],
    ['TIERS', fmt(data.tiers)],
    ['LETTERS', fmt(data.letters)],
  ];

  const stripY = scoreY + 132;
  const stripH = 148;
  const gap = 20;
  const innerW = W - M * 2 - 96;
  const cellW = (innerW - gap * 3) / 4;

  stats.forEach(([label, value], i) => {
    const x = M + 48 + i * (cellW + gap);
    roundRect(ctx, x, stripY, cellW, stripH, 22);
    const g = ctx.createLinearGradient(0, stripY, 0, stripY + stripH);
    g.addColorStop(0, 'rgba(201,162,75,0.14)');
    g.addColorStop(1, 'rgba(11,9,6,0.55)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(201,162,75,0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(240,221,174,0.55)';
    ctx.font = display(800, 19);
    ctx.letterSpacing = '4px';
    ctx.fillText(label, x + cellW / 2, stripY + 44);
    ctx.letterSpacing = '0px';

    ctx.fillStyle = GOLD_PALE;
    ctx.font = display(900, 46);
    ctx.fillText(value, x + cellW / 2, stripY + 108);
  });

  /* ------------------------------- verdict -------------------------------- */
  const badgeY = stripY + stripH + 74;
  const verified = data.verified;

  roundRect(ctx, W / 2 - 292, badgeY - 46, 584, 92, 46);
  ctx.fillStyle = verified ? 'rgba(83,252,24,0.10)' : 'rgba(226,116,43,0.12)';
  ctx.fill();
  ctx.strokeStyle = verified ? 'rgba(83,252,24,0.45)' : 'rgba(226,116,43,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // seal dot
  ctx.beginPath();
  ctx.arc(W / 2 - 238, badgeY, 15, 0, Math.PI * 2);
  ctx.fillStyle = verified ? FIRE : EMBER;
  ctx.shadowColor = verified ? 'rgba(83,252,24,0.85)' : 'rgba(226,116,43,0.85)';
  ctx.shadowBlur = 26;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.textAlign = 'left';
  ctx.fillStyle = verified ? '#DFFFC4' : '#FFD9A8';
  ctx.font = display(900, 30);
  ctx.letterSpacing = '4px';
  ctx.fillText(verified ? 'SERVER VERIFIED' : 'UNVERIFIED RUN', W / 2 - 208, badgeY - 6);

  ctx.fillStyle = 'rgba(240,221,174,0.55)';
  ctx.font = display(700, 20);
  ctx.letterSpacing = '3px';
  ctx.fillText('RECEIPT', W / 2 - 208, badgeY + 26);
  ctx.fillStyle = GOLD_LT;
  ctx.font = display(800, 22);
  ctx.letterSpacing = '2px';
  ctx.fillText(data.receipt || '— LOCAL ONLY —', W / 2 - 84, badgeY + 27);
  ctx.letterSpacing = '0px';

  if (!verified) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(226,116,43,0.75)';
    ctx.font = arabic(500, 22);
    ctx.fillText('السكور مش متحقق منه على السيرفر', W / 2, badgeY + 78);
  }

  /* -------------------------------- footer -------------------------------- */
  const footY = H - M - 92;
  ctx.strokeStyle = 'rgba(201,162,75,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M + 60, footY - 34);
  ctx.lineTo(W - M - 60, footY - 34);
  ctx.stroke();

  drawDiamond(ctx, W / 2, footY - 34, 10, GOLD);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(240,221,174,0.5)';
  ctx.font = display(800, 24);
  ctx.letterSpacing = '10px';
  ctx.fillText('BEST', W / 2, footY + 34);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = GOLD_LT;
  ctx.font = display(900, 52);
  ctx.fillText(fmt(data.best), W / 2, footY + 96);

  ctx.fillStyle = 'rgba(240,221,174,0.35)';
  ctx.font = display(700, 22);
  ctx.letterSpacing = '5px';
  ctx.fillText('firasx.vercel.app', W / 2, footY + 142);
  ctx.letterSpacing = '0px';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png', 0.96);
  });
};

/* ------------------------------- sharing ---------------------------------- */

const fileName = (score: number) => `firas-runner-${Math.round(score)}.png`;

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export const shareScoreCard = async (blob: Blob, score: number): Promise<ShareOutcome> => {
  const name = fileName(score);
  const file = new File([blob], name, { type: 'image/png' });

  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  if (nav && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: 'FIRAS · Citadel Runner',
        text: `${fmt(score)} نقطة في قلعة فراس — جرّب تحدّاك`,
      });
      return 'shared';
    } catch (err: any) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // Fall through to a download when the share sheet is unavailable.
    }
  }

  download(blob, name);
  return 'downloaded';
};