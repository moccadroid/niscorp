#!/usr/bin/env node
// A committed file, not one in dist/: a package manager links a bin when it
// installs, which in this workspace is before anything is built.
import '../dist/cli.js';
