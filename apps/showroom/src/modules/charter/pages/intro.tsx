import type { FC, ReactNode } from 'react';
import { PhoneStyles } from '@showroom/chrome/stage/phone';
import { Chip, Grid, INK, Lead, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { StudioPhone } from '../world/screens';
import { CHARTER, PEOPLE } from '../world/studio';

// ═══════════════════════════════════════════════════════════
// What charter is for — the landing page.
// ═══════════════════════════════════════════════════════════

const href = (path: string): string => `${import.meta.env.BASE_URL}charter/${path}`;

const Word: FC<{ word: string; children: ReactNode }> = ({ word, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 12, padding: '10px 0', borderTop: `1px solid ${INK.line}`, fontSize: 13.5, lineHeight: 1.55 }}>
    <div style={{ fontWeight: 700 }}>{word}</div>
    <div style={{ color: INK.soft }}>{children}</div>
  </div>
);

const Next: FC<{ to: string; title: string; children: ReactNode; n: number }> = ({ to, title, children, n }) => (
  <a href={href(to)} style={{ textDecoration: 'none', color: 'inherit', border: `1px solid ${INK.line}`, borderRadius: 14, padding: 16, display: 'flex', gap: 14, background: '#fff' }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: INK.accent, lineHeight: 1 }}>{n}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title} →</div>
      <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.5 }}>{children}</div>
    </div>
  </a>
);

const Ring: FC<{ n: string; title: string; children: ReactNode }> = ({ n, title, children }) => (
  <div style={{ borderRadius: 12, padding: 14, background: INK.accentWash, border: '1px solid #c7d2fe', fontSize: 13.5, lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div>
      <Chip tone="accent">{n}</Chip> <b>{title}</b>
    </div>
    <div style={{ color: INK.text }}>{children}</div>
  </div>
);

export const Intro: FC = () => {
  const shown = PEOPLE.filter((p) => p.id !== 'theo');
  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="charter" title="One document decides what each person’s app is — and what the database will tell them.">
        A charter maps roles to what they select: which screens exist, which tables they may read. It is resolved once per person, checked for
        mistakes before the app boots, and handed to the things that enforce it. It never branches a screen on a role — a screen you don’t hold is
        simply not in your app.
      </Lead>

      <Panel title="One app, three people" aside="the same build, resolved per person — tap around">
        <Grid min={240} gap={18}>
          {shown.map((p) => (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 650 }}>
                {p.name} <span style={{ color: INK.faint, fontWeight: 500 }}>· {p.blurb}</span>
              </div>
              <StudioPhone person={p} charter={CHARTER} tone="accent" width={240} />
            </div>
          ))}
        </Grid>
      </Panel>

      <Panel title="Two rings, one document">
        <Grid min={280} gap={12}>
          <Ring n="1" title="What exists">
            The <Mono>actions</Mono> a person resolves to are the only screens their shell can mount. Nothing is hidden or locked — the rest were never
            there. Their first screen is the first of a candidate list they actually hold.
          </Ring>
          <Ring n="2" title="What the database answers">
            The <Mono>data</Mono> grants compile into a vex scope policy. Every read is filtered by it in the SQL, and <Mono>scoping</Mono> says how
            far a role reaches — the whole studio, or only your own rows.
          </Ring>
        </Grid>
        <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.55 }}>
          The charter enforces neither. It resolves and it refuses; the shell and the database enforce. That is why it can govern any list of ids —
          screens, <Mono>table.verb</Mono> grants, layout variants — with one small algebra.
        </div>
      </Panel>

      <Panel title="Five words">
        <div>
          <Word word="Role">A name in the charter — owner, member — and what it selects. A person may wear several; they get everything any of them grants.</Word>
          <Word word="Selection">Globs over a list of ids: <Mono>me.*</Mono>, <Mono>*.read</Mono>. <Mono>extends</Mono> composes whole roles; <Mono>deny</Mono> wins.</Word>
          <Word word="Universe">The ids that exist — the screens the app ships, the tables the database has. The charter selects from them and never invents one.</Word>
          <Word word="Reach">How far a role reads: <Mono>scoping: personal</Mono> means your own rows. It belongs to the role, so it is not inherited.</Word>
          <Word word="Verifier">Runs before boot and refuses an incoherent charter — a dead deny, a cycle — so a mistake is a failed deploy, not a leak.</Word>
        </div>
      </Panel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Walk through it</div>
        <Grid min={320} gap={12}>
          <Next n={1} to="studio/who-sees-what" title="Who sees what">
            Four people, four phones, one charter. Put a role on somebody and watch their app change — and see what a locked button hides.
          </Next>
          <Next n={2} to="studio/same-question" title="Same question, different answers">
            One request, asked as each person. The database answers each as themselves — including the trap an instructor who trains fell into.
          </Next>
          <Next n={3} to="studio/refused" title="Refused before it ships">
            A typo’d deny, two roles extending each other, a typo’d allow: what would ship, and what the verifier says first.
          </Next>
          <Next n={4} to="studio/build" title="Write the charter">
            The policy as a grid of ticks — screens, tables and reach per role. Four phones and the verifier follow every click.
          </Next>
        </Grid>
      </div>
    </Page>
  );
};
