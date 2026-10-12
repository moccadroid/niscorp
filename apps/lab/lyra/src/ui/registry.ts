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

const LYRA_PRIMITIVES = {
  Box,
  Stack,
  Row,
  Grid,
  Spacer,
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
  Input,
  Textarea,
  Select,
  Switch,
  Money,
  Checkbox,
  PersonPicker,
  Card,
  Section,
  Hero,
  Notice,
  Rows,
  Links,
  Cards,
  Skeleton,
  Empty,
  Spinner,
  Theme,
};

export const buildRegistry = (): ReturnType<typeof createComponentRegistry<NovaComponent>> => {
  const registry = createComponentRegistry<NovaComponent>();
  // Registering nova's slots up front stops the shell's builtin
  // auto-registration from overwriting the kit.
  registry.registerAll({ CanvasSlot, ActionSlot });
  registry.registerAll(LYRA_PRIMITIVES);
  return registry;
};

export const COMPONENT_NAMES: string[] = [...Object.keys(LYRA_PRIMITIVES), 'CanvasSlot', 'ActionSlot'];
