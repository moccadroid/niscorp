import type { FC } from 'react';
import type { DocPage } from '@showroom/modules/types';
import { MarkdownPane } from './markdown-pane';

// ═══════════════════════════════════════════════════════════
// DocPane — dispatcher for the doc area of the canvas. A
// DocPage either ships markdown content (rendered via the
// MarkdownPane) or a render function for an interactive page
// like the signal Playground or Settings.
// ═══════════════════════════════════════════════════════════

type Props = { page: DocPage };

export const DocPane: FC<Props> = ({ page }) => {
  if (page.render !== undefined) {
    return (
      <div style={{ flex: 1, overflow: 'auto', background: '#ffffff' }}>
        {page.render()}
      </div>
    );
  }
  if (page.content !== undefined) {
    return (
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: '#ffffff' }}>
        <MarkdownPane title={page.title} content={page.content} />
      </div>
    );
  }
  return (
    <div style={{ padding: 24, color: '#9ca3af', fontSize: 12 }}>
      (empty doc page — DocPage has neither `content` nor `render`)
    </div>
  );
};
