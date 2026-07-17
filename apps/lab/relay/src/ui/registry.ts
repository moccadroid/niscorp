import { createComponentRegistry } from '@niscorp/nova';
import { CanvasSlot, ActionSlot } from '@niscorp/nova/react/components';
import type { NovaComponent } from '@niscorp/nova/react';
import { Box, Stack, Row, Grid, Popover, PopoverPanel } from './components/layout';
import { Text, Badge, Avatar, Icon, Stat } from './components/display';
import { Button, NavItem, LinkRow, Tabs, MenuItem, SortHeader } from './components/controls';
import { Spinner, Skeleton } from './components/feedback';
import { Input, Select, Textarea, Checkbox, Switch } from './components/forms';
import { Overlay } from './components/overlay';
import { Table } from './components/table';
import { KanbanCard, KanbanCards } from './components/dnd';
import {
  ActivityDot,
  Aside,
  AssistantDock,
  Dialog,
  DialogBody,
  DialogFoot,
  DialogHead,
  DialogTitle,
  FormFoot,
  KanbanBoard,
  KanbanColumn,
  KanbanHead,
  PanelClose,
  Progress,
} from './components/chrome';
import { StackChip } from './components/stack-chip';
import { RayTrace } from './components/ray-trace';
import { RayView } from './components/ray-view';

// The Relay primitive vocabulary — every component a Nova layout can name.
// Layouts control components ONLY through semantic props; every kit CSS class
// is applied inside a component that owns it.
const RELAY_PRIMITIVES = {
  Box,
  Stack,
  Row,
  Grid,
  Popover,
  PopoverPanel,
  Text,
  Badge,
  Avatar,
  Icon,
  Stat,
  Button,
  NavItem,
  LinkRow,
  Tabs,
  MenuItem,
  SortHeader,
  Spinner,
  Skeleton,
  Input,
  Select,
  Textarea,
  Checkbox,
  Switch,
  Overlay,
  Table,
  Dialog,
  DialogHead,
  DialogTitle,
  DialogBody,
  DialogFoot,
  PanelClose,
  FormFoot,
  Aside,
  AssistantDock,
  Progress,
  ActivityDot,
  KanbanBoard,
  KanbanColumn,
  KanbanHead,
  KanbanCards,
  KanbanCard,
  StackChip,
  RayTrace,
  RayView,
} as unknown as Record<string, NovaComponent>;

// The component registry the shell renders against. CanvasSlot / ActionSlot are
// Nova's shell-aware slots (we reuse them); everything else is a Relay
// primitive. Registering CanvasSlot up front also stops <NovaShell>'s builtin
// auto-registration from overwriting our styled Box/Stack/Text/Button.
export const buildRegistry = () => {
  const reg = createComponentRegistry<NovaComponent>();
  reg.registerAll({ CanvasSlot, ActionSlot });
  reg.registerAll(RELAY_PRIMITIVES);
  return reg;
};
