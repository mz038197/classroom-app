import { parse as parseYaml } from "yaml";

export const ACTION_KINDS = ["skill", "package", "mcp"] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_KIND_LABELS: Record<ActionKind, string> = {
  skill: "Skill",
  package: "套件",
  mcp: "MCP",
};

export type InstallAction = {
  id: string;
  title: string;
  kind: ActionKind;
  command: string;
  description?: string;
};

export type LessonSnippet = {
  id: string;
  title: string;
  body: string;
  pasteHint?: string;
};

export type ParseCourseCatalogResult =
  | { ok: true; actions: InstallAction[]; snippets: LessonSnippet[] }
  | { ok: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isActionKind(value: unknown): value is ActionKind {
  return typeof value === "string" && (ACTION_KINDS as readonly string[]).includes(value);
}

export function actionKindLabel(kind: ActionKind): string {
  return ACTION_KIND_LABELS[kind];
}

/** 解析 Course Catalog YAML。失敗時不回半套清單。 */
export function parseCourseCatalog(source: string): ParseCourseCatalogResult {
  let doc: unknown;
  try {
    doc = parseYaml(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `YAML 無法解析：${message}` };
  }

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: false, error: "根層必須是物件，且含 actions 陣列" };
  }

  const actionsRaw = (doc as { actions?: unknown }).actions;
  if (!Array.isArray(actionsRaw)) {
    return { ok: false, error: "缺少頂層鍵 actions（陣列）" };
  }

  const actions: InstallAction[] = [];
  for (let i = 0; i < actionsRaw.length; i++) {
    const row = actionsRaw[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, error: `actions[${i}] 必須是物件` };
    }
    const { id, title, command, description, kind } = row as Record<string, unknown>;
    if (!isNonEmptyString(id) || !isNonEmptyString(title) || !isNonEmptyString(command)) {
      return {
        ok: false,
        error: `actions[${i}] 缺少必填欄位 id／title／command`,
      };
    }
    const kindValue = isNonEmptyString(kind) ? kind.trim() : kind;
    if (!isActionKind(kindValue)) {
      return {
        ok: false,
        error: `actions[${i}].kind 必須是 skill／package／mcp`,
      };
    }
    const action: InstallAction = {
      id: id.trim(),
      title: title.trim(),
      kind: kindValue,
      command: command.trim(),
    };
    if (description !== undefined) {
      if (!isNonEmptyString(description)) {
        return {
          ok: false,
          error: `actions[${i}].description 若提供須為非空字串`,
        };
      }
      action.description = description.trim();
    }
    actions.push(action);
  }

  const snippetsResult = parseSnippets((doc as { snippets?: unknown }).snippets);
  if (!snippetsResult.ok) {
    return snippetsResult;
  }

  return { ok: true, actions, snippets: snippetsResult.snippets };
}

function parseSnippets(
  snippetsRaw: unknown,
): { ok: true; snippets: LessonSnippet[] } | { ok: false; error: string } {
  if (snippetsRaw === undefined || snippetsRaw === null) {
    return { ok: true, snippets: [] };
  }
  if (!Array.isArray(snippetsRaw)) {
    return { ok: false, error: "頂層鍵 snippets 若提供須為陣列" };
  }

  const snippets: LessonSnippet[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < snippetsRaw.length; i++) {
    const row = snippetsRaw[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, error: `snippets[${i}] 必須是物件` };
    }
    const { id, title, body, paste_hint: pasteHintRaw } = row as Record<
      string,
      unknown
    >;
    if (!isNonEmptyString(id) || !isNonEmptyString(title)) {
      return {
        ok: false,
        error: `snippets[${i}] 缺少必填欄位 id／title／body`,
      };
    }
    if (typeof body !== "string" || body.length === 0) {
      return {
        ok: false,
        error: `snippets[${i}] 缺少必填欄位 id／title／body`,
      };
    }
    const snippetId = id.trim();
    if (seenIds.has(snippetId)) {
      return { ok: false, error: `snippets 內 id 重複：${snippetId}` };
    }
    seenIds.add(snippetId);
    const snippet: LessonSnippet = {
      id: snippetId,
      title: title.trim(),
      body,
    };
    if (pasteHintRaw !== undefined) {
      if (!isNonEmptyString(pasteHintRaw)) {
        return {
          ok: false,
          error: `snippets[${i}].paste_hint 若提供須為非空字串`,
        };
      }
      snippet.pasteHint = pasteHintRaw.trim();
    }
    snippets.push(snippet);
  }
  return { ok: true, snippets };
}
