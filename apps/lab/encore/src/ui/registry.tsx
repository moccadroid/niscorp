import { createComponentRegistry } from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { CanvasSlot, ActionSlot } from '@niscorp/nova/adapters/react/components';
import { Box, Stack, Row, Grid, Pack, Tile } from './components/layout';
import { Text, Badge, Card, KeyValue, List, Meter, Chip, Tags } from './components/content';
import { Input, Button, Field, Select, Hotkey, OnLoad } from './components/controls';
import { Timeline, ZoneMap, BarChart, Gauge } from './components/viz';
import { Rail, Spans, Spotlight } from './components/linked';

// THE KIT — the only renderer code in the app, assembled once.
//
// Two dozen primitives and not one of them is named after anything at a
// festival. That is the rule that keeps the room honest: everything the
// operator sees was composed out of these by JSON the server sent, so a card
// the model opens is made of the same parts as a card a person authored, and
// there is no component that could quietly contain app logic.
//
// The two slot markers are nova's; the terminal re-registers wire-backed
// versions over them (a terminal holds no shell).
const PRIMITIVES = {
  Box,
  Stack,
  Row,
  Grid,
  Pack,
  Tile,
  Text,
  Badge,
  Card,
  KeyValue,
  List,
  Meter,
  Chip,
  Tags,
  Input,
  Button,
  Field,
  Select,
  Hotkey,
  OnLoad,
  Timeline,
  ZoneMap,
  BarChart,
  Gauge,
  Spans,
  Spotlight,
  Rail,
};

export const buildRegistry = (): ReturnType<typeof createComponentRegistry<NovaComponent>> => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll({ CanvasSlot, ActionSlot });
  registry.registerAll(PRIMITIVES);
  return registry;
};
