/** Простые графики на SVG: цвета из темы, масштаб по данным */
export type Point = { label: string; value: number };

export function ColChart({ items, title, unit }: { items: Point[]; title: string; unit?: string }) {
  const n = Math.max(items.length, 1), step = 46, W = Math.max(300, n * step + 16), H = 160, top = 20, bot = 28, bw = 24;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <figure className="chart">
      <figcaption><b className="small">{title}</b>{unit && <span className="muted small"> · {unit}</span>}</figcaption>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ width: "100%", minWidth: Math.min(W, 560), height: "auto", display: "block" }}>
          <line x1={8} x2={W - 8} y1={H - bot} y2={H - bot} stroke="var(--line)" />
          {items.map((it, i) => {
            const x = 8 + step * i + step / 2, h = (it.value / max) * (H - top - bot), y = H - bot - h;
            return (
              <g key={i}>
                {it.value > 0 && <rect x={x - bw / 2} y={y} width={bw} height={Math.max(h, 2)} rx={3} fill="var(--accent)" />}
                {it.value > 0 && <text x={x} y={y - 6} textAnchor="middle" fontSize={11} fill="var(--ink)">{it.value}</text>}
                <text x={x} y={H - 9} textAnchor="middle" fontSize={10.5} fill="var(--muted)">{it.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

export function SegBar({ title, parts }: { title: string; parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="field">
      <div className="spread"><b className="small">{title}</b><span className="muted small">всего {total}</span></div>
      <div className="seg">{total ? parts.filter((p) => p.value).map((p) => <i key={p.label} title={`${p.label}: ${p.value}`} style={{ flex: p.value, background: `var(--${p.color})` }} />) : <i style={{ flex: 1, background: "var(--surface-2)" }} />}</div>
      <div className="legend">{parts.map((p) => <span key={p.label}><i style={{ background: `var(--${p.color})` }} />{p.label}: {p.value}</span>)}</div>
    </div>
  );
}

export function HBars({ title, items, max, unit = "", colorFn }: { title: string; items: Point[]; max?: number; unit?: string; colorFn?: (v: number) => string }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="field">
      <b className="small">{title}</b>
      {items.length ? items.map((i) => (
        <div className="hb" key={i.label}><span title={i.label}>{i.label}</span>
          <div className="meter"><i style={{ width: `${Math.min(100, (i.value / m) * 100)}%`, background: `var(--${colorFn ? colorFn(i.value) : "accent"})` }} /></div>
          <b>{i.value}{unit}</b></div>
      )) : <span className="muted small">Нет данных</span>}
    </div>
  );
}
