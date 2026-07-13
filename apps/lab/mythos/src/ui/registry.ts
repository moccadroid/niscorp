import { createComponentRegistry } from '@niscorp/nova';
import type { ComponentRegistry } from '@niscorp/nova';
import { Button, Card, Checkbox, Chip, Input, Meter, Stack, Surface, Text, TextArea } from './kit';
import { Doodle } from './doodle';
import { Confetti } from './confetti';

// The one registry, assembled once (AGENTS rule 2). Every component is a
// domain-blind primitive; registerAll picks up each component's static meta.
export const createAppRegistry = (): ComponentRegistry => {
  const registry = createComponentRegistry();
  registry.registerAll({
    Surface,
    Stack,
    Text,
    Card,
    Button,
    Checkbox,
    Chip,
    Meter,
    Input,
    TextArea,
    Doodle,
    Confetti,
  });
  return registry;
};
