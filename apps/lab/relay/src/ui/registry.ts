import { createComponentRegistry } from '@niscorp/nova';
import { CanvasSlot, ActionSlot } from '@niscorp/nova/adapters/react/components';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { Panel, JsonTree } from './components/introspect';
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
import { DevtoolsAnchor } from './components/devtools-anchor';

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
  DevtoolsAnchor,
  Panel,
  JsonTree,
} as unknown as Record<string, NovaComponent>;

// Registering CanvasSlot here stops <NovaShell>'s builtin auto-registration,
// which would overwrite the styled Box, Stack, Text and Button.
export const buildRegistry = () => {
  const reg = createComponentRegistry<NovaComponent>();
  reg.registerAll({ CanvasSlot, ActionSlot });
  reg.registerAll(RELAY_PRIMITIVES);
  return reg;
};
