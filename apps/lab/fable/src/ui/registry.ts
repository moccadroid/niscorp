import { createComponentRegistry } from '@niscorp/nova';
import { CanvasSlot, ActionSlot } from '@niscorp/nova/adapters/react/components';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { Box, Stack, Row, Popover } from './components/layout';
import { Text, Badge, Icon } from './components/display';
import { Button, Tabs, MenuItem } from './components/controls';
import { Input, Select, Textarea } from './components/forms';
import { Skeleton } from './components/feedback';
import { Overlay } from './components/overlay';
import { Table } from './components/table';

// The Fable primitive vocabulary — every component a Nova layout can name.
// Domain-blind on purpose: no component knows what a todo is.
const FABLE_PRIMITIVES = {
  Box,
  Stack,
  Row,
  Popover,
  Text,
  Badge,
  Icon,
  Button,
  Tabs,
  MenuItem,
  Input,
  Select,
  Textarea,
  Skeleton,
  Overlay,
  Table,
} as unknown as Record<string, NovaComponent>;

// The component registry the shell renders against. CanvasSlot / ActionSlot
// are Nova's shell-aware slots (we reuse them); everything else is a Fable
// primitive. Registering CanvasSlot up front also stops <NovaShell>'s builtin
// auto-registration from overwriting our styled Box/Stack/Text/Button.
export const buildRegistry = () => {
  const reg = createComponentRegistry<NovaComponent>();
  reg.registerAll({ CanvasSlot, ActionSlot });
  reg.registerAll(FABLE_PRIMITIVES);
  return reg;
};
