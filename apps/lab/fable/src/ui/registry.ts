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

// Registering CanvasSlot here also stops <NovaShell>'s builtin
// auto-registration from overwriting the kit's Box/Stack/Text/Button.
export const buildRegistry = () => {
  const reg = createComponentRegistry<NovaComponent>();
  reg.registerAll({ CanvasSlot, ActionSlot });
  reg.registerAll(FABLE_PRIMITIVES);
  return reg;
};
