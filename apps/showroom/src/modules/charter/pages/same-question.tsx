import { useEffect, useState, type FC } from 'react';
import { Btn, Callout, Chip, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { CHARTER, getStudio, grantedData, PEOPLE, type Answer } from '../world/studio';

// ═══════════════════════════════════════════════════════════
// Same question, different answers.
//
// One read, replayed as each person through vex's real handler — the endpoint
// moss serves. The screen a person sees is one ring; this is the other: the
// database answers from their policy, whatever the button did. The WHERE shown
// under each answer is the one vex added to the SQL it ran.
// ═══════════════════════════════════════════════════════════

type Question = { id: string; ask: string; fingerprint: string; note: string };

const QUESTIONS: readonly Question[] = [
  {
    id: 'timetable',
    ask: 'What’s on this week?',
    fingerprint: 'classes/timetable',
    note: 'The timetable is public: every role holds classes.read, and the table has no row rule. Everyone gets the same five classes — even the visitor.',
  },
  {
    id: 'roster',
    ask: 'Who’s booked into which class?',
    fingerprint: 'bookings/roster',
    note: 'Olivia and Theo read the whole studio. Mia also holds bookings.read — at personal reach — so she gets an answer, not a refusal: her own rows. The same verb at two reaches.',
  },
  {
    id: 'revenue',
    ask: 'What do memberships bring in a month?',
    fingerprint: 'subscriptions/revenue',
    note: 'Olivia sees the studio’s figure. Mia and Theo see their own bill — the same sum, over the only subscription they can reach. The visitor holds no subscriptions grant at all: refused.',
  },
  {
    id: 'mine',
    ask: 'What have I booked?',
    fingerprint: 'bookings/mine',
    note: '',
  },
];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const Result: FC<{ answer: Answer | undefined }> = ({ answer }) => {
  if (answer === undefined) return <div style={{ color: INK.faint, fontSize: 13 }}>…</div>;
  const body = isRecord(answer.body) ? answer.body : {};
  if (answer.status >= 400) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Chip tone="bad">✕ refused · {answer.status}</Chip>
        <div style={{ fontFamily: MONO, fontSize: 11, color: INK.bad, lineHeight: 1.5 }}>{String(body['message'] ?? '')}</div>
      </div>
    );
  }
  const result = body['result'];
  if (Array.isArray(result)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Chip tone="ok">
          {result.length} row{result.length === 1 ? '' : 's'}
        </Chip>
        <div style={{ border: `1px solid ${INK.line}`, borderRadius: 10, overflow: 'auto', maxHeight: 240 }}>
          {result.map((row, i) => (
            <div key={i} style={{ padding: '5px 10px', fontSize: 12, borderTop: i === 0 ? 'none' : `1px solid ${INK.line}` }}>
              {isRecord(row) ? Object.values(row).map(String).join(' · ') : String(row)}
            </div>
          ))}
          {result.length === 0 && <div style={{ padding: '6px 10px', fontSize: 12, color: INK.faint }}>no rows</div>}
        </div>
      </div>
    );
  }
  if (isRecord(result)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8 }}>{String(result['monthly'] ?? '')}</div>
        <div style={{ fontSize: 12, color: INK.soft }}>
          a month, from {String(result['members'] ?? '')} membership{result['members'] === 1 ? '' : 's'}
        </div>
      </div>
    );
  }
  return <div>{JSON.stringify(result)}</div>;
};

export const SameQuestion: FC = () => {
  const [question, setQuestion] = useState<Question>(QUESTIONS[0] ?? { id: '', ask: '', fingerprint: '', note: '' });
  const [pinned, setPinned] = useState(true);
  const [answers, setAnswers] = useState<Readonly<Record<string, Answer>>>({});

  const fingerprint = question.id === 'mine' && !pinned ? 'bookings/mine-unpinned' : question.fingerprint;

  useEffect(() => {
    let live = true;
    setAnswers({});
    void (async () => {
      const studio = await getStudio();
      const next: Record<string, Answer> = {};
      for (const p of PEOPLE) next[p.id] = await studio.ask(CHARTER, p, fingerprint);
      if (live) setAnswers(next);
    })();
    return () => {
      live = false;
    };
  }, [fingerprint]);

  const theo = answers['theo'];
  const theoRows = isRecord(theo?.body) && Array.isArray(theo?.body['result']) ? theo.body['result'].length : undefined;

  return (
    <Page>
      <Lead eyebrow="Same question, different answers" title="Hiding a button is not a policy. The database answers each person as themselves.">
        Pick a question. It is asked four times through the same endpoint — the one moss serves — once as each person. The answers differ because
        each person’s charter compiles to their own policy, and vex writes it into the SQL. Nobody’s screen or request can widen it.
      </Lead>

      <Panel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {QUESTIONS.map((q) => (
            <Btn key={q.id} kind={q.id === question.id ? 'primary' : 'plain'} onClick={() => setQuestion(q)}>
              “{q.ask}”
            </Btn>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: INK.soft }}>
          replayed as <Mono>{`{ fingerprint: "${fingerprint}" }`}</Mono> — the same request body every time; only the signed-in person differs.
        </div>
      </Panel>

      <Grid min={240} gap={14}>
        {PEOPLE.map((p) => {
          const a = answers[p.id];
          const grants = [...grantedData(CHARTER, p.roles)];
          return (
            <Panel key={p.id} title={p.name} aside={p.roles.join(' + ')} tone={a !== undefined && a.status >= 400 ? 'bad' : 'plain'}>
              <Result answer={a} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 650, color: INK.faint, textTransform: 'uppercase', letterSpacing: 0.5 }}>What vex added</div>
                <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.5, color: a?.where.length ? INK.accent : INK.faint }}>
                  {a === undefined ? '…' : a.where.length > 0 ? a.where.join('\n') : a.status >= 400 ? 'nothing ran' : 'no filter — this person reads the whole table'}
                </div>
              </div>
              <div style={{ fontSize: 11, color: INK.faint, lineHeight: 1.5 }}>
                holds {grants.length === 0 ? 'no data grants' : grants.map((g) => g.replace('.read', '')).join(', ')}
                {p.roles.includes('member') ? ' · member rows at personal reach' : ''}
              </div>
            </Panel>
          );
        })}
      </Grid>

      {question.id === 'mine' ? (
        <Panel title="The trap this question hides" tone={pinned ? 'ok' : 'bad'}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Btn kind={pinned ? 'primary' : 'plain'} onClick={() => setPinned(true)}>
              The read declares reach: personal
            </Btn>
            <Btn kind={!pinned ? 'primary' : 'plain'} onClick={() => setPinned(false)}>
              The read as it first shipped
            </Btn>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            Theo is two things: an instructor, who reads every booking, and a member, who reads his own. A person may do anything any of their roles
            permits, so his policies merge to the wider one. That is right for the roster — and wrong for a screen headed <i>“What you’ve booked”</i>.
          </div>
          <Callout tone={pinned ? 'ok' : 'bad'}>
            {pinned ? (
              <>
                The read names its reach — <Mono>reach: 'personal'</Mono> — so it is served at that profile whoever asks: Theo gets his{' '}
                <b>{theoRows ?? '…'}</b> own bookings. It can only narrow; a person without the grant is still refused.
              </>
            ) : (
              <>
                Without it, Theo’s <i>“What you’ve booked”</i> lists <b>{theoRows ?? '…'}</b> bookings — the whole studio’s. Nothing errors and every
                check that asserts the engine is right still passes. This is the bug a nisc lab app actually shipped, and it is why a read that
                means “mine” says so.
              </>
            )}
          </Callout>
        </Panel>
      ) : (
        <Callout tone="accent">{question.note}</Callout>
      )}
    </Page>
  );
};
