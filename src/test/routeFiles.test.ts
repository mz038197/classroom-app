import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createRouteFiles } from "../routeFiles";

const PROXY = "http://127.0.0.1:47821";

async function tempRoutes() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "classroom-routes-"));
  const paths = {
    codex: path.join(root, "config.toml"),
    claude: path.join(root, "settings.json"),
    vsCode: path.join(root, "vscode.json"),
  };
  return { root, paths, routes: createRouteFiles(paths) };
}

describe("route files", () => {
  it("changes only the Codex route line", async () => {
    const { routes, paths } = await tempRoutes();
    const original = [
      "trust = \"always\"",
      "openai_base_url = \"https://user:secret@old.example/v1?key=vcr_sk_secret\"",
      "",
      "[mcp]",
      "server = \"local\"",
      "",
    ].join("\n");
    await fs.writeFile(paths.codex, original, "utf8");
    const before = await routes.readCodex();
    assert.equal(
      before.openai_base_url,
      "https://user:secret@old.example/v1?key=vcr_sk_secret",
    );
    await routes.writeCodex({ ...before, openai_base_url: PROXY });
    const written = await fs.readFile(paths.codex, "utf8");
    assert.equal(written.includes(`openai_base_url = "${PROXY}"`), true);
    assert.equal(written.includes('trust = "always"'), true);
    assert.equal(written.includes("[mcp]"), true);
    assert.equal(written.includes('server = "local"'), true);
    assert.equal(written.includes("secret"), false);
    assert.equal(written.includes("vcr_sk"), false);
    await routes.writeCodex({});
    const cleared = await fs.readFile(paths.codex, "utf8");
    assert.equal(cleared.includes("openai_base_url"), false);
    assert.equal(cleared.includes('trust = "always"'), true);
    assert.equal(cleared.includes("[mcp]"), true);
    assert.equal(cleared.includes("old.example"), false);
  });

  it("writes Claude ANTHROPIC_BASE_URL under env and leaves API key fields", async () => {
    const { routes, paths } = await tempRoutes();
    await fs.writeFile(
      paths.claude,
      JSON.stringify({
        theme: "dark",
        env: {
          ANTHROPIC_API_KEY: "sk-ant-keep",
          ANTHROPIC_BASE_URL: "https://claude.example",
        },
      }),
      "utf8",
    );
    const before = await routes.readClaudeTerminal();
    assert.equal(before.ANTHROPIC_BASE_URL, "https://claude.example");
    await routes.writeClaudeTerminal({
      ...before,
      ANTHROPIC_BASE_URL: PROXY,
    });
    const written = JSON.parse(await fs.readFile(paths.claude, "utf8")) as {
      theme: string;
      env: Record<string, string>;
      ANTHROPIC_BASE_URL?: string;
    };
    assert.equal(written.env.ANTHROPIC_BASE_URL, PROXY);
    assert.equal(written.env.ANTHROPIC_API_KEY, "sk-ant-keep");
    assert.equal(written.theme, "dark");
    assert.equal(written.ANTHROPIC_BASE_URL, undefined);
    const stopped = { ...before };
    delete stopped.ANTHROPIC_BASE_URL;
    await routes.writeClaudeTerminal(stopped);
    const cleared = JSON.parse(await fs.readFile(paths.claude, "utf8")) as {
      env: Record<string, string>;
    };
    assert.equal(cleared.env.ANTHROPIC_BASE_URL, undefined);
    assert.equal(cleared.env.ANTHROPIC_API_KEY, "sk-ant-keep");
    assert.equal(JSON.stringify(cleared).includes("claude.example"), false);
  });

  it("patches VS Code environment variables without dropping comments or other settings", async () => {
    const { routes, paths } = await tempRoutes();
    const original = `{
  // keep this comment
  "editor.fontSize": 14,
  "claudeCode.environmentVariables": [
    { "name": "OTHER", "value": "stay" },
    { "name": "ANTHROPIC_API_KEY", "value": "sk-ant-keep" },
    { "name": "ANTHROPIC_BASE_URL", "value": "https://claude.example" }
  ]
}
`;
    await fs.writeFile(paths.vsCode, original, "utf8");
    const before = await routes.readVsCodeClaude();
    const env = before["claudeCode.environmentVariables"] as Array<{
      name: string;
      value: string;
    }>;
    assert.equal(
      env.find((entry) => entry.name === "ANTHROPIC_BASE_URL")?.value,
      "https://claude.example",
    );
    await routes.writeVsCodeClaude({
      ...before,
      "claudeCode.environmentVariables": [
        ...env.filter((entry) => entry.name !== "ANTHROPIC_BASE_URL"),
        { name: "ANTHROPIC_BASE_URL", value: PROXY },
      ],
    });
    const written = await fs.readFile(paths.vsCode, "utf8");
    assert.equal(written.includes("// keep this comment"), true);
    assert.equal(written.includes('"editor.fontSize": 14'), true);
    assert.equal(written.includes(PROXY), true);
    assert.equal(written.includes("sk-ant-keep"), true);
    assert.equal(written.includes('"OTHER"'), true);
    assert.equal(written.includes("claude.example"), false);
  });
});
