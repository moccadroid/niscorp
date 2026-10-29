import type { LayoutNode } from '@niscorp/nova';

const sheet = (areas: string[], cols: number[], rows: (number | 'auto')[], children: LayoutNode[]): LayoutNode => ({
  component: 'Sheet',
  props: { size: 'fill', scale: 'page', areas, cols, rows },
  children,
});
const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});
const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const text = (words: string): LayoutNode => ({ component: 'Text', children: words });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });
const exhibit = (caption: unknown, textAt: unknown, props: Record<string, unknown> = {}): LayoutNode => ({ component: 'Exhibit', props: { label: caption, text: textAt, ...props } });
const head = (): LayoutNode => cell('head', [label('{{$.kicker}}'), headline('display', '{{$.title}}')]);

export const readLayout: LayoutNode = sheet(['head head', 'stored read'], [1, 1], ['auto', 1], [
  head(),
  cell('stored', [exhibit('As stored · lyceum.kit {{$.upgrade.storedAt}}', '$.upgrade.stored', { lang: 'json' })], { align: 'middle' }),
  cell('read', [exhibit('As read · lyceum.kit {{$.upgrade.readAt}}', '$.upgrade.read', { lang: 'json', tone: 'ink', marked: '$.upgrade.marked' })], { align: 'middle' }),
]);

export const newerLayout: LayoutNode = sheet(['head head', 'stamp said'], [1, 1.2], ['auto', 1], [
  head(),
  cell('stamp', [exhibit('Stamped', '$.upgrade.newer.stamp', { lang: 'json' })], { align: 'middle' }),
  { if: '$.upgrade.newer.refusal', then: cell('said', [label('Strata'), text('{{$.upgrade.newer.refusal}}')], { ink: 'alert', align: 'middle' }), else: cell('said', [label('Reading…')]) },
]);
