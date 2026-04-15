import { useState, lazy, Suspense, type FC, type ReactNode } from 'react';

// ═══════════════════════════════════════════════════════════
// Lab — full-stack integration experiences
// ═══════════════════════════════════════════════════════════

type Experience = {
  id: string;
  name: string;
  tagline: string;
  packages: string[];
  component: React.LazyExoticComponent<FC>;
};

const Placeholder: FC<{ name: string }> = ({ name }) => (
  <div style={{ padding: 48, color: '#6b7280', textAlign: 'center' }}>
    <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{name}</div>
    <div style={{ fontSize: 14 }}>Coming soon</div>
  </div>
);

const makePlaceholder = (name: string) =>
  lazy(async () => ({ default: (() => <Placeholder name={name} />) as FC }));

const EXPERIENCES: Experience[] = [
  {
    id: 'pulse',
    name: 'Pulse',
    tagline: 'Streaming intelligence panel',
    packages: ['signal', 'solid', 'prism', 'nova'],
    component: lazy(() => import('./experiences/pulse')),
  },
  {
    id: 'alchemist',
    name: 'Alchemist',
    tagline: 'AI data transformer',
    packages: ['cortex', 'signal', 'solid', 'prism', 'nova'],
    component: makePlaceholder('Alchemist'),
  },
  {
    id: 'nerve-center',
    name: 'Nerve Center',
    tagline: 'Live agent execution visualizer',
    packages: ['cortex', 'signal', 'solid', 'prism', 'nova'],
    component: makePlaceholder('Nerve Center'),
  },
  {
    id: 'forge',
    name: 'Forge',
    tagline: 'Conversational app generator',
    packages: ['cortex', 'signal', 'solid', 'nova'],
    component: makePlaceholder('Forge'),
  },
  {
    id: 'mosaic',
    name: 'Mosaic',
    tagline: 'Adaptive multi-agent research board',
    packages: ['cortex', 'signal', 'solid', 'prism', 'nova'],
    component: makePlaceholder('Mosaic'),
  },
];

const PackageBadge: FC<{ name: string }> = ({ name }) => (
  <span
    style={{
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 6px',
      borderRadius: 4,
      background: '#f3f4f6',
      color: '#6b7280',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    }}
  >
    {name}
  </span>
);

const TabButton: FC<{
  experience: Experience;
  active: boolean;
  onClick: () => void;
}> = ({ experience, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 4,
      padding: '12px 16px',
      border: 'none',
      borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
      background: active ? '#f8fafc' : 'transparent',
      cursor: 'pointer',
      transition: 'all 120ms',
    }}
  >
    <div style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? '#1e293b' : '#64748b' }}>
      {experience.name}
    </div>
    <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{experience.tagline}</div>
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {experience.packages.map((p) => (
        <PackageBadge key={p} name={p} />
      ))}
    </div>
  </button>
);

const Loading: FC = () => (
  <div style={{ padding: 48, color: '#94a3b8', textAlign: 'center', fontSize: 14 }}>Loading...</div>
);

export const App: FC = () => {
  const [activeId, setActiveId] = useState('pulse');
  const active = EXPERIENCES.find((e) => e.id === activeId) ?? EXPERIENCES[0]!;
  const Component = active.component;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '0 20px',
          borderBottom: '1px solid #e2e8f0',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', padding: '14px 0', marginRight: 8 }}>
          Nisc Lab
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {EXPERIENCES.map((exp) => (
            <TabButton
              key={exp.id}
              experience={exp}
              active={exp.id === activeId}
              onClick={() => setActiveId(exp.id)}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fafbfc' }}>
        <Suspense fallback={<Loading />}>
          <Component />
        </Suspense>
      </div>
    </div>
  );
};
