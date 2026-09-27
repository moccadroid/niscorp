import { useEffect, useState, type FC } from 'react';
import { StrataError, type UpgradeResult } from '@niscorp/strata';
import { classesAt, KIND, LATEST, RELEASES, stampAt, upgraderAt, type Doc } from '../world/acme';
import { Phone, PhoneStyles } from '../world/kit';
import { Btn, Callout, Chip, Code, INK, JsonDiff, Lead, MONO, Page, Panel, Grid, Mono, stampText } from '@showroom/chrome/stage/ui';

// ═══════════════════════════════════════════════════════════
// The time machine — one screen, saved by one release, opened by another.
//
// Two pins on one timeline are the whole of strata's document story: the stamp
// is where the document was written, the reader is where the code is. Reader
// ahead → the migrations between the pins run. Reader behind → refused. The
// right-hand phone is the same document drawn raw by the same kit: what an app
// without strata shows its users.
// ═══════════════════════════════════════════════════════════

type Outcome = { ok: true; result: UpgradeResult } | { ok: false; code: string; message: string; details: readonly string[] };

const PRESETS: readonly { label: string; saved: number; opened: number }[] = [
  { label: 'Saved in March, opened in October', saved: 0, opened: 3 },
  { label: 'Saved in July, opened in October', saved: 2, opened: 3 },
  { label: 'Same release', saved: 3, opened: 3 },
  { label: 'Saved in October, opened by May’s code', saved: 3, opened: 1 },
];

const Timeline: FC<{ saved: number; opened: number; onSaved: (n: number) => void; onOpened: (n: number) => void }> = ({ saved, opened, onSaved, onOpened }) => {
  const forward = saved <= opened;
  const lo = Math.min(saved, opened);
  const hi = Math.max(saved, opened);
  const cols = `repeat(${RELEASES.length}, minmax(0, 1fr))`;
  const pin = (active: boolean, color: string) => ({
    width: 22,
    height: 22,
    borderRadius: 999,
    border: `2px solid ${active ? color : INK.line}`,
    background: active ? color : '#ffffff',
    cursor: 'pointer',
    boxShadow: active ? `0 0 0 4px ${color}22` : 'none',
    transition: 'all 150ms',
  });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `68px minmax(0, 1fr)`, rowGap: 10, alignItems: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 650, color: INK.soft }}>Saved by</div>
      <div style={{ display: 'grid', gridTemplateColumns: cols }}>
        {RELEASES.map((r) => (
          <div key={r.n} style={{ display: 'flex', justifyContent: 'center' }}>
            <button type="button" aria-label={`Saved by ${r.name}`} onClick={() => onSaved(r.n)} style={pin(saved === r.n, '#0ea5e9')} />
          </div>
        ))}
      </div>

      <div />
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: cols }}>
        <div style={{ position: 'absolute', left: `${100 / RELEASES.length / 2}%`, right: `${100 / RELEASES.length / 2}%`, top: 11, height: 2, background: INK.line }} />
        {lo !== hi && (
          <div
            style={{
              position: 'absolute',
              left: `${((lo + 0.5) * 100) / RELEASES.length}%`,
              width: `${((hi - lo) * 100) / RELEASES.length}%`,
              top: 10,
              height: 4,
              borderRadius: 4,
              background: forward ? INK.ok : INK.bad,
              transition: 'all 200ms',
            }}
          />
        )}
        {RELEASES.map((r) => {
          const runs = r.n > saved && r.n <= opened;
          const unknown = r.n > opened && r.n <= saved;
          return (
            <div key={r.n} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', padding: '0 4px' }}>
              <div style={{ width: 12, height: 12, marginTop: 6, borderRadius: 999, background: runs ? INK.ok : unknown ? INK.bad : '#ffffff', border: `2px solid ${runs ? INK.ok : unknown ? INK.bad : '#cbd5e1'}` }} />
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {r.name} <span style={{ fontWeight: 500, color: INK.faint }}>· {r.when}</span>
              </div>
              <div style={{ fontSize: 12, color: INK.soft, minHeight: 32 }}>{r.change}</div>
              {r.n > 0 && (
                <span title={runs ? 'runs on read' : unknown ? 'unknown to the reader' : undefined}>
                  <Chip tone={runs ? 'ok' : unknown ? 'bad' : 'idle'} mono>
                    {runs ? '✓ ' : unknown ? '? ' : ''}kit/{r.n}
                  </Chip>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, fontWeight: 650, color: INK.soft }}>Opened by</div>
      <div style={{ display: 'grid', gridTemplateColumns: cols }}>
        {RELEASES.map((r) => (
          <div key={r.n} style={{ display: 'flex', justifyContent: 'center' }}>
            <button type="button" aria-label={`Opened by ${r.name}`} onClick={() => onOpened(r.n)} style={pin(opened === r.n, INK.accent)} />
          </div>
        ))}
      </div>
    </div>
  );
};

export const TimeMachine: FC = () => {
  const [saved, setSaved] = useState(0);
  const [opened, setOpened] = useState(LATEST);
  const [stored, setStored] = useState<Doc>();
  const [outcome, setOutcome] = useState<Outcome>();

  useEffect(() => {
    let live = true;
    void (async () => {
      const doc = await classesAt(saved);
      const reader = await upgraderAt(opened);
      let next: Outcome;
      try {
        next = { ok: true, result: reader.upgrade(doc, { kind: KIND, stamp: stampAt(saved) }) };
      } catch (error) {
        next =
          error instanceof StrataError
            ? { ok: false, code: error.code, message: error.message.split('\n')[0] ?? '', details: error.details }
            : { ok: false, code: 'ERROR', message: String(error), details: [] };
      }
      if (!live) return;
      setStored(doc);
      setOutcome(next);
    })();
    return () => {
      live = false;
    };
  }, [saved, opened]);

  const between = RELEASES.filter((r) => (saved <= opened ? r.n > saved && r.n <= opened : r.n > opened && r.n <= saved));
  const symptoms = between.map((r) => (saved <= opened ? r.breaksOlder : r.breaksNewer)).filter((s): s is string => s !== undefined);
  const savedName = RELEASES[saved]?.name ?? '';
  const openedName = RELEASES[opened]?.name ?? '';

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="The time machine" title="A screen saved months ago still opens — and one from the future is never misread.">
        Acme Studio’s <b>Classes</b> screen is a JSON document. It was saved by one release of the app and is opened by another, and between the two the
        app’s component kit changed three times. Move the pins. The left phone is what strata does; the right is the same document drawn by the same
        kit, raw.
      </Lead>

      <Panel>
        <Timeline saved={saved} opened={opened} onSaved={setSaved} onOpened={setOpened} />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: INK.soft }}>
          <span>
            <Chip tone="ok" mono>
              ✓ kit/n
            </Chip>{' '}
            a migration that runs as the screen is read
          </span>
          <span>
            <Chip tone="bad" mono>
              ? kit/n
            </Chip>{' '}
            one the reader has never seen
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', borderTop: `1px solid ${INK.line}`, paddingTop: 12 }}>
          <span style={{ fontSize: 12, color: INK.faint }}>Try</span>
          {PRESETS.map((p) => (
            <Btn
              key={p.label}
              kind={p.saved === saved && p.opened === opened ? 'primary' : 'plain'}
              onClick={() => {
                setSaved(p.saved);
                setOpened(p.opened);
              }}
            >
              {p.label}
            </Btn>
          ))}
        </div>
      </Panel>

      <Grid min={340}>
        <Panel
          tone={outcome?.ok === false ? 'bad' : 'ok'}
          title={<>With strata <span style={{ color: INK.faint, fontWeight: 500 }}>· opened by {openedName}</span></>}
          aside={outcome?.ok === true ? `stamp → ${stampText(outcome.result.stamp)}` : undefined}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 24 }}>
            {outcome === undefined ? null : outcome.ok ? (
              outcome.result.applied.length === 0 ? (
                <Chip tone="idle">Already current — nothing ran</Chip>
              ) : (
                outcome.result.applied.map((ref) => (
                  <Chip key={ref} tone="ok" mono>
                    ✓ ran {ref}
                  </Chip>
                ))
              )
            ) : (
              <Chip tone="bad" mono>
                ✕ refused · {outcome.code}
              </Chip>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            {outcome === undefined ? null : outcome.ok ? (
              <Phone document={outcome.result.document} release={opened} tone="ok" />
            ) : (
              <div style={{ width: 300, maxWidth: '100%', minHeight: 380, borderRadius: 28, background: '#111827', padding: 8 }}>
                <div style={{ borderRadius: 21, background: '#fff', minHeight: 364, padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
                  <div style={{ fontSize: 34 }}>⏸</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Not opened.</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: INK.soft }}>
                    This screen was saved by <b>{savedName}</b>; this is <b>{openedName}</b>. It cannot know what the newer kit meant, so it refuses by name
                    instead of guessing.
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: INK.bad, lineHeight: 1.5 }}>
                    {outcome.code}: {outcome.details.join('; ')}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.55 }}>
            {outcome === undefined
              ? ''
              : outcome.ok
                ? outcome.result.applied.length === 0
                  ? 'Written by this release — nothing to catch up on.'
                  : `The document was upgraded on read, in memory, through ${outcome.result.applied.length} migration${outcome.result.applied.length === 1 ? '' : 's'}. What was stored is untouched.`
                : 'The fix is the order of deploys: the reader upgrades first — host before add-on, server before terminal.'}
          </div>
        </Panel>

        <Panel
          tone={symptoms.length > 0 ? 'bad' : 'plain'}
          title={<>Without strata <span style={{ color: INK.faint, fontWeight: 500 }}>· the same document, drawn raw</span></>}
          aside={`stamp ignored`}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 24 }}>
            {symptoms.length === 0 ? <Chip tone="idle">Looks right — this time</Chip> : <Chip tone="bad">Drawn wrong</Chip>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            {stored !== undefined && <Phone document={stored} release={opened} tone={symptoms.length > 0 ? 'bad' : 'plain'} />}
          </div>
          {symptoms.length === 0 ? (
            <div style={{ fontSize: 13, color: INK.soft }}>Saved and opened by the same release: there is nothing to translate.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: INK.text }}>
              {symptoms.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </Panel>
      </Grid>

      {outcome?.ok === true && outcome.result.applied.length > 0 && stored !== undefined && (
        <Panel title="What changed inside the document" aside="the layout — where every change landed">
          <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.6 }}>
            Every Button — at the top level, inside the loop’s cards and inside the <Mono>if</Mono> branch — was rewritten, and nobody wrote code to find
            them. nova’s grammar declares where layouts nest; strata walks there and hands each node to the migration.
          </div>
          <JsonDiff
            before={stored['layout']}
            after={outcome.result.document['layout']}
            beforeTitle={`As stored · ${stampText(stampAt(saved))}`}
            afterTitle={`As ${openedName} reads it · ${stampText(outcome.result.stamp)}`}
          />
        </Panel>
      )}

      {between.length > 0 && (
        <Panel title="The migrations" aside="each one a Prism config over one node — no loops, no knowledge of where Buttons sit">
          <Grid min={320} gap={12}>
            {between.map((r) => (
              <div key={r.n} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Chip tone={saved <= opened ? 'ok' : 'bad'} mono>
                    acme.kit/{r.n}
                  </Chip>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.change}</span>
                  <span style={{ fontSize: 12, color: INK.faint }}>shipped in {r.name}</span>
                </div>
                <Code maxHeight={220}>{JSON.stringify(r.migration?.transform, null, 2)}</Code>
              </div>
            ))}
          </Grid>
          {saved > opened && (
            <Callout tone="warn">
              These exist only in the newer code. {openedName} has never seen them — which is exactly why it cannot read a document that has.
            </Callout>
          )}
        </Panel>
      )}
    </Page>
  );
};
