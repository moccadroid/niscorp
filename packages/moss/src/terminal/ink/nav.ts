import { useRef, type FC } from 'react';
import { useFocusManager, useInput } from 'ink';
import { markerFocusId } from '@niscorp/nova/adapters/ink';
import type { TerminalApi } from '../index';
import { sendFrom, tapEventOf } from '../numbered';
import type { Marks } from './marks';

// How long a typed digit waits for another before acting — only when a
// longer number is still possible ('1' with 14 interactives on screen).
const DIGIT_COMMIT_MS = 600;

// Number navigation, as a component that draws nothing: ↑/↓ walk the focus
// ring; typed digits address `[n]` directly — click a button or row, flip a
// toggle, focus an input. Multi-digit numbers accumulate; an unambiguous one
// acts immediately.
export const navOf = (deps: {
  api: TerminalApi;
  marks: Marks;
  // whether a focused input is claiming typed digits as text
  typing: () => boolean;
}): FC => {
  const { api, marks, typing } = deps;
  return () => {
    const { focus, focusNext, focusPrevious } = useFocusManager();
    const buffer = useRef('');
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const clearBuffer = (): void => {
      buffer.current = '';
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
        timer.current = undefined;
      }
    };
    const commit = (): void => {
      const index = Number(buffer.current);
      clearBuffer();
      const item = marks.at(index);
      if (item === undefined || item.canvas === '') return;
      // focus follows the number for every kind — visible feedback, and for
      // an input the focus IS the action (typing types from here on)
      focus(markerFocusId(index));
      const event = tapEventOf(item);
      if (event !== undefined) sendFrom(api, item, event);
    };
    useInput((input, key) => {
      // While an input is focused, vertical arrows belong to it (it forwards
      // them to the server as ui:key — a palette moves its highlight).
      if (key.downArrow) {
        if (!typing()) focusNext();
        return;
      }
      if (key.upArrow) {
        if (!typing()) focusPrevious();
        return;
      }
      if (typing()) return;
      // One digit, or several: keys pressed in turn can arrive as one read
      // (a slow link, a paste), and ink hands them over together.
      if (/^[0-9]+$/.test(input) && !key.ctrl && !key.meta) {
        buffer.current += input;
        if (timer.current !== undefined) clearTimeout(timer.current);
        // no longer number is possible → act now; otherwise wait a beat
        if (Number(buffer.current) * 10 > marks.count()) commit();
        else timer.current = setTimeout(commit, DIGIT_COMMIT_MS);
        return;
      }
      if (buffer.current !== '') clearBuffer();
    });
    return null;
  };
};
