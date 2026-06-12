import { Children, type ReactNode } from 'react';

// Two-pane demo layout — each child becomes a pane. Demos compose it directly
// with a <LoomEditor> and a <JsonViewer> so the wiring stays visible in the
// source.
const pane = { flex: '1 1 320px', minWidth: 280 } as const;

export const DemoPanel = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', gap: 24, padding: 24, flexWrap: 'wrap' }}>
    {Children.map(children, (child) => (
      <div style={pane}>{child}</div>
    ))}
  </div>
);
