import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  ClassroomApp,
  type EnvironmentToolId,
  type NicknameRedeemResult,
} from "./classroomApp";
import { renderPage } from "./page";

const port = 47821;
const pageUrl = `http://127.0.0.1:${port}/`;

function storageFile(): string {
  const root = process.env.LOCALAPPDATA || os.homedir();
  return path.join(root, "classroom-app", "connection.json");
}

function createFileStorage(filePath: string) {
  return {
    async getApiKey(): Promise<string | undefined> {
      try {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          return undefined;
        }
        const apiKey = (parsed as { apiKey?: unknown }).apiKey;
        return typeof apiKey === "string" && apiKey ? apiKey : undefined;
      } catch {
        return undefined;
      }
    },
    async setApiKey(apiKey: string): Promise<void> {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify({ apiKey }), "utf8");
    },
    async clearApiKey(): Promise<void> {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "{}", "utf8");
    },
  };
}

function modelIdsInRouterOrder(payload: unknown): string[] {
  if (!Array.isArray(payload)) {
    throw new Error("模型清單格式錯誤");
  }
  const ids: string[] = [];
  for (const provider of payload) {
    if (!provider || typeof provider !== "object") {
      continue;
    }
    const models = (provider as { models?: unknown }).models;
    if (!Array.isArray(models)) {
      continue;
    }
    for (const model of models) {
      if (!model || typeof model !== "object") {
        continue;
      }
      const id = (model as { id?: unknown }).id;
      if (typeof id === "string" && id) {
        ids.push(id);
      }
    }
  }
  return ids;
}

async function fetchSessionModels(apiKey: string): Promise<string[]> {
  const root = (
    process.env.CLASSROOM_ROUTER_BASE_URL ?? "https://ai.vanscoding.com"
  ).replace(/\/+$/, "");
  const response = await fetch(`${root}/extension/chat-language-models`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error("session models failed");
  }
  return modelIdsInRouterOrder(await response.json());
}

function isRedeemResult(value: unknown): value is NicknameRedeemResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as { api_key?: unknown; session?: unknown };
  return (
    typeof record.api_key === "string" &&
    record.api_key.length > 0 &&
    !!record.session &&
    typeof record.session === "object"
  );
}

async function fetchCourseCatalog(
  apiKey: string,
): Promise<{ course_catalog_yaml?: unknown }> {
  const root = (
    process.env.CLASSROOM_ROUTER_BASE_URL ?? "https://ai.vanscoding.com"
  ).replace(/\/+$/, "");
  const response = await fetch(`${root}/extension/course-catalog`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error("course catalog failed");
  }
  const json: unknown = await response.json();
  if (!json || typeof json !== "object") {
    throw new Error("course catalog failed");
  }
  return json as { course_catalog_yaml?: unknown };
}

async function readClassroomInstalls(
  folder: string,
): Promise<string | undefined> {
  try {
    return await fs.readFile(
      path.join(folder, "classroom-installs.yaml"),
      "utf8",
    );
  } catch {
    return undefined;
  }
}

async function redeemNickname(body: {
  invite_code: string;
  nickname: string;
}): Promise<NicknameRedeemResult> {
  const root = (
    process.env.CLASSROOM_ROUTER_BASE_URL ?? "https://ai.vanscoding.com"
  ).replace(/\/+$/, "");
  const response = await fetch(
    `${root}/extension/sessions/nickname-redeem`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        invite_code: body.invite_code,
        nickname: body.nickname,
      }),
    },
  );
  if (!response.ok) {
    throw new Error("nickname redeem failed");
  }
  const json: unknown = await response.json();
  if (!isRedeemResult(json)) {
    throw new Error("nickname redeem failed");
  }
  return json;
}

const ENVIRONMENT_TOOL_IDS: readonly EnvironmentToolId[] = [
  "uv",
  "git",
  "node",
  "pwsh",
];

function isEnvironmentTool(value: string): value is EnvironmentToolId {
  return (ENVIRONMENT_TOOL_IDS as readonly string[]).includes(value);
}

function probeEnvironment(
  tool: EnvironmentToolId,
): Promise<{ installed: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(tool, ["--version"], { windowsHide: true });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", () => resolve({ installed: false }));
    child.on("close", (code) => {
      resolve({ installed: code === 0 || /\d/.test(output) });
    });
  });
}

function installEnvironment(
  tool: EnvironmentToolId,
  cwd: string,
): Promise<{ exitCode: number | undefined; output: string }> {
  const command = environmentInstallCommand(tool);
  return new Promise((resolve) => {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", command], {
      cwd,
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => resolve({ exitCode: 1, output: "安裝命令無法啟動。" }));
    child.on("close", (code) => {
      resolve({
        exitCode: code === null ? undefined : code,
        output: Buffer.concat(chunks).toString("utf8"),
      });
    });
  });
}

function environmentInstallCommand(tool: EnvironmentToolId): string {
  const quiet =
    "--source winget --disable-interactivity -h --accept-package-agreements --accept-source-agreements";
  if (tool === "uv") {
    return 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"';
  }
  if (tool === "git") {
    return `winget install --id Git.Git -e ${quiet}`;
  }
  if (tool === "node") {
    return `winget install --id OpenJS.NodeJS.LTS -e ${quiet}`;
  }
  return `winget install --id Microsoft.PowerShell -e ${quiet}`;
}

function runCommand(cwd: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", command], {
      cwd,
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => reject(new Error("command failed")));
    child.on("close", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function writeClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Set-Clipboard -Value ([Console]::In.ReadToEnd())",
      ],
      { stdio: ["pipe", "ignore", "pipe"], windowsHide: true },
    );
    let failed = false;
    child.on("error", () => {
      failed = true;
      reject(new Error("clipboard failed"));
    });
    child.stderr.on("data", () => {
      failed = true;
    });
    child.on("close", (code) => {
      if (!failed && code === 0) {
        resolve();
        return;
      }
      reject(new Error("clipboard failed"));
    });
    child.stdin.write(text);
    child.stdin.end();
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16_384) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function redirect(res: http.ServerResponse): void {
  res.writeHead(303, { Location: "/" });
  res.end();
}

function openBrowser(url: string): void {
  const child = spawn("cmd.exe", ["/d", "/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function openTray(url: string): ChildProcess {
  return spawn(
    "powershell.exe",
    [
      "-STA",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(__dirname, "..", "scripts", "tray.ps1"),
      url,
    ],
    { stdio: "ignore", windowsHide: true },
  );
}

async function main(): Promise<void> {
  const app = new ClassroomApp({
    router: { redeemNickname, fetchSessionModels },
    catalog: { fetchCourseCatalog },
    projectFiles: { readClassroomInstalls },
    clipboard: { write: writeClipboard },
    commands: { run: runCommand },
    environment: {
      probe: probeEnvironment,
      install: installEnvironment,
    },
    files: {
      async write() {
        throw new Error("Classroom App 不寫 MCP 設定");
      },
    },
    storage: createFileStorage(storageFile()),
    stopProcess() {
      // 關視窗不呼叫這裡。之後的停止票才會停代理。
    },
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = req.url ?? "/";
      if (req.method === "GET" && (url === "/" || url === "/index.html")) {
        const html = renderPage(app.view());
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(html);
        return;
      }
      if (req.method === "POST" && url === "/redeem") {
        const params = new URLSearchParams(await readBody(req));
        await app.redeem(
          params.get("invite_code") ?? "",
          params.get("nickname") ?? "",
        );
        redirect(res);
        return;
      }
      if (req.method === "POST" && url === "/project-folder") {
        const params = new URLSearchParams(await readBody(req));
        await app.setProjectFolder(params.get("project_folder") ?? "");
        redirect(res);
        return;
      }
      if (req.method === "POST" && url === "/prepare") {
        const params = new URLSearchParams(await readBody(req));
        app.prepare(params.get("action_id") ?? "");
        redirect(res);
        return;
      }
      if (req.method === "POST" && url === "/confirm") {
        await app.confirm();
        redirect(res);
        return;
      }
      if (req.method === "POST" && url === "/cancel") {
        app.cancel();
        redirect(res);
        return;
      }
      if (req.method === "POST" && url === "/environment-check") {
        await app.checkEnvironment();
        redirect(res);
        return;
      }
      if (req.method === "POST" && url === "/environment") {
        const params = new URLSearchParams(await readBody(req));
        const tools = params
          .getAll("tool")
          .filter((value): value is EnvironmentToolId => isEnvironmentTool(value));
        app.selectEnvironment(tools);
        await app.confirmEnvironment();
        redirect(res);
        return;
      }
      if (req.method === "POST" && url === "/copy") {
        await app.copyKey();
        redirect(res);
        return;
      }
      if (req.method === "POST" && url === "/clear") {
        await app.clearConnection();
        redirect(res);
        return;
      }
      if (req.method === "POST" && url === "/switch") {
        const params = new URLSearchParams(await readBody(req));
        const mode = params.get("mode");
        if (mode === "classroom" || mode === "native") {
          await app.setSwitch(mode);
        }
        redirect(res);
        return;
      }
      if (req.method === "POST" && url === "/reload") {
        await app.reloadAllowlist();
        redirect(res);
        return;
      }
      if (req.method === "POST" && url === "/close") {
        app.closeWindow();
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("找不到頁面");
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Classroom App 暫時無法完成這個動作。");
    }
  });

  server.on("error", () => {
    process.stderr.write(`無法在 127.0.0.1:${port} 開啟 Classroom App。\n`);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    const tray = openTray(pageUrl);
    openBrowser(pageUrl);
    const shutdown = () => {
      tray.kill();
      server.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    process.stdout.write(`Classroom App: ${pageUrl}\n`);
  });
}

void main();
