import { createComponentRegistry } from '@niscorp/nova';
import { CanvasSlot, ActionSlot } from '@niscorp/nova/components/react';
import type { NovaComponent } from '@niscorp/nova/react';
import { Box, Stack, Row, Grid, Popover } from './components/layout';
import { Text, Badge, Avatar, Icon } from './components/display';
import { Button, NavItem, LinkRow, Tabs, MenuItem, SortHeader } from './components/controls';
import { Spinner, Skeleton } from './components/feedback';
import { Input, Select, Textarea, Checkbox, Switch } from './components/forms';
import { Overlay } from './components/overlay';
import { Table } from './components/table';
import { Draggable, DropZone } from './components/dnd';

// The Relay primitive vocabulary — every component a Nova layout can name.
const RELAY_PRIMITIVES = {
  Box,
  Stack,
  Row,
  Grid,
  Popover,
  Text,
  Badge,
  Avatar,
  Icon,
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
  Draggable,
  DropZone,
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
