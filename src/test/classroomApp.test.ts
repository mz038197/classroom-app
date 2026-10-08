import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClassroomApp } from "../classroomApp";

const KEY = "vcr_sk_nick";

const REMOTE_YAML = `
actions:
  - id: demo
    title: 安裝 demo
    kind: package
    description: 從課堂清單安裝
    command: uv add demo
snippets:
  - id: stub
    title: 骨架
    paste_hint: main.py
    body: "print(1)\\n"
`;

function harness(
  session?: { class_name?: string; name?: string },
  options?: {
    redeemError?: Error;
    catalogYaml?: unknown;
    catalogBody?: { course_catalog_yaml?: unknown };
    catalogError?: Error;
    files?: Record<string, string | undefined>;
    run?: (cwd: string, command: string) => Promise<string>;
    write?: (path: string, contents: string) => Promise<void>;
    sessionModels?: (apiKey: string) => Promise<string[]>;
    providers?: Array<Record<string, unknown>>;
  },
) {
  const redeemCalls: { invite_code: string; nickname: string }[] = [];
  const catalogKeys: string[] = [];
  const fileReads: string[] = [];
  const runCalls: { cwd: string; command: string }[] = [];
  const modelKeys: string[] = [];
  let providers = structuredClone(options?.providers ?? []);
  const copilotWrites: { providers: Array<Record<string, unknown>> }[] = [];
  const proxyReceived: string[] = [];
  let storedKey: string | undefined;
  let clipboard = "";
  let clipboardWrites = 0;
  let clipboardError: Error | undefined;
  let stops = 0;
  const resolvedSession = session ?? { class_name: "Demo", name: "Week 1" };
  const app = new ClassroomApp({
    router: {
      async redeemNickname(body) {
        redeemCalls.push(body);
        if (options?.redeemError) {
          throw options.redeemError;
        }
        return {
          api_key: KEY,
          session: resolvedSession,
        };
      },
      async fetchSessionModels(apiKey: string) {
        modelKeys.push(apiKey);
        if (options?.sessionModels) {
          return options.sessionModels(apiKey);
        }
        return ["second-looking-but-first", "later"];
      },
    },
    catalog: {
      async fetchCourseCatalog(apiKey) {
        catalogKeys.push(apiKey);
        if (options?.catalogError) {
          throw options.catalogError;
        }
        if (options?.catalogBody) {
          return options.catalogBody;
        }
        return {
          course_catalog_yaml:
            options?.catalogYaml === undefined
              ? REMOTE_YAML
              : options.catalogYaml,
        };
      },
    },
    projectFiles: {
      async readClassroomInstalls(folder) {
        fileReads.push(folder);
        return options?.files?.[folder];
      },
    },
    clipboard: {
      async write(text: string) {
        if (clipboardError) {
          throw clipboardError;
        }
        clipboard = text;
        clipboardWrites += 1;
      },
    },
    storage: {
      async getApiKey() {
        return storedKey;
      },
      async setApiKey(apiKey: string) {
        storedKey = apiKey;
      },
      async clearApiKey() {
        storedKey = undefined;
      },
    },
    commands: {
      async run(cwd, command) {
        runCalls.push({ cwd, command });
        if (options?.run) {
          return options.run(cwd, command);
        }
        return "ok";
      },
    },
    files: {
      async write(path, contents) {
        await options?.write?.(path, contents);
      },
    },
    stopProcess() {
      stops += 1;
    },
    proxyBaseUrl: "http://127.0.0.1:47821",
    copilot: {
      async read() {
        return { providers: structuredClone(providers) };
      },
      async write(doc) {
        copilotWrites.push(structuredClone(doc));
        providers = structuredClone(doc.providers);
      },
    },
    proxy: {
      async receive(request) {
        proxyReceived.push(request.provider);
      },
    },
  });
  return {
    app,
    redeemCalls,
    modelKeys,
    clipboard: () => clipboard,
    clipboardWrites: () => clipboardWrites,
    storedKey: () => storedKey,
    stops: () => stops,
    catalogKeys,
    fileReads,
    copilotWrites: () => copilotWrites,
    copilotProviders: () => structuredClone(providers),
    proxyReceived: () => [...proxyReceived],
    runCalls,
    failClipboard(error: Error) {
      clipboardError = error;
    },
  };
}

describe("Classroom App redeem", () => {
  it("does not redeem when the invite code is blank after trim", async () => {
    const { app, redeemCalls, modelKeys } = harness();
    await app.redeem("   ", "Ada");
    assert.equal(redeemCalls.length, 0);
    assert.deepEqual(modelKeys, []);
    assert.equal(app.view().connected, false);
    assert.equal(app.view().canCopyKey, false);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("does not redeem when the nickname is blank after trim", async () => {
    const { app, redeemCalls, modelKeys } = harness();
    await app.redeem("ABC12345", " \n\t ");
    assert.equal(redeemCalls.length, 0);
    assert.deepEqual(modelKeys, []);
    assert.equal(app.view().connected, false);
    assert.equal(app.view().canCopyKey, false);
  });

  it("shows Class Label after redeem and keeps the key out of the view", async () => {
    const { app, redeemCalls, storedKey } = harness();
    await app.redeem("  ABC12345 ", " Ada ");
    assert.deepEqual(redeemCalls, [
      { invite_code: "ABC12345", nickname: "Ada" },
    ]);
    const view = app.view();
    assert.equal(view.connected, true);
    assert.equal(view.classLabel, "Demo · Week 1");
    assert.equal(view.detail, "Classroom API Key 已設定。");
    assert.equal(view.canCopyKey, true);
    assert.equal(storedKey(), KEY);
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("uses only the session name when class name is absent", async () => {
    const { app } = harness({ name: "Week 1" });
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().classLabel, "Week 1");
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("stays disconnected when redeem fails and does not keep the key", async () => {
    const { app, redeemCalls, storedKey } = harness(undefined, {
      redeemError: new Error(`router said ${KEY}`),
    });
    await app.redeem("ABC12345", "Ada");
    assert.equal(redeemCalls.length, 1);
    assert.equal(app.view().connected, false);
    assert.equal(app.view().canCopyKey, false);
    assert.equal(app.view().classLabel, undefined);
    assert.equal(storedKey(), undefined);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
    assert.equal(app.view().detail, "兌換失敗。請檢查邀請碼與課堂暱稱。");
  });
});

describe("Copy Classroom API Key", () => {
  it("copies the stored key and tells the student not to share it", async () => {
    const { app, clipboard } = harness();
    await app.redeem("ABC12345", "Ada");
    await app.copyKey();
    assert.equal(clipboard(), KEY);
    const view = app.view();
    assert.equal(
      view.notice,
      "已複製 Classroom API Key。請勿分享給不信任的人。",
    );
    assert.equal(view.detail, "Classroom API Key 已設定。");
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("reports copy failure without echoing the key", async () => {
    const { app, clipboard, failClipboard } = harness();
    await app.redeem("ABC12345", "Ada");
    failClipboard(new Error(`clipboard down ${KEY}`));
    await app.copyKey();
    assert.equal(clipboard(), "");
    const view = app.view();
    assert.equal(
      view.notice,
      "無法複製 Classroom API Key。請重新連線後再試。",
    );
    assert.equal(view.canCopyKey, true);
    assert.equal(view.classLabel, "Demo · Week 1");
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("does not copy when the student is not connected", async () => {
    const { app, clipboard } = harness();
    await app.copyKey();
    assert.equal(clipboard(), "");
    assert.equal(
      app.view().notice,
      "無法複製 Classroom API Key。請重新連線後再試。",
    );
    assert.equal(app.view().canCopyKey, false);
  });
});

describe("Clear Classroom Connection", () => {
  it("removes the copy entry and Class Label", async () => {
    const { app, storedKey, clipboardWrites } = harness();
    await app.redeem("ABC12345", "Ada");
    await app.copyKey();
    assert.equal(clipboardWrites(), 1);
    await app.clearConnection();
    const view = app.view();
    assert.equal(view.connected, false);
    assert.equal(view.canCopyKey, false);
    assert.equal(view.classLabel, undefined);
    assert.equal(view.notice, undefined);
    assert.equal(storedKey(), undefined);
    assert.equal(view.catalog, undefined);
    assert.equal(JSON.stringify(view).includes(KEY), false);
    await app.copyKey();
    assert.equal(clipboardWrites(), 1);
    assert.equal(app.view().canCopyKey, false);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("returns the switch to Native and drops the copy entry", async () => {
    const { app, storedKey, clipboardWrites } = harness();
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    await app.clearConnection();
    const view = app.view();
    assert.equal(view.mode, "native");
    assert.equal(view.modelId, undefined);
    assert.equal(view.canCopyKey, false);
    assert.equal(view.classLabel, undefined);
    assert.equal(view.notice, undefined);
    assert.equal(storedKey(), undefined);
    assert.equal(JSON.stringify(view).includes(KEY), false);
    await app.copyKey();
    assert.equal(clipboardWrites(), 0);
    await app.setSwitch("classroom");
    assert.equal(app.view().mode, "native");
  });
});

describe("Model Switch", () => {
  it("uses one mode for both Codex and Claude Code, selecting the first returned id", async () => {
    const { app, modelKeys } = harness();
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().mode, "native");
    assert.deepEqual(modelKeys, [KEY]);
    await app.setSwitch("classroom");
    assert.deepEqual(modelKeys, [KEY]);
    const view = app.view();
    assert.equal(view.mode, "classroom");
    assert.equal(view.modelId, "second-looking-but-first");
    assert.equal("codex" in view, false);
    assert.equal("claude" in view, false);
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("stays Native when the allowlist is explicitly empty", async () => {
    const { app, modelKeys } = harness(undefined, {
      async sessionModels() {
        return [];
      },
    });
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    assert.equal(app.view().mode, "native");
    assert.equal(app.view().modelId, undefined);
    assert.deepEqual(modelKeys, [KEY]);
  });

  it("stays Native when there is no Classroom API Key", async () => {
    const { app, modelKeys } = harness();
    await app.setSwitch("classroom");
    assert.equal(app.view().mode, "native");
    assert.equal(app.view().modelId, undefined);
    assert.deepEqual(modelKeys, []);
  });

  it("returns to Native when the new session allowlist is explicitly empty", async () => {
    let call = 0;
    const { app } = harness(undefined, {
      async sessionModels() {
        call += 1;
        if (call === 1) {
          return ["second-looking-but-first", "later"];
        }
        return [];
      },
    });
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().mode, "native");
    assert.equal(app.view().modelId, undefined);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("replaces the selected id with the new session's first id", async () => {
    let call = 0;
    const { app } = harness(undefined, {
      async sessionModels(apiKey) {
        assert.equal(apiKey, KEY);
        call += 1;
        if (call === 1) {
          return ["second-looking-but-first", "later"];
        }
        return ["fresh-session-first", "tail"];
      },
    });
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().mode, "classroom");
    assert.equal(app.view().modelId, "fresh-session-first");
  });

  it("keeps the previous Classroom id when reload throws", async () => {
    let fail = false;
    const { app } = harness(undefined, {
      async sessionModels() {
        if (fail) {
          throw new Error("refetch failed, template-fallback-id");
        }
        return ["second-looking-but-first", "later"];
      },
    });
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    fail = true;
    await app.reloadAllowlist();
    const view = app.view();
    assert.equal(view.mode, "classroom");
    assert.equal(view.modelId, "second-looking-but-first");
    assert.equal(JSON.stringify(view).includes("template-fallback-id"), false);
  });

  it("does not keep a third-party base URL when returning to Native", async () => {
    const { app } = harness();
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    await app.setSwitch("native");
    const view = app.view();
    assert.equal(view.mode, "native");
    assert.equal(view.modelId, undefined);
    assert.equal(view.connected, true);
    const serialized = JSON.stringify(view);
    assert.equal(serialized.includes("openai_base_url"), false);
    assert.equal(serialized.includes("ANTHROPIC_BASE_URL"), false);
    assert.equal(serialized.includes("http"), false);
    assert.equal(serialized.includes(KEY), false);
  });
});

describe("Course Catalog after redeem", () => {
  it("shows remote actions and snippets using the stored Classroom API Key", async () => {
    const { app, catalogKeys, storedKey, fileReads } = harness();
    await app.redeem("ABC12345", "Ada");
    assert.deepEqual(catalogKeys, [KEY]);
    assert.equal(catalogKeys[0], storedKey());
    const view = app.view();
    assert.equal(view.catalog?.source, "remote");
    assert.deepEqual(view.catalog?.actions, [
      {
        id: "demo",
        title: "安裝 demo",
        kind: "package",
        description: "從課堂清單安裝",
        command: "uv add demo",
      },
    ]);
    assert.deepEqual(view.catalog?.snippets, [
      {
        id: "stub",
        title: "骨架",
        pasteHint: "main.py",
        body: "print(1)\n",
      },
    ]);
    assert.equal(view.catalog?.localNote, undefined);
    assert.equal(fileReads.length, 0);
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("keeps snippet body whitespace and does not read a project file", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogYaml: `
actions:
  - id: demo
    title: Demo
    kind: skill
    command: echo hi
snippets:
  - id: stub
    title: 骨架
    paste_hint: mcp_client.py
    body: "  keep  \\n"
`,
    });
    await app.redeem("ABC12345", "Ada");
    const snippet = app.view().catalog?.snippets?.[0];
    assert.equal(snippet?.body, "  keep  \n");
    assert.equal(snippet?.pasteHint, "mcp_client.py");
    assert.equal(fileReads.length, 0);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("omits the snippet region when snippets are missing or empty", async () => {
    const missing = harness(undefined, {
      catalogYaml: `
actions:
  - id: demo
    title: Demo
    kind: skill
    command: echo hi
`,
    });
    await missing.app.redeem("ABC12345", "Ada");
    assert.equal(missing.app.view().catalog?.actions.length, 1);
    assert.equal(missing.app.view().catalog?.snippets, undefined);
    assert.equal(
      Object.hasOwn(missing.app.view().catalog ?? {}, "snippets"),
      false,
    );

    const empty = harness(undefined, {
      catalogYaml: "actions: []\nsnippets: []\n",
    });
    await empty.app.redeem("ABC12345", "Ada");
    assert.deepEqual(empty.app.view().catalog?.actions, []);
    assert.equal(empty.app.view().catalog?.snippets, undefined);
    assert.equal(
      Object.hasOwn(empty.app.view().catalog ?? {}, "snippets"),
      false,
    );
  });

  it("keeps an empty remote action list and does not read the local file", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogYaml: "actions: []\n",
      files: {
        "D:\\lesson": `
actions:
  - id: local
    title: Should Not Load
    kind: skill
    command: echo local
`,
      },
    });
    await app.redeem("ABC12345", "Ada");
    await app.setProjectFolder("D:\\lesson");
    const view = app.view();
    assert.equal(view.catalog?.source, "remote");
    assert.deepEqual(view.catalog?.actions, []);
    assert.equal(view.catalog?.snippets, undefined);
    assert.equal(view.catalog?.localNote, undefined);
    assert.equal(JSON.stringify(view).includes("Should Not Load"), false);
    assert.deepEqual(fileReads, []);
  });

  it("reads classroom-installs.yaml when remote fetch throws and a Project Folder is set", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogError: new Error("network down"),
      files: {
        "D:\\lesson": `
actions:
  - id: local
    title: 本機動作
    kind: mcp
    command: echo local
`,
      },
    });
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    const view = app.view();
    assert.equal(view.catalog?.source, "local");
    assert.equal(view.catalog?.localNote, "這是本機清單。");
    assert.equal(view.catalog?.actions[0]?.title, "本機動作");
    assert.equal(view.catalog?.actions[0]?.kind, "mcp");
    assert.equal(view.catalog?.snippets, undefined);
    assert.equal(view.installAvailable, true);
    assert.deepEqual(fileReads, ["D:\\lesson"]);
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("reads the local file when the remote body has no YAML string", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogBody: { course_catalog_yaml: null },
      files: {
        "D:\\lesson": `
actions:
  - id: local
    title: 本機動作
    kind: skill
    command: echo local
`,
      },
    });
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().catalog?.source, "local");
    assert.equal(app.view().catalog?.localNote, "這是本機清單。");
    assert.equal(app.view().catalog?.actions[0]?.title, "本機動作");
    assert.deepEqual(fileReads, ["D:\\lesson"]);
  });

  it("rejects an illegal remote catalog without actions, snippets, or the local file", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogYaml: `
actions:
  - id: partial
    title: Partial Action
    kind: skill
    command: echo hi
snippets:
  - id: stub
    title: A
    body: a
  - id: stub
    title: B
    body: b
`,
      files: {
        "D:\\lesson": `
actions:
  - id: local
    title: Local Only
    kind: skill
    command: echo local
`,
      },
    });
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    const view = app.view();
    assert.equal(view.connected, true);
    assert.equal(view.catalog, undefined);
    assert.equal(view.catalogError?.includes("重複"), true);
    assert.equal(JSON.stringify(view).includes("Partial Action"), false);
    assert.equal(JSON.stringify(view).includes("Local Only"), false);
    assert.deepEqual(fileReads, []);
  });

  it("does not fall back when the remote YAML string is present but empty", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogYaml: "",
      files: {
        "D:\\lesson": `
actions:
  - id: local
    title: Local Only
    kind: skill
    command: echo local
`,
      },
    });
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().catalog, undefined);
    assert.equal(JSON.stringify(app.view()).includes("Local Only"), false);
    assert.deepEqual(fileReads, []);
  });

  it("loads the remote catalog without a Project Folder and does not read a local file", async () => {
    const { app, fileReads } = harness(undefined, {
      files: {
        "D:\\lesson": `
actions:
  - id: local
    title: Local Only
    kind: skill
    command: echo local
`,
      },
    });
    await app.redeem("ABC12345", "Ada");
    const view = app.view();
    assert.equal(view.catalog?.source, "remote");
    assert.equal(view.catalog?.actions[0]?.title, "安裝 demo");
    assert.equal(view.projectFolder, undefined);
    assert.equal(view.installAvailable, false);
    assert.equal(view.installNotice, "尚未指定專案資料夾，安裝不可用。");
    assert.deepEqual(fileReads, []);
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("does not read a local file when remote fetch throws and no Project Folder is set", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogError: new Error("network down"),
      files: {
        "D:\\somewhere": `
actions:
  - id: local
    title: Local Only
    kind: skill
    command: echo local
`,
      },
    });
    await app.redeem("ABC12345", "Ada");
    const view = app.view();
    assert.equal(view.connected, true);
    assert.equal(view.catalog, undefined);
    assert.equal(view.installAvailable, false);
    assert.equal(view.installNotice, "尚未指定專案資料夾，安裝不可用。");
    assert.equal(JSON.stringify(view).includes("Local Only"), false);
    assert.deepEqual(fileReads, []);
  });

  it("replaces the Project Folder and reads the new local list", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogError: new Error("network down"),
      files: {
        "D:\\one": `
actions:
  - id: a
    title: From A
    kind: package
    command: echo a
`,
        "D:\\two": `
actions:
  - id: b
    title: From B
    kind: skill
    command: echo b
`,
      },
    });
    await app.setProjectFolder("D:\\one");
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().catalog?.actions[0]?.title, "From A");
    await app.setProjectFolder("  D:\\two  ");
    const view = app.view();
    assert.equal(view.projectFolder, "D:\\two");
    assert.equal(view.catalog?.source, "local");
    assert.equal(view.catalog?.localNote, "這是本機清單。");
    assert.equal(view.catalog?.actions[0]?.title, "From B");
    assert.equal(JSON.stringify(view).includes("From A"), false);
    assert.deepEqual(fileReads, ["D:\\one", "D:\\two"]);
  });
});

describe("confirm one catalog command", () => {
  it("prepare puts that action's full command on the view and does not run it", async () => {
    const { app, runCalls } = harness();
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    app.prepare("demo");
    const view = app.view();
    assert.equal(view.pendingCommand, "uv add demo");
    assert.equal(view.commandRunning, false);
    assert.equal(runCalls.length, 0);
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("confirm runs the pending command", async () => {
    const { app, runCalls } = harness();
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    app.prepare("demo");
    await app.confirm();
    assert.equal(runCalls.length, 1);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("cancel clears the pending command and does not run it", async () => {
    const { app, runCalls } = harness();
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    app.prepare("demo");
    app.cancel();
    assert.equal(app.view().pendingCommand, undefined);
    await app.confirm();
    assert.equal(runCalls.length, 0);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("runs in the Project Folder with the catalog command unchanged", async () => {
    const { app, runCalls } = harness(undefined, {
      catalogYaml: `
actions:
  - id: spaced
    title: Spaced
    kind: package
    command: "echo hello  world"
`,
    });
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    app.prepare("spaced");
    await app.confirm();
    assert.deepEqual(runCalls, [
      { cwd: "D:\\lesson", command: "echo hello  world" },
    ]);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("shows the runner output on the view", async () => {
    const { app } = harness(undefined, {
      run: async () => "printed-by-runner\n",
    });
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    app.prepare("demo");
    await app.confirm();
    const view = app.view();
    assert.equal(view.commandOutput, "printed-by-runner\n");
    assert.equal(view.commandRunning, false);
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("does not run when no Project Folder is set", async () => {
    const { app, runCalls } = harness();
    await app.redeem("ABC12345", "Ada");
    app.prepare("demo");
    await app.confirm();
    assert.equal(runCalls.length, 0);
    assert.equal(app.view().pendingCommand, undefined);
    assert.equal(app.view().commandOutput, undefined);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("rejects a folder change and a second command while one is running", async () => {
    let release: (value: string) => void = () => {};
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    const { app, runCalls, fileReads } = harness(undefined, {
      catalogYaml: `
actions:
  - id: first
    title: First
    kind: skill
    command: echo first
  - id: second
    title: Second
    kind: skill
    command: echo second
`,
      files: {
        "D:\\other": `
actions:
  - id: other
    title: Other
    kind: skill
    command: echo other
`,
      },
      run: async () => gate,
    });
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    app.prepare("first");
    const running = app.confirm();
    assert.equal(runCalls.length, 1);
    assert.equal(app.view().commandRunning, true);
    await app.setSwitch("classroom");
    assert.equal(app.view().mode, "classroom");
    assert.equal(app.view().modelId, "second-looking-but-first");
    assert.equal(app.view().commandRunning, true);
    await app.setProjectFolder("D:\\other");
    assert.equal(app.view().projectFolder, "D:\\lesson");
    assert.deepEqual(fileReads, []);
    app.prepare("second");
    await app.confirm();
    assert.equal(runCalls.length, 1);
    assert.equal(app.view().pendingCommand, "echo first");
    release("still first\n");
    await running;
    const view = app.view();
    assert.equal(view.commandOutput, "still first\n");
    assert.equal(view.commandRunning, false);
    assert.equal(view.projectFolder, "D:\\lesson");
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("runs an mcp action as that catalog command and does not write a config file", async () => {
    const writes: { path: string; contents: string }[] = [];
    const command =
      "uvx --from git+https://github.com/mz038197/peas-agent-mcp.git add-vans-mcp";
    const { app, runCalls } = harness(undefined, {
      catalogYaml: `
actions:
  - id: add-vans-mcp
    title: 安裝 MCP
    kind: mcp
    command: "${command}"
`,
      write: async (path, contents) => {
        writes.push({ path, contents });
      },
    });
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    app.prepare("add-vans-mcp");
    assert.equal(runCalls.length, 0);
    await app.confirm();
    assert.deepEqual(runCalls, [{ cwd: "D:\\lesson", command }]);
    assert.deepEqual(writes, []);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });
});

describe("close window", () => {
  it("does not stop the process", async () => {
    const { app, stops, storedKey, clipboardWrites } = harness();
    await app.redeem("ABC12345", "Ada");
    app.closeWindow();
    assert.equal(stops(), 0);
    assert.equal(app.view().connected, true);
    assert.equal(app.view().classLabel, "Demo · Week 1");
    assert.equal(app.view().canCopyKey, true);
    assert.equal(storedKey(), KEY);
    await app.copyKey();
    assert.equal(clipboardWrites(), 1);
    assert.equal(stops(), 0);
  });
});

describe("VCRouter", () => {
  it("appends one VCRouter addressed at the local proxy and leaves other providers unchanged", async () => {
    const openRouter = {
      name: "OpenRouter",
      vendor: "openrouter",
      apiKey: "keep-me",
      models: [{ id: "keep-or", name: "keep-or" }],
    };
    const { app, copilotWrites, storedKey } = harness(undefined, {
      providers: [openRouter],
    });
    await app.redeem("ABC12345", "Ada");
    assert.equal(storedKey(), KEY);
    await app.start();
    assert.equal(copilotWrites().length, 1);
    const written = copilotWrites()[0];
    assert.deepEqual(written?.providers[0], openRouter);
    assert.deepEqual(written?.providers[1], {
      name: "VCRouter",
      url: "http://127.0.0.1:47821",
    });
    assert.equal(written?.providers.length, 2);
    assert.equal(Object.hasOwn(written?.providers[1] ?? {}, "apiKey"), false);
    assert.equal(JSON.stringify(written).includes(KEY), false);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("asks for a full VS Code restart only when VCRouter is inserted", async () => {
    const { app } = harness(undefined, {
      providers: [{ name: "OpenRouter", apiKey: "keep-me" }],
    });
    await app.redeem("ABC12345", "Ada");
    await app.start();
    assert.deepEqual(app.view().mustRestart, ["vscode"]);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("does not write when VCRouter is already present", async () => {
    const existing = [
      { name: "OpenRouter", apiKey: "keep-me" },
      {
        name: "VCRouter",
        url: "http://127.0.0.1:9",
        models: [{ id: "leave-me" }],
      },
    ];
    const { app, copilotWrites } = harness(undefined, { providers: existing });
    await app.redeem("ABC12345", "Ada");
    await app.start();
    await app.setSwitch("classroom");
    await app.setSwitch("native");
    assert.equal(copilotWrites().length, 0);
    assert.equal(app.view().mustRestart, undefined);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("does not add or remove providers when the switch changes after the first insert", async () => {
    const { app, copilotWrites, copilotProviders } = harness(undefined, {
      providers: [{ name: "OpenRouter", apiKey: "keep-me" }],
    });
    await app.redeem("ABC12345", "Ada");
    await app.start();
    const afterInsert = copilotProviders();
    await app.setSwitch("classroom");
    await app.setSwitch("native");
    assert.deepEqual(copilotProviders(), afterInsert);
    assert.equal(copilotWrites().length, 1);
    assert.equal(
      afterInsert.filter((provider) => provider.name === "VCRouter").length,
      1,
    );
    assert.equal(
      afterInsert.some((provider) => provider.name === "OpenRouter"),
      true,
    );
  });

  it("refuses VCRouter while the proxy is stopped and never sends Native into it", async () => {
    const { app, proxyReceived } = harness();
    await app.redeem("ABC12345", "Ada");
    await app.start();
    await app.copilotRequest("native");
    assert.deepEqual(proxyReceived(), []);
    await app.stop();
    await assert.rejects(() => app.copilotRequest("VCRouter"), (err: unknown) => {
      assert.equal(String(err).includes(KEY), false);
      return true;
    });
    assert.deepEqual(proxyReceived(), []);
    await app.copilotRequest("native");
    assert.deepEqual(proxyReceived(), []);
  });

  it("accepts VCRouter after start again and still skips Native", async () => {
    const { app, proxyReceived, copilotProviders } = harness();
    await app.start();
    await app.stop();
    assert.equal(
      copilotProviders().some((provider) => provider.name === "VCRouter"),
      true,
    );
    await app.start();
    await app.copilotRequest("native");
    assert.deepEqual(proxyReceived(), []);
    await app.copilotRequest("VCRouter");
    assert.deepEqual(proxyReceived(), ["VCRouter"]);
  });

  it("does not stop the proxy when the window closes", async () => {
    const { app, stops, proxyReceived } = harness();
    await app.redeem("ABC12345", "Ada");
    await app.start();
    app.closeWindow();
    assert.equal(stops(), 0);
    await app.copilotRequest("VCRouter");
    assert.deepEqual(proxyReceived(), ["VCRouter"]);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });
});
