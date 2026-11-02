import type { KitOf } from '../kit.props';
import type { SvelteKitComponent } from './context';
import Action from './kit/Action.svelte';
import Bar from './kit/Bar.svelte';
import Cell from './kit/Cell.svelte';
import Check from './kit/Check.svelte';
import Code from './kit/Code.svelte';
import Columns from './kit/Columns.svelte';
import Countdown from './kit/Countdown.svelte';
import Exhibit from './kit/Exhibit.svelte';
import Field from './kit/Field.svelte';
import Figure from './kit/Figure.svelte';
import Flow from './kit/Flow.svelte';
import Headline from './kit/Headline.svelte';
import Label from './kit/Label.svelte';
import Look from './kit/Look.svelte';
import Menu from './kit/Menu.svelte';
import Fold from './kit/Fold.svelte';
import Page from './kit/Page.svelte';
import Pair from './kit/Pair.svelte';
import Pipeline from './kit/Pipeline.svelte';
import Qr from './kit/Qr.svelte';
import Rows from './kit/Rows.svelte';
import Sheet from './kit/Sheet.svelte';
import Sigil from './kit/Sigil.svelte';
import Stack from './kit/Stack.svelte';
import Stats from './kit/Stats.svelte';
import Text from './kit/Text.svelte';

export const SVELTE_KIT: KitOf<SvelteKitComponent> = {
  Page,
  Sheet,
  Cell,
  Label,
  Headline,
  Text,
  Figure,
  Countdown,
  Code,
  Sigil,
  Qr,
  Rows,
  Bar,
  Flow,
  Columns,
  Action,
  Field,
  Check,
  Look,
  Xray: Look,
  Menu,
  Fold,
  Exhibit,
  Pair,
  Stack,
  Stats,
  Pipeline,
};
