import { useRef } from 'react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import { classes, num, rowsOf, text } from './props';
import type { Props } from './props';

// nova has `ui:focus` and `ui:blur` and no hover event, so pointing with a mouse and
// tabbing both say `ui:focus`. Every event is a round trip to the shell, so attention is
// reported when it settles: a key left and re-entered inside this window sends nothing.
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

export const SHOW_ALL = '__all__';

export const Rail: NovaComponent<Props> = ({ rows, rowKey, tagKey, toneKey, primaryKey, secondaryKey, detailKey, open, max, empty, novaRef }) => {
  const dispatch = useNovaDispatch();
  const all = rowsOf(rows);
  const shown = all.slice(0, num(max, all.length));
  const opened = text(open);
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
