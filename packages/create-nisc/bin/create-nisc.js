#!/usr/bin/env node
// The launcher — a committed file, so the bin links on a fresh install before
// anything is built (the same reason as @niscorp/cli's). The command itself is
// what it imports.
import '../dist/cli.js';
