import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { TONES, clamp01, classes, num, oneOf, rowsOf, text } from './props';
import type { Props } from './props';

// Content primitives: words, labels, records and lists of them.

const TEXT_VARIANTS = ['body', 'label', 'title', 'display', 'mono', 'tag'] as const;

export const Text: NovaComponent<Props> = ({ children, value, variant, tone }) => (
  <span className={classes('en-text', `en-text--${oneOf(variant, TEXT_VARIANTS, 'body')}`, `en-tone--${oneOf(tone, TONES, 'plain')}`)}>
    {value === undefined ? children : text(value)}
  </span>
);

// Renders nothing without a label: a badge bound to a record that has not
// loaded yet must not flash an empty pill.
export const Badge: NovaComponent<Props> = ({ label, tone }) => {
  const shown = text(label);
  if (shown === '') return null;
  return <span className={classes('en-badge', `en-tone--${oneOf(tone, TONES, 'plain')}`)}>{shown}</span>;
};

export const Card: NovaComponent<Props> = ({ children, title, subtitle, tone }) => (
  <section className={classes('en-card', `en-card--${oneOf(tone, TONES, 'plain')}`)}>
    <header className="en-card__head">
      <div className="en-card__titles">
        <h3 className="en-card__title">{text(title)}</h3>
        {text(subtitle).trim() === '' ? null : <span className="en-card__subtitle">{text(subtitle)}</span>}
      </div>
    </header>
    <div className="en-card__body">{children}</div>
  </section>
);

// `items: [{ label, value }]`. Pairs whose value is empty are dropped, so a
// record that is still loading shows fewer rows rather than a column of blanks.
export const KeyValue: NovaComponent<Props> = ({ items, inline }) => {
  const pairs = rowsOf(items).filter((item) => text(item['value']) !== '');
  if (pairs.length === 0) return null;
  return (
    <dl className={classes('en-kv', inline === true && 'en-kv--inline')}>
      {pairs.map((item, index) => (
        <div className="en-kv__pair" key={`${text(item['label'])}-${index}`}>
          <dt>{text(item['label'])}</dt>
          <dd>{text(item['value'])}</dd>
        </div>
      ))}
    </dl>
  );
};

// Repeated structure is a spec prop, not a component: which key is the primary
// line, which the secondary, which sits at the right edge. A row with a ref on
// the node is clickable and hands the row back as the payload.
export const List: NovaComponent<Props> = ({ rows, rowKey, title, primaryKey, primarySuffix, secondaryKey, secondaryPrefix, secondarySuffix, metaKey, metaSuffix, badgeKey, max, empty, tone, novaRef }) => {
  const dispatch = useNovaDispatch();
  // `max` shows the first few and says how many were left out: a glance, not a
  // feed — and never a silent truncation.
  const all = rowsOf(rows);
  const limit = num(max, all.length);
  const list = all.slice(0, limit);
  // Units around a value are the spec's, not the data's: ' kph', ':00'. A cell
  // with no value shows nothing, not an orphaned suffix.
  const dressed = (value: unknown, prefix: unknown, suffix: unknown): string => (text(value) === '' ? '' : `${text(prefix)}${text(value)}${text(suffix)}`);
  return (
    <div className="en-list">
      {text(title) === '' ? null : <span className="en-text en-text--label en-tone--mute">{text(title)}</span>}
      {list.length === 0 ? (
        <span className="en-text en-tone--mute">{text(empty)}</span>
      ) : (
        <ul className="en-list__rows">
          {list.map((row, index) => (
            <li
              key={text(row[text(rowKey)]) || index}
              className={classes('en-list__row', novaRef !== undefined && 'en-list__row--action')}
              onClick={novaRef === undefined ? undefined : () => dispatch({ type: 'ui:click', ref: novaRef, payload: row })}
            >
              <span className={classes('en-list__primary', `en-tone--${oneOf(tone, TONES, 'plain')}`)}>
                {text(row[text(primaryKey)])}
                {text(primarySuffix)}
              </span>
              <span className="en-list__secondary">
                {text(row[text(badgeKey)]) === '' ? null : <span className="en-list__badge">{text(row[text(badgeKey)])}</span>}
                {dressed(row[text(secondaryKey)], secondaryPrefix, secondarySuffix)}
              </span>
              <span className="en-list__meta">{dressed(row[text(metaKey)], '', metaSuffix)}</span>
            </li>
          ))}
        </ul>
      )}
      {all.length > list.length ? <span className="en-text en-text--mono en-tone--mute">+{all.length - list.length} more</span> : null}
    </div>
  );
};

// A row of small labelled tags behind one muted prefix: `prefix` says what
// KIND of thing they are ("heard", "filters", "selected"), each item carries a
// label and optionally a tone. Renders nothing when there are none. `stateKey`
// names a field to print small beside each label — an instrument's reading of
// the tag — and is empty for anybody who only wants the tags.
export const Tags: NovaComponent<Props> = ({ items, prefix, stateKey }) => {
  const tags = rowsOf(items).filter((item) => text(item['label']) !== '');
  if (tags.length === 0) return null;
  return (
    <div className="en-tags">
      {text(prefix) === '' ? null : <span className="en-text en-text--label en-tone--mute">{text(prefix)}</span>}
      {tags.map((item, index) => (
        <span key={`${text(item['label'])}-${index}`} className={classes('en-tag', `en-tone--${oneOf(item['tone'], TONES, 'plain')}`)}>
          {text(item['label'])}
          {text(stateKey) === '' || text(item[text(stateKey)]) === '' ? null : <span className="en-tag__state">{text(item[text(stateKey)])}</span>}
        </span>
      ))}
    </div>
  );
};

// A bar from 0 to 1. `compact` is the trace's variant: label and number on one
// line over a hairline bar.
export const Meter: NovaComponent<Props> = ({ value, label, tone, compact }) => {
  const level = clamp01(num(value, 0));
  return (
    <div className={classes('en-meter', compact === true && 'en-meter--compact')}>
      <div className="en-meter__head">
        <span>{text(label)}</span>
        <span>{level.toFixed(2)}</span>
      </div>
      <div className="en-meter__track">
        <div className={classes('en-meter__fill', `en-tone--${oneOf(tone, TONES, 'accent')}`)} style={{ width: `${level * 100}%` }} />
      </div>
    </div>
  );
};

// An offered option. The click carries `value` — whatever the layout bound to
// it — and the meter underneath says how sure whoever offered it was.
export const Chip: NovaComponent<Props> = ({ label, value, meter, done, novaRef }) => {
  const dispatch = useNovaDispatch();
  return (
    <button type="button" className={classes('en-chip', done === true && 'en-chip--done')} onClick={novaRef === undefined ? undefined : () => dispatch({ type: 'ui:click', ref: novaRef, payload: value })}>
      <span>{text(label)}</span>
      {meter === undefined ? null : <span className="en-chip__meter" style={{ width: `${clamp01(num(meter, 0)) * 100}%` }} />}
    </button>
  );
};
