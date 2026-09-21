import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { TONES, clamp01, classes, num, oneOf, rowsOf, text } from './props';
import type { Props, Row } from './props';

// THE FOUR DATA-DRIVEN PRIMITIVES. Each is handed plain rows plus the NAMES of
// the keys that matter, and draws. None of them knows what it is drawing: the
// timeline has rows of bars, not stages of sets; the map has rectangles with a
// number from 0 to 1, not zones with a crowd. Which is what lets the next app
// use them for a hospital's theatres or a port's berths without touching this
// file.

// ─── Timeline ────────────────────────────────────────────────
// Flat bars, grouped here by `rowKey`, laid on one axis. `from`/`to`/`step` are
// in the data's own unit; the axis prints tick / 60 when the step divides an
// hour, because a number of minutes past midnight is not something anyone
// reads — that is axis rendering, the chart's own business.
const tickLabel = (tick: number, step: number): string => (step % 60 === 0 ? String(Math.floor(tick / 60) % 24).padStart(2, '0') : String(tick));

export const Timeline: NovaComponent<Props> = ({ bars, idKey, rowKey, labelKey, startKey, endKey, toneKey, noteKey, from, to, step, highlight, empty }) => {
  const all = rowsOf(bars);
  if (all.length === 0) return <span className="en-text en-tone--mute">{text(empty)}</span>;

  const start = num(from, 0);
  const end = Math.max(start + 1, num(to, 100));
  const stride = Math.max(1, num(step, (end - start) / 10));
  const ticks = Array.from({ length: Math.floor((end - start) / stride) + 1 }, (_, index) => start + index * stride);
  const percent = (value: number): number => clamp01((value - start) / (end - start)) * 100;

  const groups = new Map<string, Row[]>();
  for (const bar of all) {
    const key = text(bar[text(rowKey)]);
    groups.set(key, [...(groups.get(key) ?? []), bar]);
  }
  const lit = text(highlight);

  return (
    <div className="en-timeline">
      <div className="en-timeline__axis">
        <span />
        <div className="en-timeline__ticks">
          {ticks.map((tick) => (
            <span key={tick} className="en-timeline__tick" style={{ left: `${percent(tick)}%` }}>
              {tickLabel(tick, stride)}
            </span>
          ))}
        </div>
      </div>
      {[...groups.entries()].map(([label, group]) => (
        <div className="en-timeline__row" key={label}>
          <span className="en-timeline__label">{label}</span>
          <div className="en-timeline__lane">
            {group.map((bar, index) => {
              const left = percent(num(bar[text(startKey)], start));
              const right = percent(num(bar[text(endKey)], start));
              const id = text(bar[text(idKey)]);
              // A bar may arrive with a TONE and a note saying why — decided
              // upstream, in the read. The timeline only knows tones exist.
              const tone = oneOf(bar[text(toneKey)], TONES, 'plain');
              const note = text(bar[text(noteKey)]);
              return (
                <span
                  key={id || index}
                  className={classes('en-timeline__bar', tone !== 'plain' && `en-timeline__bar--${tone}`, lit !== '' && id === lit && 'en-timeline__bar--lit')}
                  style={{ left: `${left}%`, width: `${Math.max(1.5, right - left)}%` }}
                  title={note === '' ? text(bar[text(labelKey)]) : `${text(bar[text(labelKey)])} — ${note}`}
                >
                  {text(bar[text(labelKey)])}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── ZoneMap ─────────────────────────────────────────────────
// Named rectangles on a `width` × `height` grid. `heatKey` names a 0–1 column
// that fills them; with no heat key the plan is drawn bare. `focus` outlines
// one by id.
export const ZoneMap: NovaComponent<Props> = ({ zones, idKey, labelKey, heatKey, focus, width, height }) => {
  const list = rowsOf(zones);
  const gridWidth = num(width, 100);
  const gridHeight = num(height, 60);
  const heatColumn = text(heatKey);
  const focused = text(focus);
  return (
    <svg className="en-map" viewBox={`0 0 ${gridWidth} ${gridHeight}`} role="img">
      {list.map((zone, index) => {
        const id = text(zone[text(idKey)]);
        const x = num(zone['x'], 0);
        const y = num(zone['y'], 0);
        const w = num(zone['w'], 10);
        const h = num(zone['h'], 10);
        const heat = heatColumn === '' ? 0 : clamp01(num(zone[heatColumn], 0));
        return (
          <g key={id || index} className={classes('en-map__zone', focused !== '' && id === focused && 'en-map__zone--focus')}>
            <rect x={x} y={y} width={w} height={h} rx={1.2} className="en-map__plot" />
            <rect x={x} y={y} width={w} height={h} rx={1.2} className={classes('en-map__heat', heat >= 0.85 && 'en-map__heat--hot')} style={{ opacity: heat * 0.85 }} />
            <text x={x + 1.6} y={y + 4.4} className="en-map__label">
              {text(zone[text(labelKey)])}
            </text>
            {heatColumn === '' ? null : (
              <text x={x + 1.6} y={y + 8.2} className="en-map__value">
                {Math.round(heat * 100)}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ─── BarChart ────────────────────────────────────────────────
// `series` rows, one bar each; `highlight` marks the bar whose label equals it;
// `behind` is a second series drawn as ghosts at the same labels, scaled
// together so the comparison is honest.
export const BarChart: NovaComponent<Props> = ({ series, labelKey, valueKey, highlight, behind, tone, unit }) => {
  const bars = rowsOf(series);
  const ghosts = rowsOf(behind);
  const keyOfLabel = text(labelKey);
  const keyOfValue = text(valueKey);
  if (bars.length === 0) return <span className="en-text en-tone--mute">no data</span>;

  const valueOf = (row: Row): number => Math.max(0, num(row[keyOfValue], 0));
  const peak = Math.max(1e-9, ...bars.map(valueOf), ...ghosts.map(valueOf));
  const ghostAt = new Map(ghosts.map((row) => [text(row[keyOfLabel]), valueOf(row)]));
  const marked = text(highlight);
  const top = Math.max(...bars.map(valueOf));

  return (
    <div className="en-bars">
      <span className="en-text en-text--mono en-tone--mute">
        peak {Math.round(top * 10) / 10}
        {text(unit) === '' ? '' : ` ${text(unit)}`}
      </span>
      <div className="en-bars__plot">
        {bars.map((row, index) => {
          const label = text(row[keyOfLabel]);
          const ghost = ghostAt.get(label);
          return (
            <div className="en-bars__column" key={`${label}-${index}`} title={`${label}: ${valueOf(row)}`}>
              <div className="en-bars__stack">
                {ghost === undefined ? null : <span className="en-bars__ghost" style={{ height: `${(ghost / peak) * 100}%` }} />}
                <span
                  className={classes('en-bars__bar', `en-tone--${oneOf(tone, TONES, 'accent')}`, marked !== '' && label === marked && 'en-bars__bar--marked')}
                  style={{ height: `${(valueOf(row) / peak) * 100}%` }}
                />
              </div>
              <span className={classes('en-bars__label', marked !== '' && label === marked && 'en-bars__label--marked')}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Gauge ───────────────────────────────────────────────────
// value / max on a half-dial. `warnAt` (0–1) is where it turns to the warning
// tone — a threshold is data, so the layout sets it.
export const Gauge: NovaComponent<Props> = ({ value, max, label, warnAt }) => {
  const ceiling = Math.max(1e-9, num(max, 1));
  const amount = Math.max(0, num(value, 0));
  const fill = clamp01(amount / ceiling);
  const isHot = fill >= num(warnAt, 2);
  // A semicircle of radius 40: its length is π·r, and the dash offset is the
  // part of it left unfilled.
  const arc = Math.PI * 40;
  return (
    <div className="en-gauge">
      <svg viewBox="0 0 100 56" className="en-gauge__dial" role="img">
        <path d="M 10 50 A 40 40 0 0 1 90 50" className="en-gauge__track" />
        <path d="M 10 50 A 40 40 0 0 1 90 50" className={classes('en-gauge__fill', isHot && 'en-gauge__fill--hot')} style={{ strokeDasharray: arc, strokeDashoffset: arc * (1 - fill) }} />
        <text x="50" y="46" className="en-gauge__figure">
          {Math.round(fill * 100)}%
        </text>
      </svg>
      <span className="en-text en-text--mono en-tone--mute">
        {Math.round(amount)} / {Math.round(ceiling)} {text(label)}
      </span>
    </div>
  );
};
