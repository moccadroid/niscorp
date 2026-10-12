import { useRef, type FC } from 'react';
import { useFocusManager, useInput } from 'ink';
import { markerFocusId } from '@niscorp/nova/adapters/ink';
import type { TerminalApi } from '../index';
import { sendFrom, tapEventOf } from '../numbered';
import type { Marks } from './marks';

const DIGIT_COMMIT_MS = 600;

export const navOf = (deps: {
  api: TerminalApi;
  marks: Marks;
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
      focus(markerFocusId(index));
      const event = tapEventOf(item);
      if (event !== undefined) sendFrom(api, item, event);
    };
    useInput((input, key) => {
      if (key.downArrow) {
        if (!typing()) focusNext();
        return;
      }
      if (key.upArrow) {
        if (!typing()) focusPrevious();
        return;
      }
      if (typing()) return;
      // Several digits can arrive as one read (a slow link, a paste).
      if (/^[0-9]+$/.test(input) && !key.ctrl && !key.meta) {
        buffer.current += input;
        if (timer.current !== undefined) clearTimeout(timer.current);
        // At once when no longer number could name anything on screen.
        if (Number(buffer.current) * 10 > marks.count()) commit();
        else timer.current = setTimeout(commit, DIGIT_COMMIT_MS);
        return;
      }
      if (buffer.current !== '') clearBuffer();
    });
    return null;
  };
};
