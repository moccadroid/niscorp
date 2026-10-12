import { createComponentRegistry } from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { CanvasSlot, ActionSlot } from '@niscorp/nova/adapters/react/components';
import { Box, Stack, Row, Grid, Pack, Tile } from './components/layout';
import { Text, Badge, Card, KeyValue, List, Meter, Chip, Tags } from './components/content';
import { Input, Button, Field, Select, Hotkey, OnLoad } from './components/controls';
import { Timeline, ZoneMap, BarChart, Gauge } from './components/viz';
import { Rail, Spans, Spotlight } from './components/linked';

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
