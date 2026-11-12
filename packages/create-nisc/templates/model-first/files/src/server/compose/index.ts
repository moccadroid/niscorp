import { z } from 'zod';
import type { SignalClient } from '@niscorp/cortex';
import type { FunctionDefinition, FunctionSession, ShellManifest } from '@niscorp/moss';
import { SCREENS } from '../../app/screens';
import type { Card } from '../../app/screens';
import { recordModelRun } from '../runs';
import { CATALOG } from './catalog';
import type { Catalog } from './catalog';
import { composerAgent } from './composer.agent';
import { messageInput } from './knowledge';
import type { Said } from './knowledge';
import { cardsOf, turnRefusals } from './turn.schema';

export type Chat = { provider: string; model: string; llm: SignalClient; timeoutMs: number };

export type Models = { chat?: Chat; missing: readonly string[] };

const AskSchema = z.looseObject({ asked: z.string() });
const OpenSchema = z.looseObject({ opening: z.string() });

// How many turns the model is told of: enough to follow on from, short enough to stay fast.
const SAID = 4;

// A shell is built on the first screen: its cards on the screen canvas, one under another.
export const firstScreen: NonNullable<ShellManifest['seeds']> = () => ({ screen: SCREENS[0].cards.map(({ action, input }) => ({ action, input })) });

export const composer =
  (models: Models): ((session: FunctionSession) => FunctionDefinition[]) =>
  (session) => {
    const held = new Set(session.actions);
    const catalog: Catalog = { actions: CATALOG.actions.filter((action) => held.has(action.id)) };
    // The conversation lives as long as this shell: the turns on its `talk` canvas, and what they said, here.
    const said: Said[] = [];

    // The question goes into the conversation at once, still being answered; nothing on `talk` is a step Back takes.
    const begin = (question: string): ((reply: string, cards?: readonly Card[]) => void) => {
      const turn = session.shell.push('talk', 'answer.turn', { question, reply: '', thinking: true }, undefined, { history: false });
      return (reply, cards = []) => {
        session.shell.getRuntime(turn)?.setData({ question, reply, thinking: false });
        said.push({ question, reply, shown: cards.map((card) => (card.action === 'answer.text' ? 'words' : card.action)) });
        for (const card of cards) session.shell.push('talk', card.action, card.input, undefined, { history: false });
      };
    };

    const answer = async (message: string): Promise<void> => {
      const finish = begin(message);
      const chat = models.chat;
      if (chat === undefined) {
        finish(`Set ${models.missing.join(' and ')} in .env, and start the app again.`);
        return;
      }
      const agent = composerAgent((envelope) => {
        const refused = turnRefusals(envelope.data, catalog);
        return refused.length === 0 ? { ok: true } : { retry: refused.map((reason) => `- ${reason}`).join('\n') };
      });
      const result = await agent.run(messageInput(message, said.slice(-SAID)), { llm: chat.llm, deps: { catalog }, signal: AbortSignal.timeout(chat.timeoutMs) }).result;
      const { usage, steps, elapsedMs } = result.meta;
      recordModelRun(session, { agentId: agent.agentId, label: message, provider: chat.provider, model: chat.model, usage, steps, elapsedMs, outcome: result.ok ? 'ok' : 'failed' });
      if (!result.ok) {
        const { code, stop, message: reason } = result.error;
        console.error(`[ask] "${message}" got no answer: ${code}${stop === undefined ? '' : ` (${stop})`}: ${reason}`);
        finish(code === 'aborted' || code === 'model_call_failed' ? 'I could not be reached just now. Ask again in a moment.' : 'I could not answer that one. Ask again, or put it differently.');
        return;
      }
      finish(result.output.response?.trim() ?? '', cardsOf(result.output.data, catalog));
    };

    // One message at a time, in the order they were sent: one asked while another is answered waits for it.
    let answering: Promise<void> = Promise.resolve();
    const ask = async (data: unknown): Promise<{ asked: boolean }> => {
      const message = AskSchema.parse(data).asked.trim();
      if (message === '') return { asked: false };
      const answered = answering.then(() => answer(message));
      answering = answered.catch(() => undefined);
      await answered;
      return { asked: true };
    };

    // A screen is the cards of it the person's roles reach, one under another: what was on the screen canvas goes, and they are
    // put there in order.
    const open = async (data: unknown): Promise<{ screen: string }> => {
      const screen = SCREENS.find((candidate) => candidate.id === OpenSchema.parse(data).opening);
      if (screen === undefined) throw new Error('There is no such screen.');
      for (const shown of session.shell.getState().canvases['screen']?.stack ?? []) session.shell.removeInstance('screen', shown.id);
      for (const card of screen.cards) if (held.has(card.action)) session.shell.push('screen', card.action, card.input, undefined, { history: false });
      return { screen: screen.id };
    };

    return [
      { id: 'ask', description: 'Answers a message with a turn of the conversation: a sentence, and the cards under it. Send { text }.', execute: ask },
      { id: 'screens.open', description: 'Shows one of the screens in the dock: its cards, one under another. Send { opening: <screen id> }; answers { screen }.', execute: open },
    ];
  };
