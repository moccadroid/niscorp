import { useRef, useState, type FC } from 'react';
import { z } from 'zod';
import { createStream } from '@niscorp/solid';
import { Pitch } from '@showroom/chrome/pitch';
import {
  DemoShell,
  PathBadges,
  StartStop,
  splitByTokens,
  type DemoState,
  type PathStatus,
} from '@showroom/modules/solid/atoms';
import { SearchResultsView } from './search-results.ui';

// Same pattern as the AI-response demo with a richer schema:
// an array of result cards plus a summary. Each result's
// `results.N` path can be selected independently, so the FINAL
// badge on each card flips on exactly when that card's data
// has fully arrived — no coarse "whole response done" moment.

export const schema = z.object({
  query: z.string(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      relevance: z.number(),
    }),
  ),
  answer: z.string(),
});

export type SearchData = z.infer<typeof schema>;

export const initial: SearchData = { query: '', results: [], answer: '' };

export const json = JSON.stringify({
  query: 'how does photosynthesis work in cacti',
  results: [
    {
      title: 'CAM Photosynthesis in Desert Plants',
      url: 'https://botany.example/cam',
      snippet:
        'Cacti use Crassulacean Acid Metabolism — they open stomata at night to minimize water loss, storing CO2 as malate to be used during daylight.',
      relevance: 0.97,
    },
    {
      title: 'Water Use Efficiency in Succulents',
      url: 'https://plantsci.example/wue',
      snippet:
        'CAM plants achieve 3-6x the water-use efficiency of C3 plants, making them uniquely adapted to arid environments.',
      relevance: 0.89,
    },
    {
      title: 'Evolution of CAM across Lineages',
      url: 'https://evo.example/cam-origin',
      snippet:
        'CAM has evolved independently in more than 30 plant families, suggesting strong selective pressure in water-limited habitats.',
      relevance: 0.74,
    },
  ],
  answer:
    'Cacti use CAM photosynthesis — opening stomata at night to fix CO2 into malate, then using that stored carbon during the day when stomata are closed. This minimizes water loss in arid environments.',
});

const selectPaths = ['query', 'results.0', 'results.1', 'results.2', 'answer'];

const InnerDemo: FC = () => {
  const [value, setValue] = useState<SearchData>(initial);
  const [state, setState] = useState<DemoState>('idle');
  const [pathStatuses, setPathStatuses] = useState<PathStatus[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);

  const start = (): void => {
    cancelRef.current?.();
    setValue(initial);
    setPathStatuses([]);
    setState('streaming');

    const stream = createStream({ schema, initial });
    stream.on(setValue);

    const statuses = new Map<string, PathStatus>();
    const t0 = performance.now();
    for (const path of selectPaths) {
      const sel = stream.select(path);
      statuses.set(path, { path, value: sel.current(), isFinal: false });
      sel.on((v) => {
        statuses.set(path, { path, value: v, isFinal: false });
        setPathStatuses([...statuses.values()]);
      });
      sel.onFinal((v) => {
        statuses.set(path, { path, value: v, isFinal: true, finalizedAt: performance.now() - t0 });
        setPathStatuses([...statuses.values()]);
      });
    }

    const chunks = splitByTokens(json);
    let idx = 0;
    let cancelled = false;
    cancelRef.current = () => {
      cancelled = true;
      stream.destroy();
    };
    const tick = (): void => {
      if (cancelled) return;
      if (idx >= chunks.length) {
        stream.close();
        setState('done');
        return;
      }
      stream.write(chunks[idx] ?? '');
      idx += 1;
      setTimeout(tick, 12);
    };
    tick();
  };

  const stop = (): void => {
    cancelRef.current?.();
    setState('done');
  };

  const pathMap = new Map(pathStatuses.map((s) => [s.path, s]));
  return (
    <DemoShell>
      <StartStop state={state} onStart={start} onStop={stop} />
      <PathBadges statuses={pathStatuses} />
      <SearchResultsView value={value} pathStatuses={pathMap} />
    </DemoShell>
  );
};

export const Demo = () => (
  <>
    <Pitch
      headline="Show the first result before the last one exists."
      body={'Each search result is an array element. select("results.0").onFinal() fires the moment the parser moves to the second result. The user sees and can interact with result #1 while results #2 and #3 are still streaming in.'}
    />
    <InnerDemo />
  </>
);
