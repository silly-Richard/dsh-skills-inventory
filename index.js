/**
 * Skills inventory — Host half.
 *
 *   GET  /api/skills-inventory          read-only snapshot (+ which skills are switched off)
 *   POST /api/skills-inventory/toggle   switch one skill off or on for the model
 *   POST /api/skills-inventory/open     reveal one skill file in the OS file manager
 *
 * "Switched off" is a runtime decision owned by this plugin: the catalog line is
 * removed from the messages sent to the model, and the `skill` tool refuses the
 * name. No skill file is renamed, edited, or removed; the only file written is
 * this plugin's own state file.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

/** Electron's shell in the Desktop host; absent in a plain Node host. */
function electronShell() {
  try {
    const electron = nodeRequire('electron');
    return electron?.shell ?? null;
  } catch {
    return null;
  }
}

export const name = 'skills-inventory';
export const inject = ['webServer'];

const ROUTE = '/api/skills-inventory';
const TOGGLE_ROUTE = '/api/skills-inventory/toggle';
const DELETE_PREVIEW_ROUTE = '/api/skills-inventory/delete-preview';
const DELETE_ROUTE = '/api/skills-inventory/delete';
const OPEN_ROUTE = '/api/skills-inventory/open';
const LOOKUP_TIMEOUT_MS = 15000;
const MAX_FRONTMATTER_BYTES = 64 * 1024;
const MAX_BODY_BYTES = 8 * 1024;
const SKILL_TOOL = 'skill';

function dshHome() {
  return process.env.DSH_HOME || path.join(homedir(), '.dsh');
}

function agentsHome() {
  return process.env.DSH_AGENTS_HOME || path.join(homedir(), '.agents');
}

function stateFile() {
  return path.join(dshHome(), 'skills-inventory', 'state.json');
}

function normalizePath(value) {
  return String(value).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function buildRoots(cwd) {
  const roots = [
    { id: 'user-dsh', scope: 'global', path: path.join(dshHome(), 'skills') },
    { id: 'user-agents', scope: 'global', path: path.join(agentsHome(), 'skills') },
  ];
  if (cwd) {
    roots.push({ id: 'project-dsh', scope: 'project', path: path.join(cwd, '.dsh', 'skills') });
    roots.push({ id: 'project-agents', scope: 'project', path: path.join(cwd, '.agents', 'skills') });
  }
  const candidates = [];
  if (process.env.DSH_BUNDLED_SKILL_DIR) candidates.push(process.env.DSH_BUNDLED_SKILL_DIR);
  if (typeof process.resourcesPath === 'string') {
    candidates.push(path.join(process.resourcesPath, 'runtime', 'office-skills'));
    candidates.push(path.join(process.resourcesPath, 'skills'));
    // Skills shipped with the agent-preset package live inside the archive; the
    // Electron filesystem patch makes them readable, a plain Node host skips them.
    candidates.push(path.join(process.resourcesPath, 'app.asar', 'dsh', 'node_modules',
      '@deepseek-ai', 'dsh-agent-preset', 'skills'));
  }
  let bundledIndex = 0;
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    if (roots.some((root) => normalizePath(root.path) === normalizePath(candidate))) continue;
    roots.push({ id: 'bundled-' + (++bundledIndex), scope: 'bundled', path: candidate });
  }
  return roots;
}

/** Resolve the workspace the page speaks for: an explicit session, else the newest one. */
async function resolveWorkspace(sessionId) {
  const file = path.join(dshHome(), 'storages', 'workspace.json');
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    const table = parsed?.tables?.workspaces ?? {};
    const rows = Object.entries(table).map(([id, row]) => ({ id, ...row }));
    if (sessionId) {
      const hit = rows.find((row) => Array.isArray(row.sessionIds) && row.sessionIds.includes(sessionId));
      if (hit?.path) return { path: hit.path, title: hit.title ?? null, source: 'session' };
    }
    rows.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
    const newest = rows.find((row) => typeof row.path === 'string' && row.path.length > 0);
    if (newest) return { path: newest.path, title: newest.title ?? null, source: 'recent' };
  } catch {
    // A missing or unreadable registry is not fatal: fall through to the process directory.
  }
  return { path: process.cwd(), title: null, source: 'process' };
}

/** Roots of the running installation: a skill file there ships with DSH. */
function installationRoots() {
  const roots = [];
  if (typeof process.resourcesPath === 'string') roots.push(process.resourcesPath);
  if (typeof process.env.DSH_INSTALL_DIR === 'string') roots.push(process.env.DSH_INSTALL_DIR);
  return roots.map(normalizePath);
}

function scopeOf(skillPath, roots) {
  if (typeof skillPath !== 'string' || skillPath.length === 0) return 'embedded';
  const target = normalizePath(skillPath);
  for (const root of roots) {
    const base = normalizePath(root.path);
    if (target === base || target.startsWith(base + '/')) return root.scope;
  }
  if (target.includes('app.asar') || installationRoots().some((root) => target.startsWith(root + '/'))) {
    return 'bundled';
  }
  return 'other';
}

function readPolicy(source) {
  const model = typeof source?.modelInvocable === 'boolean'
    ? source.modelInvocable
    : typeof source?.invocation?.modelInvocable === 'boolean' ? source.invocation.modelInvocable : null;
  const user = typeof source?.userInvocable === 'boolean'
    ? source.userInvocable
    : typeof source?.invocation?.userInvocable === 'boolean' ? source.invocation.userInvocable : null;
  return { modelInvocable: model, userInvocable: user };
}

function parseFrontmatter(text) {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const fields = {};
  if (!match) return fields;
  for (const raw of match[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const pair = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    fields[pair[1]] = pair[2].replace(/^["']|["']$/g, '').trim();
  }
  return fields;
}

async function statSafe(file) {
  try {
    return await stat(file);
  } catch {
    return null;
  }
}

async function readSkillMeta(skillPath) {
  if (typeof skillPath !== 'string' || skillPath.length === 0) return null;
  const info = await statSafe(skillPath);
  if (!info || !info.isFile() || info.size > MAX_FRONTMATTER_BYTES) return null;
  try {
    const text = await readFile(skillPath, 'utf8');
    return { fields: parseFrontmatter(text), modifiedAt: info.mtime.toISOString() };
  } catch {
    return null;
  }
}

/** Ask the merged registry; returns null when it is absent or fails. */
async function collectFromRegistry(ctx, cwd) {
  const skills = ctx.get('skills');
  if (!skills || typeof skills.list !== 'function') return null;
  const signal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  try {
    const rows = await skills.list({ cwd, signal });
    if (!Array.isArray(rows)) return null;
    return rows.map((row) => ({
      name: String(row?.name ?? ''),
      description: typeof row?.description === 'string' ? row.description : '',
      path: typeof row?.path === 'string' ? row.path : null,
      provider: typeof row?.provider === 'string' ? row.provider : null,
      ...readPolicy(row),
      source: 'registry',
    }));
  } catch {
    return null;
  }
}

function isSkillDirEntry(entryName) {
  return !entryName.startsWith('.') && entryName !== 'node_modules';
}

/** Directory scan: `<root>/<name>/SKILL.md` or `<root>/<name>.md`. */
async function collectFromDisk(roots) {
  const found = [];
  for (const root of roots) {
    let entries;
    try {
      entries = await readdir(root.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!isSkillDirEntry(entry.name)) continue;
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        found.push({
          name: entry.name.replace(/\.md$/i, ''),
          file: path.join(root.path, entry.name),
          source: 'scan',
        });
      } else if (entry.isDirectory()) {
        const candidate = path.join(root.path, entry.name, 'SKILL.md');
        if (existsSync(candidate)) {
          found.push({ name: entry.name, file: candidate, source: 'scan' });
        }
      }
    }
  }
  return found;
}

async function describeScanned(entry) {
  const meta = await readSkillMeta(entry.file);
  const fields = meta?.fields ?? {};
  const disabledModel = String(fields['disable-model-invocation'] ?? '').toLowerCase();
  const userFlag = String(fields['user-invocable'] ?? '').toLowerCase();
  return {
    name: entry.name,
    description: fields.description ?? '',
    path: entry.file,
    provider: 'filesystem',
    modelInvocable: disabledModel === 'true' ? false : true,
    userInvocable: userFlag === 'false' ? false : true,
    source: 'scan',
    modifiedAt: meta?.modifiedAt ?? null,
  };
}

async function buildSnapshot(ctx, request) {
  const url = new URL(request.url ?? ROUTE, 'http://localhost');
  const sessionId = url.searchParams.get('sessionId') || undefined;
  const requestedCwd = url.searchParams.get('cwd');
  const workspace = requestedCwd && path.isAbsolute(requestedCwd)
    ? { path: requestedCwd, title: null, source: 'query' }
    : await resolveWorkspace(sessionId);

  const roots = buildRoots(workspace.path);
  const warnings = [];

  // The disk scan is the primary source: in this build the filesystem skill
  // provider is mounted per agent preset, so the host-wide registry read only
  // returns plugin-registered (pathless) skills. Registry rows are merged on top.
  const scanned = await collectFromDisk(roots);
  const diskSkills = await Promise.all(scanned.map((entry) => describeScanned(entry)));
  const registrySkills = await collectFromRegistry(ctx, workspace.path);
  if (registrySkills === null) warnings.push('registry-unavailable');

  const enriched = await Promise.all([...diskSkills, ...(registrySkills ?? [])].map(async (skill) => {
    if (!skill.path) {
      // Registered in memory by a plugin: no file, so it cannot belong to a root.
      return { ...skill, scope: 'embedded', modifiedAt: null };
    }
    const meta = await readSkillMeta(skill.path);
    return {
      ...skill,
      description: skill.description || meta?.fields?.description || '',
      scope: scopeOf(skill.path, roots),
      modifiedAt: meta?.modifiedAt ?? null,
    };
  }));

  const priority = { project: 0, custom: 1, global: 2, bundled: 3, embedded: 4, other: 5 };
  const seen = new Map();
  for (const skill of enriched) {
    if (!skill.name) continue;
    const previous = seen.get(skill.name);
    if (!previous || (priority[skill.scope] ?? 9) < (priority[previous.scope] ?? 9)) seen.set(skill.name, skill);
  }
  const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));

  const rootInfo = [];
  for (const root of roots) {
    const info = await statSafe(root.path);
    rootInfo.push({
      id: root.id,
      scope: root.scope,
      path: root.path,
      exists: Boolean(info?.isDirectory()),
      count: list.filter((skill) => skill.scope === root.scope
        && typeof skill.path === 'string'
        && normalizePath(skill.path).startsWith(normalizePath(root.path) + '/')).length,
    });
  }

  const counts = { total: list.length, global: 0, project: 0, custom: 0, bundled: 0, embedded: 0, other: 0 };
  for (const skill of list) counts[skill.scope] = (counts[skill.scope] ?? 0) + 1;

  const disabled = [...disabledNames()].filter((skillName) => list.some((skill) => skill.name === skillName));

  return {
    generatedAt: new Date().toISOString(),
    workspace,
    roots: rootInfo,
    skills: list.map((skill) => ({ ...skill, enabled: !disabledNames().has(skill.name) })),
    counts: { ...counts, disabled: disabled.length },
    disabled,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Switching skills off for the model
// ---------------------------------------------------------------------------

let disabledSync = new Set();
let loadedState = null;

function disabledNames() {
  return disabledSync;
}

async function loadState() {
  if (loadedState !== null) return loadedState;
  try {
    const raw = JSON.parse(await readFile(stateFile(), 'utf8'));
    const names = Array.isArray(raw?.disabled) ? raw.disabled.filter((n) => typeof n === 'string') : [];
    loadedState = new Set(names);
  } catch {
    loadedState = new Set();
  }
  disabledSync = loadedState;
  return loadedState;
}

async function saveState(names) {
  const next = new Set([...names].filter((n) => typeof n === 'string' && n.length > 0));
  await mkdir(path.dirname(stateFile()), { recursive: true });
  await writeFile(stateFile(), JSON.stringify({ disabled: [...next].sort() }, null, 2), 'utf8');
  loadedState = next;
  disabledSync = next;
  return next;
}

/** Remove catalog lines for switched-off skills from the messages sent to a model. */
function stripDisabledSkillLines(text, disabled) {
  if (typeof text !== 'string' || !text.includes('<available_skills>')) return text;
  const lines = text.split('\n');
  let changed = false;
  const kept = lines.filter((line) => {
    const entry = /^\s*-\s+`([^`]+)`\s*:/.exec(line);
    if (entry && disabled.has(entry[1])) {
      changed = true;
      return false;
    }
    return true;
  });
  return changed ? kept.join('\n') : text;
}

function filterMessage(message, disabled) {
  if (!message || typeof message !== 'object') return message;
  if (typeof message.content === 'string') {
    const next = stripDisabledSkillLines(message.content, disabled);
    return next === message.content ? message : { ...message, content: next };
  }
  if (Array.isArray(message.content)) {
    let changed = false;
    const content = message.content.map((part) => {
      if (part && part.type === 'text' && typeof part.text === 'string') {
        const next = stripDisabledSkillLines(part.text, disabled);
        if (next !== part.text) {
          changed = true;
          return { ...part, text: next };
        }
      }
      return part;
    });
    return changed ? { ...message, content } : message;
  }
  return message;
}

function filterMessages(messages, disabled) {
  if (disabled.size === 0 || !Array.isArray(messages)) return messages;
  let changed = false;
  const next = messages.map((message) => {
    const filtered = filterMessage(message, disabled);
    if (filtered !== message) changed = true;
    return filtered;
  });
  return changed ? next : messages;
}

// ---------------------------------------------------------------------------
// Deleting a skill (whole directory, moved into the plugin's trash)
// ---------------------------------------------------------------------------

const MAX_SCAN_FILES = 5000;

function trashRoot() {
  return path.join(dshHome(), 'skills-inventory', 'trash');
}

async function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  const walk = async (current) => {
    if (files >= MAX_SCAN_FILES) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files >= MAX_SCAN_FILES) return;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        files += 1;
        bytes += (await statSafe(full))?.size ?? 0;
      }
    }
  };
  await walk(dir);
  return { files, bytes };
}

/** Resolve a name to a removable target, re-deriving every path on the host. */
async function resolveDeletable(ctx, skillName) {
  const snapshot = await buildSnapshot(ctx, { url: ROUTE });
  const skill = snapshot.skills.find((row) => row.name === skillName);
  if (!skill) return { error: 'not-found' };
  if (!skill.path) return { error: 'not-deletable' };
  if (skill.scope !== 'global' && skill.scope !== 'project') return { error: 'not-deletable' };
  const isBundle = path.basename(skill.path).toLowerCase() === 'skill.md';
  const target = isBundle ? path.dirname(skill.path) : skill.path;
  const parent = path.dirname(target);
  const roots = buildRoots(snapshot.workspace.path);
  if (!roots.some((root) => normalizePath(root.path) === normalizePath(parent))) {
    return { error: 'outside-roots' };
  }
  if (isBundle && !existsSync(path.join(target, 'SKILL.md'))) return { error: 'missing-skill-file' };
  const info = await statSafe(target);
  if (!info) return { error: 'not-found' };
  return { skill, target, isBundle, roots, info };
}

function trashStamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function runCommand(command, args, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ ok: false, message: String(error) });
      return;
    }
    let output = '';
    child.stdout?.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { output += chunk.toString(); });
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      resolve({ ok: false, message: 'timeout' });
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, message: String(error) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, message: output.trim() });
    });
  });
}

const RECYCLE_DIR_SCRIPT = (target) => [
  'Add-Type -AssemblyName Microsoft.VisualBasic;',
  `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${target.replace(/'/g, "''")}',`,
  "'OnlyErrorDialogs', 'SendToRecycleBin')",
].join(' ');

const RECYCLE_FILE_SCRIPT = (target) => [
  'Add-Type -AssemblyName Microsoft.VisualBasic;',
  `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${target.replace(/'/g, "''")}',`,
  "'OnlyErrorDialogs', 'SendToRecycleBin')",
].join(' ');

/**
 * Move a path to the operating system's recycle bin so the user restores it
 * from there. Returns `{ method }`: 'recycle-bin' when the system trash took it,
 * 'plugin-trash' when only the local fallback worked.
 */
async function moveToRecycleBin(target, isDirectory) {
  const shell = electronShell();
  if (shell && typeof shell.trashItem === 'function') {
    await shell.trashItem(target);
    if (!existsSync(target)) return { method: 'recycle-bin' };
  }

  if (process.platform === 'win32') {
    const script = isDirectory ? RECYCLE_DIR_SCRIPT(target) : RECYCLE_FILE_SCRIPT(target);
    const result = await runCommand('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
    ]);
    if (result.ok && !existsSync(target)) return { method: 'recycle-bin' };
    throw new Error('recycle-bin-failed: ' + (result.message || 'unknown'));
  }

  if (process.platform === 'linux') {
    const result = await runCommand('gio', ['trash', target]);
    if (result.ok && !existsSync(target)) return { method: 'recycle-bin' };
    throw new Error('recycle-bin-failed: ' + (result.message || 'unknown'));
  }

  // No system trash available (for example macOS without Electron): keep a copy
  // in the plugin's own trash so nothing is lost.
  const stamp = trashStamp();
  const base = path.basename(target);
  const primary = path.join(trashRoot(), stamp + '-' + base);
  await mkdir(trashRoot(), { recursive: true });
  try {
    await rename(target, primary);
    return { method: 'plugin-trash', trashPath: primary };
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    const sibling = path.join(path.dirname(target), '.trash');
    await mkdir(sibling, { recursive: true });
    const fallback = path.join(sibling, stamp + '-' + base);
    await rename(target, fallback);
    return { method: 'plugin-trash', trashPath: fallback };
  }
}

async function previewDelete(ctx, skillName) {
  const resolved = await resolveDeletable(ctx, skillName);
  if (resolved.error) return { error: resolved.error };
  const stats = resolved.isBundle
    ? await dirStats(resolved.target)
    : { files: 1, bytes: resolved.info.size ?? 0 };
  const copies = [];
  for (const root of resolved.roots) {
    const candidateDir = path.join(root.path, skillName);
    const candidateFlat = path.join(root.path, skillName + '.md');
    for (const candidate of [candidateDir, candidateFlat]) {
      if (normalizePath(candidate) === normalizePath(resolved.target)) continue;
      if (!existsSync(candidate)) continue;
      copies.push(candidate);
    }
  }
  return {
    name: skillName,
    path: resolved.skill.path,
    target: resolved.target,
    scope: resolved.skill.scope,
    files: stats.files,
    bytes: stats.bytes,
    recycleBin: true,
    sameNameCopies: copies,
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

export function apply(ctx) {
  void loadState();

  ctx.on('agent/pre-step', async (_props, next) => {
    const decision = await next();
    if (!decision || decision.kind === 'reject') return decision;
    if (disabledSync.size === 0) return decision;
    // `decision.messages` carries only this step's extra injections, not the
    // assembled request, so this is a best-effort pass for hosts that place the
    // catalog there. Enforcement that always holds is the `skill` tool guard below.
    const messages = filterMessages(decision.messages, disabledSync);
    return messages === decision.messages ? decision : { ...decision, messages };
  });

  ctx.inject(['tools'], (toolsCtx) => {
    const off = toolsCtx.tools.guard((exec) => {
      if (exec?.name !== SKILL_TOOL) return undefined;
      const requested = exec?.arguments?.name;
      if (typeof requested === 'string' && disabledSync.has(requested)) {
        return `Skill "${requested}" is switched off on this host's Skills page; enable it there before loading.`;
      }
      return undefined;
    });
    if (typeof off === 'function') {
      toolsCtx.effect(() => off, 'skills-inventory: disabled skill guard');
    }
  });

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      try {
        await loadState();
        sendJson(res, 200, await buildSnapshot(ctx, req));
      } catch (error) {
        ctx.logger?.warn?.('skills-inventory: snapshot failed: %s', String(error));
        sendJson(res, 500, { error: 'snapshot-failed', message: String(error) });
      }
    },
  }), 'skills-inventory: snapshot route');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TOGGLE_ROUTE,
    handler: async (req, res) => {
      const body = await readBody(req);
      if (body === null) {
        sendJson(res, 413, { error: 'body-too-large' });
        return;
      }
      let request;
      try {
        request = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: 'invalid-json' });
        return;
      }
      const skillName = request?.name;
      if (typeof skillName !== 'string' || skillName.length === 0 || skillName.length > 128) {
        sendJson(res, 400, { error: 'invalid-name' });
        return;
      }
      const disabledNow = await loadState();
      const next = new Set(disabledNow);
      if (request?.enabled === false) next.add(skillName);
      else if (request?.enabled === true) next.delete(skillName);
      else {
        sendJson(res, 400, { error: 'invalid-enabled' });
        return;
      }
      try {
        await saveState(next);
        sendJson(res, 200, { ok: true, disabled: [...next].sort() });
      } catch (error) {
        sendJson(res, 500, { error: 'state-write-failed', message: String(error) });
      }
    },
  }), 'skills-inventory: toggle route');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: DELETE_PREVIEW_ROUTE,
    handler: async (req, res) => {
      const body = await readBody(req);
      if (body === null) {
        sendJson(res, 413, { error: 'body-too-large' });
        return;
      }
      let skillName;
      try {
        skillName = JSON.parse(body)?.name;
      } catch {
        sendJson(res, 400, { error: 'invalid-json' });
        return;
      }
      if (typeof skillName !== 'string' || skillName.length === 0) {
        sendJson(res, 400, { error: 'invalid-name' });
        return;
      }
      const preview = await previewDelete(ctx, skillName);
      if (preview.error) {
        const status = preview.error === 'not-found' ? 404
          : preview.error === 'missing-skill-file' ? 409 : 403;
        sendJson(res, status, { error: preview.error });
        return;
      }
      sendJson(res, 200, preview);
    },
  }), 'skills-inventory: delete preview route');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: DELETE_ROUTE,
    handler: async (req, res) => {
      const body = await readBody(req);
      if (body === null) {
        sendJson(res, 413, { error: 'body-too-large' });
        return;
      }
      let skillName;
      try {
        skillName = JSON.parse(body)?.name;
      } catch {
        sendJson(res, 400, { error: 'invalid-json' });
        return;
      }
      if (typeof skillName !== 'string' || skillName.length === 0) {
        sendJson(res, 400, { error: 'invalid-name' });
        return;
      }
      const resolved = await resolveDeletable(ctx, skillName);
      if (resolved.error) {
        const status = resolved.error === 'not-found' ? 404
          : resolved.error === 'missing-skill-file' ? 409 : 403;
        sendJson(res, status, { error: resolved.error });
        return;
      }
      const stats = resolved.isBundle
        ? await dirStats(resolved.target)
        : { files: 1, bytes: resolved.info.size ?? 0 };
      let move;
      try {
        move = await moveToRecycleBin(resolved.target, resolved.isBundle);
      } catch (error) {
        sendJson(res, 500, { error: 'move-failed', code: error?.code ?? null, message: String(error) });
        return;
      }
      // A deleted skill must not stay in the switch-off list.
      if (disabledSync.has(skillName)) {
        const next = new Set(disabledSync);
        next.delete(skillName);
        try {
          await saveState(next);
        } catch {
          // The move already happened; a stale name in the list is harmless.
        }
      }
      sendJson(res, 200, {
        ok: true,
        name: skillName,
        method: move.method,
        trashPath: move.trashPath ?? null,
        files: stats.files,
        bytes: stats.bytes,
      });
    },
  }), 'skills-inventory: delete route');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: OPEN_ROUTE,
    handler: async (req, res) => {
      const body = await readBody(req);
      if (body === null) {
        sendJson(res, 413, { error: 'body-too-large' });
        return;
      }
      let target;
      try {
        target = JSON.parse(body)?.path;
      } catch {
        sendJson(res, 400, { error: 'invalid-json' });
        return;
      }
      if (typeof target !== 'string' || !path.isAbsolute(target)) {
        sendJson(res, 400, { error: 'invalid-path' });
        return;
      }
      // Only paths inside the scanned skill roots may be revealed.
      const roots = buildRoots((await resolveWorkspace()).path);
      const normalized = normalizePath(target);
      const allowed = roots.some((root) => normalized === normalizePath(root.path)
        || normalized.startsWith(normalizePath(root.path) + '/'));
      if (!allowed) {
        sendJson(res, 403, { error: 'path-outside-roots' });
        return;
      }
      const isFile = (await statSafe(target))?.isFile() ?? false;
      const args = process.platform === 'win32'
        ? (isFile ? ['/select,', target] : [target])
        : process.platform === 'darwin'
          ? (isFile ? ['-R', target] : [target])
          : [isFile ? path.dirname(target) : target];
      const command = process.platform === 'win32' ? 'explorer.exe'
        : process.platform === 'darwin' ? 'open' : 'xdg-open';
      try {
        const child = spawn(command, args, { detached: true, stdio: 'ignore' });
        child.unref();
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 500, { error: 'spawn-failed', message: String(error) });
      }
    },
  }), 'skills-inventory: open route');
}
