import { SECTION_QUESTION } from './prompts.js';
import type { Calls } from './calls.js';
import { renderLines, type Line } from './view.js';

type Section = { heading: string; lines: Line[] };

// The page's lines split at its heading lines (h1–h6); a part before the first heading is its own section.
export const splitSections = (lines: Line[]): Section[] => {
  const sections: Section[] = [];
  for (const line of lines) {
    if (/^h[1-6]$/.test(line.element.name) || !sections.length)
      sections.push({ heading: line.text, lines: [] });
    sections.at(-1)?.lines.push(line);
  }
  return sections;
};

// The text Read sees: the whole page when it fits the budget; otherwise the section Jev picks, numbered as on the
// whole page and cut at the budget. Without an answer from Jev, the whole page cut at the budget.
export const textForRead = async ({
  lines,
  base,
  instruction,
  calls,
  budget,
}: {
  lines: Line[];
  base: string;
  instruction: string;
  calls: Calls;
  budget: number;
}): Promise<string> => {
  const cut = (text: string) => {
    if (text.length <= budget) return text;
    const end = text.lastIndexOf('\n', budget);
    return text.slice(0, end > 0 ? end : budget);
  };
  const whole = renderLines(lines, base);
  if (whole.length <= budget) return whole;
  const sections = splitSections(lines);
  const keys = sections.map((_, i) => `s${i + 1}`);
  const criteria = Object.fromEntries(
    sections.map((s, i) => [
      keys[i],
      `${s.heading} (lines ${s.lines[0]?.number}–${s.lines.at(-1)?.number})`,
    ]),
  );
  const state = {
    instruction,
    sections: Object.fromEntries(
      sections.map((s, i) => [
        keys[i],
        [s.heading, ...s.lines.slice(1, 4).map((l) => l.text)].join('\n'),
      ]),
    ),
  };
  const key = await calls.decide('section', state, 'section', SECTION_QUESTION(criteria));
  const chosen = typeof key === 'string' ? sections[keys.indexOf(key)] : undefined;
  calls.event(
    'section',
    chosen
      ? {
          type: 'section',
          key,
          heading: chosen.heading,
          lines: chosen.lines.length,
          of: lines.length,
        }
      : { type: 'section-failed' },
  );
  return cut(chosen ? renderLines(chosen.lines, base) : whole);
};
