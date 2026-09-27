import { useEffect, useState, type FC, type ReactNode } from 'react';
import { classesAt, KIND, stampAt, upgraderAt, type Doc } from '../world/acme';
import { Phone, PhoneStyles } from '../world/kit';
import { Chip, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';

// ═══════════════════════════════════════════════════════════
// What strata is for — the landing page. One problem, shown; one idea; where
// that idea lives; five words; then the walk-through.
// ═══════════════════════════════════════════════════════════

// July's kit: two changes since March, both of the quiet kind — nothing errors.
const JULY = 2;

const href = (path: string): string => `${import.meta.env.BASE_URL}strata/${path}`;

const Where: FC<{ place: string; stamp: string; children: ReactNode }> = ({ place, stamp, children }) => (
  <div style={{ border: `1px solid ${INK.line}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, background: '#fff' }}>
    <div style={{ fontSize: 14, fontWeight: 700 }}>{place}</div>
    <div>
      <Chip tone="accent" mono>
        {stamp}
      </Chip>
    </div>
    <div style={{ fontSize: 13, lineHeight: 1.55, color: INK.soft }}>{children}</div>
  </div>
);

const Word: FC<{ word: string; children: ReactNode }> = ({ word, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 12, padding: '10px 0', borderTop: `1px solid ${INK.line}`, fontSize: 13.5, lineHeight: 1.55 }}>
    <div style={{ fontWeight: 700 }}>{word}</div>
    <div style={{ color: INK.soft }}>{children}</div>
  </div>
);

const Next: FC<{ to: string; title: string; children: ReactNode; n: number }> = ({ to, title, children, n }) => (
  <a
    href={href(to)}
    style={{ textDecoration: 'none', color: 'inherit', border: `1px solid ${INK.line}`, borderRadius: 14, padding: 16, display: 'flex', gap: 14, background: '#fff' }}
  >
    <div style={{ fontSize: 22, fontWeight: 800, color: INK.accent, lineHeight: 1 }}>{n}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title} →</div>
      <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.5 }}>{children}</div>
    </div>
  </a>
);

export const Intro: FC = () => {
  const [raw, setRaw] = useState<Doc>();
  const [read, setRead] = useState<Doc>();

  useEffect(() => {
    void (async () => {
      const march = await classesAt(0);
      const july = await upgraderAt(JULY);
      setRaw(march);
      setRead(july.upgrade(march, { kind: KIND, stamp: stampAt(0) }).document);
    })();
  }, []);

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="strata" title="Every document ever written still opens — and one written by newer code is never misread.">
        A nisc app is made of JSON documents: screens, queries, transforms. They get saved in databases, sent by add-ons and committed to repos, and they
        outlive the code that wrote them. When that code changes the shape of its documents, strata catches the old ones up — or refuses, by name, the
        ones it cannot understand.
      </Lead>

      <Panel title="The problem, in one picture" aside="a screen saved in March, opened by July’s release">
        <Grid min={300}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {raw !== undefined && <Phone document={raw} release={JULY} tone="bad" width={280} />}
            <div style={{ fontSize: 13, color: INK.soft, textAlign: 'center', maxWidth: 300 }}>
              <b style={{ color: INK.bad }}>Drawn raw.</b> Since March the kit renamed Button’s <code>label</code> to <code>text</code> and its <code>tone</code> to <code>variant</code>. Nothing
              errors — the buttons are just blank, and nobody is told.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {read !== undefined && <Phone document={read} release={JULY} tone="ok" width={280} />}
            <div style={{ fontSize: 13, color: INK.soft, textAlign: 'center', maxWidth: 300 }}>
              <b style={{ color: INK.ok }}>Read through strata.</b> The two migrations shipped since March ran on read, on every Button, wherever it sits.
              What was stored is untouched.
            </div>
          </div>
        </Grid>
      </Panel>

      <Panel title="The one idea: a stamp">
        <div style={{ fontSize: 14.5, lineHeight: 1.65 }}>
          Every document carries a <b>stamp</b> — how far along each grammar its writer was:{' '}
          <span style={{ fontFamily: MONO, fontSize: 13, background: INK.accentWash, color: INK.accent, padding: '2px 8px', borderRadius: 6 }}>
            {'{ "nisc.nova": 1, "nisc.prism": 1, "acme.kit": 0 }'}
          </span>
          . Grammars change only by <b>appending a migration</b>, so a stamp is a position in a history. The reader compares it with its own:
        </div>
        <Grid min={280} gap={12}>
          <div style={{ borderRadius: 12, padding: 14, background: INK.okWash, border: '1px solid #a7f3d0', fontSize: 13.5, lineHeight: 1.55 }}>
            <b style={{ color: INK.ok }}>Reader is newer →</b> run the migrations in between, and read it as if it had just been written.
          </div>
          <div style={{ borderRadius: 12, padding: 14, background: INK.wash, border: `1px solid ${INK.line}`, fontSize: 13.5, lineHeight: 1.55 }}>
            <b>Same place →</b> nothing to do.
          </div>
          <div style={{ borderRadius: 12, padding: 14, background: INK.badWash, border: '1px solid #fecaca', fontSize: 13.5, lineHeight: 1.55 }}>
            <b style={{ color: INK.bad }}>Reader is older →</b> refuse, <Mono>TOO_NEW</Mono>. It cannot know what the newer code meant, so it does not guess.
          </div>
        </Grid>
      </Panel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Wherever a document lives, its stamp lives with it</div>
        <Grid min={220} gap={12}>
          <Where place="A database row" stamp="a column beside it">
            Saved by an add-on last year; upgraded every time it is read. Writing it back is optional.
          </Where>
          <Where place="A submission" stamp="in the envelope">
            From an add-on built on newer code: refused at intake until the host catches up — the reader upgrades first.
          </Where>
          <Where place="Your repo" stamp="strata.lock.json">
            strata will not rewrite your TypeScript. It says exactly what each file must become, and moves the lock only when the edit is exact.
          </Where>
          <Where place="The tables themselves" stamp="the ledger">
            A table cannot carry a stamp, so its database remembers: one ledger row per migration it ran. Same rules — append, never edit, refuse newer.
          </Where>
        </Grid>
      </div>

      <Panel title="Five words">
        <div>
          <Word word="Grammar">The rules for one kind of document — nova’s layouts, Prism’s configs, your app’s kit props. Each has a history of migrations.</Word>
          <Word word="Migration">One change to a grammar, appended, never edited. For documents, a Prism config that rewrites one node; for tables, SQL.</Word>
          <Word word="Stamp">A document’s position in every grammar’s history: which migrations its writer had already seen.</Word>
          <Word word="Lock">Your repo’s stamp — the grammar versions its source is written in.</Word>
          <Word word="Ledger">A database’s stamp — which table migrations it has run, with a checksum of each.</Word>
        </div>
      </Panel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Walk through it</div>
        <Grid min={320} gap={12}>
          <Next n={1} to="documents/time-machine" title="The time machine">
            One screen, saved by one release and opened by another. Move two pins; watch it upgrade, or be refused — and what it looks like without strata.
          </Next>
          <Next n={2} to="documents/everywhere" title="One change, everywhere it lives">
            Deploy a release and watch the same document catch up in a database row, in your repo and over the wire.
          </Next>
          <Next n={3} to="documents/gate" title="The gate">
            Every real screen the lab apps captured, re-checked in your browser. Propose a grammar change and see which of them it would break.
          </Next>
          <Next n={4} to="tables/tables" title="The tables they live in">
            The same rules for the database: side by side with the migration counter most apps use, on real Postgres.
          </Next>
        </Grid>
      </div>
    </Page>
  );
};
