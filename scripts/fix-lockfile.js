#!/usr/bin/env node
// Patch package-lock.json so `npm ci` works on platforms other than the one
// that generated the lockfile.
//
// Why this exists
// ---------------
// npm 10.x has a bug (npm/cli#4828 and friends) where platform-specific
// optional dependencies — most notably the per-OS @esbuild/* binaries that
// vite/vitest depend on — get written into package-lock.json without the
// `optional: true` flag. When `npm ci` then runs on a different OS than the
// one that generated the lockfile, it sees these as required dependencies
// for the wrong platform and refuses with EBADPLATFORM.
//
// Cloudflare Pages runs `npm ci` on Linux. The lockfile is typically
// generated on the developer's machine (Windows / macOS). The mismatch is
// what produced the deploy failure that motivated this script.
//
// The fix
// -------
// For every package in the lockfile that has an `os` or `cpu` constraint
// that doesn't match the host where npm ci is running, ensure
// `optional: true` is set. With the flag, npm correctly skips the package
// instead of failing.
//
// When to run it
// --------------
// Any time you regenerate package-lock.json. The `postinstall` hook in
// package.json runs this automatically after `npm install`, so the manual
// case is mostly when something goes weird and you re-run by hand.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lockfilePath = path.join(__dirname, "..", "package-lock.json");

if (!fs.existsSync(lockfilePath)) {
  console.error("fix-lockfile: no package-lock.json found, nothing to do");
  process.exit(0);
}

const lock = JSON.parse(fs.readFileSync(lockfilePath, "utf8"));
const pkgs = lock.packages || {};

let patched = 0;
for (const [, p] of Object.entries(pkgs)) {
  // A package is platform-constrained if it declares `os` or `cpu`.
  // We mark every such package as optional regardless of host — npm will
  // skip the wrong-platform ones and install the right one. The "wrong"
  // ones being marked optional is what makes `npm ci` portable.
  if ((p.os || p.cpu) && !p.optional) {
    p.optional = true;
    patched++;
  }
}

if (patched > 0) {
  fs.writeFileSync(lockfilePath, JSON.stringify(lock, null, 2) + "\n");
  console.log(`fix-lockfile: marked ${patched} platform-specific package(s) as optional`);
} else {
  console.log("fix-lockfile: lockfile already clean, no patches needed");
}
