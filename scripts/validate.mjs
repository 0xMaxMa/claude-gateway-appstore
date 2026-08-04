#!/usr/bin/env node
// Validate apps.json against the JSON Schema, then run file/image checks that a
// schema cannot express (referenced images exist, are real png/webp, within size
// limits). Exits non-zero on any error so CI blocks a bad PR. Warnings never fail.
//
// Usage: node scripts/validate.mjs
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// Image limits (bytes)
const ICON_MAX = 512 * 1024; // 512 KB
const SHOT_MAX = 1024 * 1024; // 1 MB

function readJson(p) {
  return JSON.parse(readFileSync(join(ROOT, p), 'utf-8'));
}

// ── 1. Schema validation ──────────────────────────────────────────────────────
let data;
try {
  data = readJson('apps.json');
} catch (e) {
  console.error(`apps.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

const schema = readJson('schema/apps.schema.json');
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(data)) {
  for (const e of validate.errors) {
    err(`schema ${e.instancePath || '/'} ${e.message}`);
  }
}

const apps = Array.isArray(data.apps) ? data.apps : [];
const categories = Array.isArray(data.categories) ? data.categories : [];

// ── 2. Cross-field / policy checks ─────────────────────────────────────────────
const seenNames = new Set();
for (const app of apps) {
  const name = app?.name ?? '(unnamed)';

  // name globally unique
  if (seenNames.has(app?.name)) err(`duplicate app name "${name}"`);
  seenNames.add(app?.name);

  // category required (publish gate) + must be in categories[]
  if (!app?.category) {
    err(`"${name}": missing required "category"`);
  } else if (categories.length && !categories.includes(app.category)) {
    err(`"${name}": category "${app.category}" is not in top-level categories[]`);
  }

  // icon required (publish gate)
  if (!app?.icon) err(`"${name}": missing required "icon"`);

  // versions sanity: latest commit must be resolvable (schema checks 40-hex)
  if (Array.isArray(app?.versions)) {
    const vs = new Set();
    for (const v of app.versions) {
      if (vs.has(v?.version)) err(`"${name}": duplicate version "${v?.version}"`);
      vs.add(v?.version);
    }
  }
}

// ── 3. Referenced-file existence + image validation ────────────────────────────
const referenced = new Set();

function checkImage(appName, relPath, maxBytes, kind) {
  referenced.add(relPath);
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) {
    err(`"${appName}": ${kind} file not found: ${relPath}`);
    return;
  }
  const size = statSync(abs).size;
  if (size > maxBytes) {
    err(`"${appName}": ${kind} "${relPath}" is ${(size / 1024).toFixed(0)} KB, exceeds ${(maxBytes / 1024).toFixed(0)} KB`);
  }
  const buf = readFileSync(abs);
  if (!isPng(buf) && !isWebp(buf)) {
    err(`"${appName}": ${kind} "${relPath}" is not a valid PNG or WebP (magic bytes)`);
  }
}

function isPng(b) {
  return b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
}
function isWebp(b) {
  return b.length >= 12 &&
    b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
}

for (const app of apps) {
  const name = app?.name ?? '(unnamed)';
  if (app?.icon) checkImage(name, app.icon, ICON_MAX, 'icon');
  if (Array.isArray(app?.screenshots)) {
    for (const s of app.screenshots) checkImage(name, s, SHOT_MAX, 'screenshot');
  }
}

// ── 4. Orphan image warning ────────────────────────────────────────────────────
const appsDir = join(ROOT, 'apps');
if (existsSync(appsDir)) {
  for (const dir of readdirSync(appsDir)) {
    walkImages(join('apps', dir)).forEach((rel) => {
      if (!referenced.has(rel)) warn(`orphan image not referenced in apps.json: ${rel}`);
    });
  }
}

function walkImages(rel) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const childRel = `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walkImages(childRel));
    else if (/\.(png|webp)$/i.test(entry.name)) out.push(childRel);
  }
  return out;
}

// ── Report ─────────────────────────────────────────────────────────────────────
for (const w of warnings) console.warn(`⚠️  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`❌ ${e}`);
  console.error(`\n${errors.length} error(s) found.`);
  process.exit(1);
}
console.log(`✅ apps.json valid — ${apps.length} app(s), ${warnings.length} warning(s).`);
