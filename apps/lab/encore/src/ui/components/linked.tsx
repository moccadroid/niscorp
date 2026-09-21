import { useRef } from 'react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import { classes, num, rowsOf, text } from './props';
import type { Props } from './props';

// THREE PRIMITIVES ABOUT ATTENTION, and none of them has heard of an agent.
//
//   Spans      a run of text in segments, some of which carry a KEY. A keyed
//              span says when it has the reader's attention, and draws itself
//              lit when the key it is told is active is its own.
//   Spotlight  a wrapper with a key of its own, which does the same two things
//              for whatever is inside it.
//   Rail       a column of one-line entries, one of which may be open.
//
// What a key MEANS — "this sentence stands on that card" — is wired in actions:
// a span and a box that carry the same key light each other over the message
// bus, and that is the whole of the citation mechanism. The kit only knows that
// a key can be pointed at.
//
// ATTENTION IS ONE EVENT, not two: nova has `ui:focus` and `ui:blur` and no
// hover event, so pointing at something with a mouse and tabbing to it both say
// `ui:focus`, and leaving says `ui:blur`. Which is also the right semantics — a
// keyboard user arrowing through an answer lights the same cards.
//
// A pointer crossing a paragraph enters and leaves a dozen spans in a second,
// and every event here is a round trip to the shell. So attention is reported
// when it SETTLES: a change of key is sent after a short quiet, and a key that
// is left and re-entered inside that window sends nothing at all.
const ATTENTION_SETTLE_MS = 120;

type Attention = { point: (key: string) => void; leave: () => void };

const useAttention = (novaRef: string | undefined): Attention => {
  const dispatch = useNovaDispatch();
  const sent = useRef('');
  const wanted = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const settle = (): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      if (novaRef === undefined || wanted.current === sent.current) return;
      sent.current = wanted.current;
      dispatch(wanted.current === '' ? { type: 'ui:blur', ref: novaRef } : { type: 'ui:focus', ref: novaRef, payload: wanted.current });
    }, ATTENTION_SETTLE_MS);
  };

  return {
    point: (key) => {
      wanted.current = key;
      settle();
    },
    leave: () => {
      wanted.current = '';
      settle();
    },
  };
};

// ─── Spans ───────────────────────────────────────────────────
// `segments`: rows of { [textKey], [linkKey] }. A segment with a link is a
// citation: underlined, focusable, lit when `active` names its link. With
// `markUnlinked` true, a segment WITHOUT one is drawn muted — words with nothing
// to stand on should look like it.
export const Spans: NovaComponent<Props> = ({ segments, textKey, linkKey, active, markUnlinked, novaRef }) => {
  const attention = useAttention(novaRef);
  const lit = text(active);
  return (
    <p className="en-spans">
      {rowsOf(segments).map((segment, index) => {
        const link = text(segment[text(linkKey)]);
        const words = text(segment[text(textKey)]);
        if (link === '') return <span key={index} className={classes('en-spans__span', markUnlinked === true && 'en-spans__span--unsupported')}>{words}</span>;
        return (
          <span
            key={index}
            tabIndex={0}
            className={classes('en-spans__span', 'en-spans__span--linked', lit === link && 'en-spans__span--lit')}
            onMouseEnter={() => attention.point(link)}
            onMouseLeave={attention.leave}
            onFocus={() => attention.point(link)}
            onBlur={attention.leave}
          >
            {words}
          </span>
        );
      })}
    </p>
  );
};

// ─── Spotlight ───────────────────────────────────────────────
// Wraps anything. `value` is its key; `active` is the key currently pointed at,
// wherever that came from.
export const Spotlight: NovaComponent<Props> = ({ children, value, active, novaRef }) => {
  const attention = useAttention(novaRef);
  const key = text(value);
  const lit = key !== '' && text(active) === key;
  return (
    <div className={classes('en-spotlight', lit && 'en-spotlight--lit')} onMouseEnter={key === '' ? undefined : () => attention.point(key)} onMouseLeave={key === '' ? undefined : attention.leave}>
      {children}
    </div>
  );
};

// ─── Rail ────────────────────────────────────────────────────
// One line per entry, however long the entry: the rail must never push what is
// under it down by more than a line each. The open entry — at most one — shows
// its `detailKey` in full. Clicking an entry says which.
// What a click on "show all" carries, instead of an entry's key.
export const SHOW_ALL = '__all__';

export const Rail: NovaComponent<Props> = ({ rows, rowKey, tagKey, toneKey, primaryKey, secondaryKey, detailKey, open, max, empty, novaRef }) => {
  const dispatch = useNovaDispatch();
  const all = rowsOf(rows);
  const shown = all.slice(0, num(max, all.length));
  const opened = text(open);
  // No `tagKey`, no tag column: a rail of plain lines.
  const isTagged = text(tagKey) !== '';
  if (all.length === 0) return text(empty) === '' ? null : <span className="en-text en-text--tag en-tone--mute">{text(empty)}</span>;
  return (
    <ol className="en-rail">
      {shown.map((row, index) => {
        const key = text(row[text(rowKey)]);
        const isOpen = key !== '' && key === opened;
        return (
          <li key={key || index} className={classes('en-rail__entry', !isTagged && 'en-rail__entry--plain', isOpen && 'en-rail__entry--open')} onClick={novaRef === undefined ? undefined : () => dispatch({ type: 'ui:click', ref: novaRef, payload: isOpen ? '' : key })}>
            {isTagged ? <span className={classes('en-rail__tag', `en-tone--${text(row[text(toneKey)]) || 'mute'}`)}>{text(row[text(tagKey)])}</span> : null}
            <span className="en-rail__primary">{text(row[text(primaryKey)])}</span>
            <span className="en-rail__secondary">{text(row[text(secondaryKey)])}</span>
            {isOpen ? <span className="en-rail__detail">{text(row[text(detailKey)])}</span> : null}
          </li>
        );
      })}
      {all.length > shown.length ? (
        <li className="en-rail__more" onClick={novaRef === undefined ? undefined : () => dispatch({ type: 'ui:click', ref: novaRef, payload: SHOW_ALL })}>
          show all ({all.length})
        </li>
      ) : null}
    </ol>
  );
};
