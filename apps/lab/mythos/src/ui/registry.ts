import { createComponentRegistry } from '@niscorp/nova';
import type { ComponentRegistry } from '@niscorp/nova';
import { Button, Card, Checkbox, Chip, Input, Meter, Stack, Surface, Text, TextArea } from './kit';
import { Doodle } from './doodle';
import { Confetti } from './confetti';

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
