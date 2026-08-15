import { useMemo, useState } from 'react';
import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';
import { evaluate } from '@niscorp/prism';
import { GERMAN } from './books';
import { Aside, LANGUAGE_KIT } from './kit';

// THE HALF THAT IS NOT TRANSLATION AT ALL.
//
// A dictionary can hold "Standing". It can never hold "Fri 14 Mar" or "€ 89,00"
// — unbounded cardinality, and no book will ever have the row. So money, dates
// and numbers are formatted AT THEIR SOURCE by prism's `$localeDate`,
// `$localeMoney` and `$localeNumber`, which hand the job to `Intl`.
//
// AND THE TWO HALVES SPLIT ON DIFFERENT AXES. Words are per LANGUAGE: Vienna
// and Hamburg read the same sentences, so there is one German book. Formatting
// is per REGION, derived from the full tag — and one currency in one language
// is written three ways across three countries:
//
//     de-AT   € 89,00     14.03.2026
//     de-DE   89,00 €     14.03.2026
//     de-CH   € 89.00     14.03.2026
//     en-GB   €89.00      14/03/2026
//
// No symbol table gets this right. `Intl` already knows it, and it is in the
// platform — which is why prism ships no locale data and nova knows no
// languages. Switch the tag below: the FIGURES move, the WORDS only move when
// the language part changes.

const TAGS = ['de-AT', 'de-DE', 'de-CH', 'en-GB'] as const;

const layout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'row', gap: 12, wrap: true },
  children: [
    { component: 'Stat', props: { label: 'Plan', value: '$.money' } },
    { component: 'Stat', props: { label: 'Standing', value: '$.date' } },
    { component: 'Stat', props: { label: 'Person', value: '$.number' } },
  ],
};

export const Demo = () => {
  const [tag, setTag] = useState<string>('de-AT');

  // prism does the formatting, at the source, from the FULL tag.
  const data = useMemo(
    () => ({
      money: evaluate({ $localeMoney: { value: 8900, currency: 'EUR', locale: tag } }, {}),
      date: evaluate({ $localeDate: { value: '2026-03-14', locale: tag } }, {}),
      number: evaluate({ $localeNumber: { value: 1234.5, locale: tag } }, {}),
    }),
    [tag],
  );

  // nova does the words, from the LANGUAGE half of the same tag. No shell here
  // at all — `<Nova.Layout>` forwards the book to the renderer like any other
  // host, which is the point: i18n is not a shell feature either.
  const book = tag.startsWith('de') ? GERMAN : undefined;

  return (
    <div style={{ padding: 20, maxWidth: 620, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {TAGS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTag(option)}
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 13,
              padding: '5px 12px',
              borderRadius: 999,
              cursor: 'pointer',
              border: `1px solid ${tag === option ? '#2563eb' : '#d1d5db'}`,
              background: tag === option ? '#2563eb' : '#fff',
              color: tag === option ? '#fff' : '#374151',
            }}
          >
            {option}
          </button>
        ))}
      </div>

      <Nova.Layout layout={layout} data={data} components={LANGUAGE_KIT} {...(book === undefined ? {} : { phrases: book })} />

      <Aside>
        The three <em>labels</em> come from the book and change only between <code>de-*</code> and
        <code> en-GB</code> — one German book serves Vienna, Hamburg and Zürich. The three
        <em> figures</em> come from <code>Intl</code> via prism and change between all four. That is
        the whole split: <strong>words are per language, formatting is per region</strong>. Seeding
        three near-identical copies of a German book was the alternative, and the first wording fix
        would then have landed in three places.
      </Aside>
    </div>
  );
};
