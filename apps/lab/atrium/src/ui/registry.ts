import { createComponentRegistry } from '@niscorp/nova';
import { CanvasSlot, ActionSlot } from '@niscorp/nova/adapters/react/components';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { Box, Stack, Row, Grid, Region, Landed } from './components/layout';
import { Text, Badge, Stat, Rule, Avatar, Icon } from './components/display';
import { Button, Tabs, NavItem, MenuItem } from './components/controls';
import { Input, Textarea, Select, Switch } from './components/forms';
import { Card, Section, Hero, Tile, Bubble, Sheet, Notice } from './components/surface';
import { Rows } from './components/rows';
import { Skeleton, Empty, Spinner } from './components/feedback';
import { Accent } from './components/accent';
import { AssistState } from './components/assist';
import { Code } from './components/code';
import { Dock } from './components/dock';
import { Aside, Rail } from './components/aside';

// Atrium's primitive vocabulary — every component a layout may name. Twenty-two
// names, none of which contains a domain noun: there is no StayCard, no
// IssueRow, no CapabilityToggle. Repeated structure is a spec prop on a generic
// primitive (`Rows.columns`, `Tile`), which is what keeps a guest surface, a
// desk board and a deployment console renderable by one kit.
const ATRIUM_PRIMITIVES = {
  Box,
  Stack,
  Row,
  Grid,
  Region,
  Landed,
  Text,
  Badge,
  Stat,
  Rule,
  Avatar,
  Icon,
  Button,
  Tabs,
  NavItem,
  MenuItem,
  Input,
  Textarea,
  Select,
  Switch,
  Card,
  Section,
  Hero,
  Tile,
  Bubble,
  Sheet,
  Notice,
  Rows,
  Skeleton,
  Empty,
  Spinner,
  Accent,
  AssistState,
  Code,
  Dock,
  Aside,
  Rail,
} as unknown as Record<string, NovaComponent>;

export const buildRegistry = () => {
  const reg = createComponentRegistry<NovaComponent>();
  // Registering nova's slots first stops the shell's builtin auto-registration
  // from overwriting the styled kit.
  reg.registerAll({ CanvasSlot, ActionSlot });
  reg.registerAll(ATRIUM_PRIMITIVES);
  return reg;
};
