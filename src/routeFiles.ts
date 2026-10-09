import fs from "node:fs/promises";
import path from "node:path";

export const VS_CODE_ENV = "claudeCode.environmentVariables";

export function anthropicBaseValues(env: unknown): unknown[] {
  if (Array.isArray(env)) {
    return env
      .filter(isAnthropicBaseEntry)
      .map((entry) => (entry as { value?: unknown }).value);
  }
  if (env && typeof env === "object") {
    return [(env as Record<string, unknown>).ANTHROPIC_BASE_URL];
  }
  return [];
}

export function withVsCodeBaseUrl(
  doc: Record<string, unknown>,
  url: string,
): Record<string, unknown> {
  const env = doc[VS_CODE_ENV];
  if (Array.isArray(env)) {
    return {
      ...doc,
      [VS_CODE_ENV]: [
        ...env.filter((entry) => !isAnthropicBaseEntry(entry)),
        { name: "ANTHROPIC_BASE_URL", value: url },
      ],
    };
  }
  if (env && typeof env === "object") {
    return {
      ...doc,
      [VS_CODE_ENV]: {
        ...(env as Record<string, unknown>),
        ANTHROPIC_BASE_URL: url,
      },
    };
  }
  return {
    ...doc,
    [VS_CODE_ENV]: [{ name: "ANTHROPIC_BASE_URL", value: url }],
  };
}

export function withoutVsCodeBaseUrl(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  const env = doc[VS_CODE_ENV];
  if (Array.isArray(env)) {
    return {
      ...doc,
      [VS_CODE_ENV]: env.filter((entry) => !isAnthropicBaseEntry(entry)),
    };
  }
  if (env && typeof env === "object") {
    return {
      ...doc,
      [VS_CODE_ENV]: withoutEnvKey(
        env as Record<string, unknown>,
        "ANTHROPIC_BASE_URL",
      ),
    };
  }
  return { ...doc };
}

function isAnthropicBaseEntry(entry: unknown): boolean {
  return (
    !!entry &&
    typeof entry === "object" &&
    (entry as { name?: unknown }).name === "ANTHROPIC_BASE_URL"
  );
}

function withoutEnvKey(
  doc: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const next = { ...doc };
  delete next[key];
  return next;
}

export type RouteFilePaths = {
  codex: string;
  claude: string;
  vsCode: string;
};

export type ModelOptions = {
  ids: string[];
  codexModel: string;
  claudeModel: string;
  proxyBaseUrl: string;
};

export function createRouteFiles(paths: RouteFilePaths) {
  let backup: ModelBackup | undefined;
  return {
    async readCodex(): Promise<Record<string, unknown>> {
      const url = readTomlString(await readText(paths.codex), "openai_base_url");
      return url === undefined ? {} : { openai_base_url: url };
    },
    async writeCodex(doc: Record<string, unknown>): Promise<void> {
      const text = await readText(paths.codex);
      const next =
        typeof doc.openai_base_url === "string"
          ? upsertTomlString(text, "openai_base_url", doc.openai_base_url)
          : removeTomlKey(text, "openai_base_url");
      await writeText(paths.codex, next);
    },
    async readClaudeTerminal(): Promise<Record<string, unknown>> {
      const current = parseJsonObject(await readText(paths.claude)) ?? {};
      const env = asRecord(current.env);
      const fromEnv = env?.ANTHROPIC_BASE_URL;
      if (typeof fromEnv === "string") {
        return { ...current, ANTHROPIC_BASE_URL: fromEnv };
      }
      return current;
    },
    async writeClaudeTerminal(doc: Record<string, unknown>): Promise<void> {
      const current = parseJsonObject(await readText(paths.claude));
      if (!current) {
        return;
      }
      const env = { ...(asRecord(current.env) ?? {}) };
      if (typeof doc.ANTHROPIC_BASE_URL === "string") {
        env.ANTHROPIC_BASE_URL = doc.ANTHROPIC_BASE_URL;
      } else {
        delete env.ANTHROPIC_BASE_URL;
      }
      if (Object.keys(env).length === 0) {
        delete current.env;
      } else {
        current.env = env;
      }
      delete current.ANTHROPIC_BASE_URL;
      await writeText(paths.claude, `${JSON.stringify(current, null, 2)}\n`);
    },
    async readVsCodeClaude(): Promise<Record<string, unknown>> {
      return parseJsonObject(await readText(paths.vsCode)) ?? {};
    },
    async writeVsCodeClaude(doc: Record<string, unknown>): Promise<void> {
      if (!Object.hasOwn(doc, "claudeCode.environmentVariables")) {
        return;
      }
      const text = await readText(paths.vsCode);
      const next = replaceJsonProperty(
        text,
        "claudeCode.environmentVariables",
        doc["claudeCode.environmentVariables"],
      );
      await writeText(paths.vsCode, next);
    },
    async setModelOptions(options: ModelOptions | null): Promise<void> {
      if (!options) {
        await restoreModelOptions(paths, backup);
        backup = undefined;
        return;
      }
      if (!backup) {
        backup = (await readDiskBackup(paths)) ?? (await captureModelBackup(paths));
        await writeText(backupFile(paths), `${JSON.stringify(backup)}\n`);
      }
      const models = options.ids.map((id, index) => catalogEntry(id, index + 1));
      const catalogPath = path.join(path.dirname(paths.codex), "classroom-catalog.json");
      await writeText(catalogPath, `${JSON.stringify({ models }, null, 2)}\n`);
      await writeText(
        path.join(path.dirname(paths.codex), "models_cache.json"),
        `${JSON.stringify(
          {
            fetched_at: "2000-01-01T00:00:00Z",
            client_version: "0.0.0",
            models,
          },
          null,
          2,
        )}\n`,
      );
      let toml = await readText(paths.codex);
      toml = upsertTomlString(toml, "model_catalog_json", catalogPath);
      toml = upsertTomlString(toml, "model", options.codexModel);
      await writeText(paths.codex, toml);
      await writeClaudeModel(paths.claude, options.claudeModel);
      await writeText(
        gatewayCachePath(paths.claude),
        `${JSON.stringify({
          baseUrl: options.proxyBaseUrl,
          fetchedAt: 0,
          models: options.ids.map((id) => ({ id, display_name: id })),
        })}\n`,
      );
    },
  };
}

type ModelBackup = {
  codexModel?: string;
  catalogPath?: string;
  modelsCache?: string;
  claudeFile?: string;
  gateway?: string;
};

function gatewayCachePath(claudeSettings: string): string {
  return path.join(path.dirname(claudeSettings), "cache", "gateway-models.json");
}

function catalogEntry(id: string, priority: number): Record<string, unknown> {
  return {
    slug: id,
    display_name: id,
    visibility: "list",
    supported_in_api: true,
    priority,
  };
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

async function captureModelBackup(paths: RouteFilePaths): Promise<ModelBackup> {
  const toml = await readText(paths.codex);
  return {
    codexModel: readTomlString(toml, "model"),
    catalogPath: readTomlString(toml, "model_catalog_json"),
    modelsCache: await readOptional(
      path.join(path.dirname(paths.codex), "models_cache.json"),
    ),
    claudeFile: await readOptional(paths.claude),
    gateway: await readOptional(gatewayCachePath(paths.claude)),
  };
}

function backupFile(paths: RouteFilePaths): string {
  return path.join(path.dirname(paths.codex), "classroom-model-backup.json");
}

async function readDiskBackup(
  paths: RouteFilePaths,
): Promise<ModelBackup | undefined> {
  const raw = await readOptional(backupFile(paths));
  if (!raw) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  return parsed as ModelBackup;
}

async function writeClaudeModel(file: string, model: string): Promise<void> {
  const text = await readText(file);
  const next =
    text.trim() === ""
      ? `${JSON.stringify({ model }, null, 2)}\n`
      : replaceJsonProperty(text, "model", model);
  await writeText(file, next.endsWith("\n") ? next : `${next}\n`);
}

async function restoreBackedFile(
  file: string,
  contents: string | undefined,
): Promise<void> {
  if (contents === undefined) {
    await fs.rm(file, { force: true });
    return;
  }
  await writeText(file, contents);
}

async function restoreModelOptions(
  paths: RouteFilePaths,
  backup: ModelBackup | undefined,
): Promise<void> {
  const saved = backup ?? (await readDiskBackup(paths));
  if (!saved) {
    return;
  }
  let toml = await readText(paths.codex);
  toml = saved.catalogPath
    ? upsertTomlString(toml, "model_catalog_json", saved.catalogPath)
    : removeTomlKey(toml, "model_catalog_json");
  toml = saved.codexModel
    ? upsertTomlString(toml, "model", saved.codexModel)
    : removeTomlKey(toml, "model");
  await writeText(paths.codex, toml);
  await restoreBackedFile(
    path.join(path.dirname(paths.codex), "models_cache.json"),
    saved.modelsCache,
  );
  await restoreBackedFile(paths.claude, saved.claudeFile);
  await restoreBackedFile(gatewayCachePath(paths.claude), saved.gateway);
  await fs.rm(backupFile(paths), { force: true });
}

async function readText(file: string): Promise<string> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

async function writeText(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  if (text.trim() === "") {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(relaxJson(text));
    return asRecord(parsed);
  } catch {
    return undefined;
  }
}

// ponytail: trailing-comma removal can match inside strings. Upgrade path: a JSONC parser.
function relaxJson(text: string): string {
  return stripJsonComments(text).replace(/,\s*([}\]])/g, "$1");
}

function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && next === "/") {
      i += 1;
      while (i + 1 < text.length && text[i + 1] !== "\n") {
        i += 1;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        i += 1;
      }
      i += 1;
      continue;
    }
    out += c;
  }
  return out;
}

// ponytail: first assignment wins, including one inside a table. Upgrade path: a TOML parser.
function readTomlString(text: string, key: string): string | undefined {
  const match = text.match(
    new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*"((?:\\\\.|[^"\\\\])*)"`, "m"),
  );
  if (!match) {
    return undefined;
  }
  return match[1].replaceAll("\\\\", "\\").replaceAll('\\"', '"');
}

function upsertTomlString(text: string, key: string, value: string): string {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const line = `${key} = "${escaped}"`;
  const existing = new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, "m");
  if (existing.test(text)) {
    return text.replace(existing, line);
  }
  const base = text.length === 0 || text.endsWith("\n") ? text : `${text}\n`;
  return `${base}${line}\n`;
}

function removeTomlKey(text: string, key: string): string {
  return text.replace(
    new RegExp(`^[ \\t]*${key}[ \\t]*=.*(?:\\r?\\n)?`, "m"),
    "",
  );
}

// ponytail: replaces the first property with this name. Upgrade path: a JSONC editor.
function replaceJsonProperty(text: string, key: string, value: unknown): string {
  const serialized = JSON.stringify(value);
  const needle = `"${key}"`;
  const at = text.indexOf(needle);
  if (at < 0) {
    return insertJsonProperty(text, key, serialized);
  }
  let i = at + needle.length;
  while (i < text.length && /\s/.test(text[i])) {
    i += 1;
  }
  if (text[i] !== ":") {
    return text;
  }
  i += 1;
  while (i < text.length && /\s/.test(text[i])) {
    i += 1;
  }
  const end = jsonValueEnd(text, i);
  if (end < 0) {
    return text;
  }
  return `${text.slice(0, i)}${serialized}${text.slice(end)}`;
}

function insertJsonProperty(text: string, key: string, serialized: string): string {
  if (text.trim() === "") {
    return `{\n  "${key}": ${serialized}\n}\n`;
  }
  const end = text.lastIndexOf("}");
  if (end < 0) {
    return text;
  }
  const before = text.slice(0, end).trimEnd();
  const comma = before.endsWith("{") || before.endsWith(",") ? "" : ",";
  return `${before}${comma}\n  "${key}": ${serialized}\n${text.slice(end)}`;
}

function jsonValueEnd(text: string, start: number): number {
  const c = text[start];
  if (c === '"') {
    let escape = false;
    for (let i = start + 1; i < text.length; i += 1) {
      if (escape) {
        escape = false;
        continue;
      }
      if (text[i] === "\\") {
        escape = true;
        continue;
      }
      if (text[i] === '"') {
        return i + 1;
      }
    }
    return -1;
  }
  if (c === "{" || c === "[") {
    const close = c === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === c) {
        depth += 1;
      } else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          return i + 1;
        }
      }
    }
    return -1;
  }
  let i = start;
  while (i < text.length && !/[\s,}\]]/.test(text[i])) {
    i += 1;
  }
  return i;
}
