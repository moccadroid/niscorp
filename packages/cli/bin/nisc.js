#!/usr/bin/env node
// The `nisc` command's launcher — a file that exists BEFORE the package is
// built. A package manager links a bin when it installs, and in this workspace
// that happens before anything is compiled: with the bin pointing at dist/
// directly, a fresh checkout installed, found no file to link, and every
// script that says `nisc` then failed with "command not found". This file is
// in the repository, so the link is always made; the command itself is what it
// imports.
import '../dist/cli.js';
