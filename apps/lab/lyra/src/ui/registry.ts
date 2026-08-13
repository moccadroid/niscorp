import { createComponentRegistry } from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { CanvasSlot, ActionSlot } from '@niscorp/nova/adapters/react/components';
import { Box, Stack, Row, Grid, Spacer, Bar, Sheet, Drawer, Burger, DrawerGroup, DrawerLink, DrawerHeader, DrawerFooter } from './components/layout';
import { Text, Prose, Badge, Stat, Field, Meter, Rule, Dot, Avatar, Bands, Icon } from './components/display';
import { Calendar } from './components/calendar';
import { Button, Tabs, NavItem, Tab, RolePicker, DayToggle } from './components/controls';
import { Input, Textarea, Select, Switch, Money, Checkbox, PersonPicker } from './components/forms';
import { Card, Section, Hero, Notice } from './components/surface';
import { Rows } from './components/rows';
import { Links, Cards } from './components/lists';
import { Skeleton, Empty, Spinner } from './components/feedback';
import { Theme } from './components/theme';
import { Frame } from './components/frame';

const LYRA_PRIMITIVES = {
  // arrangement
  Box,
  Stack,
  Row,
  Grid,
  Spacer,
  // display
  Text,
  Prose,
  Badge,
  Stat,
  Field,
  Meter,
  Rule,
  Dot,
  Avatar,
  Bands,
  Icon,
  // controls
  Button,
  Tabs,
  NavItem,
  Tab,
  RolePicker,
  DayToggle,
  Calendar,
  Bar,
  Sheet,
  Drawer,
  Burger,
  DrawerGroup,
  DrawerLink,
  DrawerHeader,
  DrawerFooter,
  // fields
  Input,
  Textarea,
  Select,
  Switch,
  Money,
  Checkbox,
  PersonPicker,
  // surfaces
  Card,
  Section,
  Hero,
  Notice,
  // lists and states — THREE SHAPES, because a menu is not a table and an
  // object worth a paragraph is not a row (see components/lists.tsx)
  Rows,
  Links,
  Cards,
  Skeleton,
  Empty,
  Spinner,
  // the surface half of theming: writes a studio's tokens, renders nothing
  Theme,
  // the one component whose contents this app does not validate — see frame.tsx
  Frame,
};

// nova's own slot markers are not ours and are not optional — the frame
// resolves CanvasSlot, a list canvas resolves ActionSlot.
export const buildRegistry = (): ReturnType<typeof createComponentRegistry<NovaComponent>> => {
  const registry = createComponentRegistry<NovaComponent>();
  // nova's slots first: registering them up front stops the shell's builtin
  // auto-registration from overwriting the styled kit.
  registry.registerAll({ CanvasSlot, ActionSlot });
  registry.registerAll(LYRA_PRIMITIVES);
  return registry;
};

export const COMPONENT_NAMES: string[] = [...Object.keys(LYRA_PRIMITIVES), 'CanvasSlot', 'ActionSlot'];
