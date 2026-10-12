import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { HUES, TONES, clamp01, classes, num, oneOf, rowsOf, text } from './props';
import type { Props } from './props';

const TEXT_VARIANTS = ['body', 'label', 'title', 'display', 'mono', 'tag', 'kicker', 'story'] as const;

export const Text: NovaComponent<Props> = ({ children, value, variant, tone }) => (
  <span className={classes('en-text', `en-text--${oneOf(variant, TEXT_VARIANTS, 'body')}`, `en-tone--${oneOf(tone, TONES, 'plain')}`)}>
    {value === undefined ? children : text(value)}
  </span>
);

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

export const List: NovaComponent<Props> = ({ rows, rowKey, title, primaryKey, primarySuffix, secondaryKey, secondaryPrefix, secondarySuffix, metaKey, metaSuffix, badgeKey, max, empty, tone, novaRef }) => {
  const dispatch = useNovaDispatch();
  const all = rowsOf(rows);
  const limit = num(max, all.length);
  const list = all.slice(0, limit);
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

export const Tags: NovaComponent<Props> = ({ items, prefix }) => {
  const tags = rowsOf(items).filter((item) => text(item['label']) !== '');
  if (tags.length === 0) return null;
  return (
    <div className="en-tags">
      {text(prefix) === '' ? null : <span className="en-text en-text--label en-tone--mute">{text(prefix)}</span>}
      {tags.map((item, index) => (
        <span key={`${text(item['label'])}-${index}`} className={classes('en-tag', `en-tone--${oneOf(item['tone'], TONES, 'plain')}`)}>
          {text(item['label'])}
        </span>
      ))}
    </div>
  );
};

export const Meter: NovaComponent<Props> = ({ value, label, tone, compact, note }) => {
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
      {compact === true ? <span className="en-meter__note">{text(note)}</span> : null}
    </div>
  );
};

export const Chip: NovaComponent<Props> = ({ label, value, meter, done, accent, novaRef }) => {
  const dispatch = useNovaDispatch();
  return (
    <button type="button" className={classes('en-chip', done === true && 'en-chip--done', text(accent) !== '' && `en-hue--${oneOf(accent, HUES, 'teal')}`, text(accent) !== '' && 'en-chip--hued')} onClick={novaRef === undefined ? undefined : () => dispatch({ type: 'ui:click', ref: novaRef, payload: value })}>
      <span>{text(label)}</span>
      {meter === undefined ? null : <span className="en-chip__meter" style={{ width: `${clamp01(num(meter, 0)) * 100}%` }} />}
    </button>
  );
};
