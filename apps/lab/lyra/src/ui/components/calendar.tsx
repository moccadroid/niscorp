import { z } from 'zod';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { cx } from '../lib/cx';
import { markColor } from '../lib/tokens';

const CalendarProps = z
  .object({
    sessions: z.array(z.record(z.string(), z.unknown())).optional(),
    days: z.number().optional().describe('How many days to lay out — a week'),
    skip: z.number().optional().describe('How many days past the first to start at, so the same read serves week one and week two'),
    stepRef: z.string().optional().describe('Where to send a week step. The sessions use novaRef; this is a second target so one component can do both.'),
    locale: z.string().optional().describe("The reader's language tag, for the day and month names this component has to format itself"),
    loading: z.boolean().optional(),
    empty: z.string().optional(),
  })
  .strict();

type CalendarP = Partial<z.infer<typeof CalendarProps>> & { novaRef?: string };

const str = (row: Record<string, unknown>, key: string): string => {
  const value = row[key];
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
};

const dayKey = (value: string): string => value.slice(0, 10);

/** UTC midnight for an ISO date, so a column never shifts under a local zone. */
const utc = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

const dayNumber = (iso: string): string => String(Number(iso.slice(8, 10)));

export const Calendar: NovaComponent<Partial<z.infer<typeof CalendarProps>>> = ({ sessions, days = 7, skip = 0, stepRef, loading, empty, locale = 'en', novaRef }: CalendarP) => {
  const dispatch = useNovaDispatch();
  if (loading === true) return <div className="ly-cal__wait">Loading the week…</div>;

  const rows = sessions ?? [];
  // EVERY DAY IN THE RANGE, not every day that has something on it. The empty
  // ones are the information.
  const first = rows.length > 0 ? dayKey(str(rows[0] as Record<string, unknown>, 'held_on')) : '';
  if (first === '') return <div className="ly-cal__wait">{empty ?? 'Nothing scheduled.'}</div>;

  const start = new Date(utc(first).getTime() + skip * 86_400_000);
  const columns = Array.from({ length: days }, (_, offset) => {
    const date = new Date(start.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    return { date, sessions: rows.filter((row) => dayKey(str(row as Record<string, unknown>, 'held_on')) === date) };
  });

  // THE ONE COMPONENT THAT FORMATS A DATE, and the empty days are the reason.
  //
  // Everywhere else a screen is HANDED its words: a read maps `$localeDate` at
  // the source and the component prints what it got. A calendar cannot be
  // served that way — it lays out every day in the range, and the days with
  // nothing on them have no row to be handed. So it takes the studio's tag and
  // asks `Intl`, which is the same thing the read does, one seam later.
  //
  // What must never grow back here is a table of weekday names. That is what
  // this was: seven English strings a German studio read as "Sun Mon Tue",
  // unreachable by the phrase book because the render pass swaps PROPS and
  // these were invented after it ran.
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const monthOf = (iso: string): string => monthFormat.format(utc(iso));
  const firstDay = columns[0]?.date ?? '';
  const lastDay = columns[columns.length - 1]?.date ?? '';
  const range = firstDay === '' ? '' : `${dayNumber(firstDay)} ${monthOf(firstDay)} – ${dayNumber(lastDay)} ${monthOf(lastDay)}`;
  const step = (by: number): void => {
    const last = rows.length > 0 ? dayKey(str(rows[rows.length - 1] as Record<string, unknown>, 'held_on')) : first;
    const span = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000);
    const next = Math.min(Math.max(0, skip + by), Math.max(0, span - days + 1));
    if (stepRef !== undefined) dispatch({ type: 'ui:click', ref: stepRef, payload: { skip: next } });
  };

  return (
    <div className="ly-cal__wrap">
      {/* STEP THROUGH THE WEEKS. Two buttons labelled "This week" and "Next
        * week" is a menu of exactly two answers pretending to be navigation —
        * it cannot express "the week after next" and never will. An arrow can.
        */}
      <div className="ly-cal__bar">
        <button type="button" className="ly-cal__step" onClick={() => step(-days)} disabled={skip === 0} aria-label="Previous week">
          ‹
        </button>
        <span className="ly-cal__range">{range}</span>
        <button type="button" className="ly-cal__step" onClick={() => step(days)} aria-label="Next week">
          ›
        </button>
      </div>
      <div className="ly-cal">
      {columns.map((column) => (
        <div key={column.date} className="ly-cal__day">
          <div className="ly-cal__head">
            <span className="ly-cal__dow">{weekdayFormat.format(utc(column.date))}</span>
            <span className="ly-cal__num">{dayNumber(column.date)}</span>
          </div>
          {column.sessions.length === 0 ? (
            // Said out loud, because "nothing on Tuesday" is a thing a studio
            // wants to notice rather than scroll past.
            <div className="ly-cal__none">—</div>
          ) : (
            column.sessions.map((session) => {
              const row = session as Record<string, unknown>;
              return (
                <button
                  key={str(row, 'session_id')}
                  type="button"
                  className={cx('ly-cal__item', row['cancelled'] === true && 'ly-cal__item--off')}
                  style={{ borderLeftColor: markColor(str(row, 'program_tone')) }}
                  onClick={() => novaRef !== undefined && dispatch({ type: 'ui:click', ref: novaRef, payload: row })}
                >
                  <span className="ly-cal__time">{str(row, 'starts_at')}</span>
                  <span className="ly-cal__name">{str(row, 'name')}</span>
                  <span className="ly-cal__fill">{str(row, 'booked_display')}</span>
                </button>
              );
            })
          )}
        </div>
      ))}
      </div>
    </div>
  );
};
Calendar.meta = { description: 'A week as a grid — one column per day, empty days visibly empty.', propsSchema: CalendarProps };
