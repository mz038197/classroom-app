import { AsyncLocalStorage } from "node:async_hooks";
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import {
  ClassroomApp,
  ENVIRONMENT_TOOLS,
  type EnvironmentToolId,
  type NicknameRedeemResult,
  type ProxyClient,
  type UpstreamSend,
  type UpstreamTarget,
} from "./classroomApp";
import { renderPage } from "./page";
import { createRouteFiles } from "./routeFiles";

const port = 47821;
const pageUrl = `http://127.0.0.1:${port}/`;
const nodeRequire = createRequire(__filename);
const responseSlot = new AsyncLocalStorage<{ status: number; body: string }>();

function routerBaseUrl(): string {
  return (
    process.env.CLASSROOM_ROUTER_BASE_URL ?? "https://ai.vanscoding.com"
  ).replace(/\/+$/, "");
}

function routePaths() {
  const appData =
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return {
    codex: path.join(os.homedir(), ".codex", "config.toml"),
    claude: path.join(os.homedir(), ".claude", "settings.json"),
    vsCode: path.join(appData, "Code", "User", "settings.json"),
  };
}

function storageFile(): string {
  const root = process.env.LOCALAPPDATA || os.homedir();
  return path.join(root, "classroom-app", "connection.json");
}

function copilotModelsFile(): string {
  const roaming = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(roaming, "Code", "User", "chatLanguageModels.json");
}

function isProviderRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readCopilotProviders(): Promise<{
  providers: Array<Record<string, unknown>>;
}> {
  let raw: string;
  try {
    raw = await fs.readFile(copilotModelsFile(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { providers: [] };
    }
    throw err;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { providers: [] };
  }
  const parsed: unknown = JSON.parse(trimmed);
  if (Array.isArray(parsed)) {
    return { providers: parsed.filter(isProviderRecord) };
  }
  if (isProviderRecord(parsed) && Array.isArray(parsed.providers)) {
    return { providers: parsed.providers.filter(isProviderRecord) };
  }
  throw new Error("Copilot 設定格式無法辨識");
}

async function writeCopilotProviders(doc: {
  providers: Array<Record<string, unknown>>;
}): Promise<void> {
  const target = copilotModelsFile();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(
    target,
    `${JSON.stringify(doc.providers, null, 2)}\n`,
    "utf8",
  );
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
  const root = routerBaseUrl();
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
  const root = routerBaseUrl();
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
  const root = routerBaseUrl();
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

function isEnvironmentTool(value: string): value is EnvironmentToolId {
  return (ENVIRONMENT_TOOLS as readonly string[]).includes(value);
}

const MAC_PWSH_PAGE =
  "https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-macos";

function collectOutput(
  command: string,
  args: string[],
  cwd?: string,
): Promise<{ exitCode: number | undefined; output: string; spawnError: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: {
      exitCode: number | undefined;
      output: string;
      spawnError: boolean;
    }) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };
    const child = spawn(command, args, {
      cwd,
      windowsHide: process.platform === "win32",
    });
    const chunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => {
      finish({
        exitCode: 1,
        output: Buffer.concat(chunks).toString("utf8"),
        spawnError: true,
      });
    });
    child.on("close", (code) => {
      finish({
        exitCode: code === null ? undefined : code,
        output: Buffer.concat(chunks).toString("utf8"),
        spawnError: false,
      });
    });
  });
}

function shellLaunch(command: string): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", command] };
  }
  return { command: "sh", args: ["-c", command] };
}

function probeEnvironment(
  tool: EnvironmentToolId,
): Promise<{ installed: boolean }> {
  return collectOutput(tool, ["--version"]).then((result) => {
    if (result.spawnError) {
      return { installed: false };
    }
    return { installed: result.exitCode === 0 || /\d/.test(result.output) };
  });
}

function installEnvironment(
  tool: EnvironmentToolId,
  cwd: string,
): Promise<{ exitCode: number | undefined; output: string }> {
  const launch =
    process.platform === "darwin" && tool === "pwsh"
      ? { command: "open", args: [MAC_PWSH_PAGE] }
      : shellLaunch(environmentInstallCommand(tool));
  return collectOutput(launch.command, launch.args, cwd).then((result) => {
    if (result.spawnError) {
      return { exitCode: 1, output: "安裝命令無法啟動。" };
    }
    return { exitCode: result.exitCode, output: result.output };
  });
}

function environmentInstallCommand(tool: EnvironmentToolId): string {
  if (process.platform === "darwin") {
    if (tool === "uv") {
      return "curl -LsSf https://astral.sh/uv/install.sh | sh";
    }
    if (tool === "git") {
      return "xcode-select --install";
    }
    if (tool === "node") {
      return 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash && . "$HOME/.nvm/nvm.sh" && nvm install --lts && nvm alias default \'lts/*\'';
    }
    return "";
  }
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
  const launch = shellLaunch(command);
  return collectOutput(launch.command, launch.args, cwd).then((result) => {
    if (result.spawnError) {
      throw new Error("command failed");
    }
    return result.output;
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

function readBody(req: http.IncomingMessage, max = 16_384): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
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
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/d", "/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  }
}

type SeaApi = {
  isSea: () => boolean;
  getAsset: (key: string, encoding: string) => string;
};

function trayScriptPath(): string {
  try {
    const sea = nodeRequire("node:sea") as SeaApi;
    if (sea.isSea()) {
      const target = path.join(os.tmpdir(), "classroom-app-tray.ps1");
      writeFileSync(target, sea.getAsset("tray.ps1", "utf8"));
      return target;
    }
  } catch {
    // 開發時 node:sea 不在，改讀旁邊的腳本。
  }
  return path.join(__dirname, "..", "scripts", "tray.ps1");
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
      trayScriptPath(),
      url,
    ],
    { stdio: "ignore", windowsHide: true },
  );
}

let proxyAccepting = false;

function createProxy() {
  return {
    start() {
      proxyAccepting = true;
    },
    stop() {
      proxyAccepting = false;
    },
    async receive(request: { provider: "VCRouter" }) {
      if (!proxyAccepting) {
        throw new Error("代理已停止。");
      }
      if (request.provider !== "VCRouter") {
        throw new Error("只有 VCRouter 會進入代理。");
      }
    },
  };
}

function clientOf(req: http.IncomingMessage, pathname: string): ProxyClient {
  if (pathname.endsWith("/messages") || req.headers["anthropic-version"]) {
    return "claude";
  }
  const agent = String(req.headers["user-agent"] ?? "");
  if (/copilot/i.test(agent)) {
    return "copilot";
  }
  return "codex";
}

function modelFromBody(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const model = (parsed as { model?: unknown }).model;
      if (typeof model === "string") {
        return model;
      }
    }
  } catch {
    return "";
  }
  return "";
}

function rewriteModel(body: string, model: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return JSON.stringify({ ...(parsed as Record<string, unknown>), model });
    }
  } catch {
    return body;
  }
  return body;
}

function upstreamOrigin(target: UpstreamTarget): string {
  if (target === "router") {
    return routerBaseUrl();
  }
  if (target === "chatgpt") {
    return "https://chatgpt.com";
  }
  return "https://claude.ai";
}

async function sendUpstream(upstream: UpstreamSend): Promise<void> {
  if (!proxyAccepting || !upstream.path) {
    return;
  }
  const slot = responseSlot.getStore();
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (upstream.target === "router" && upstream.apiKey) {
      headers.Authorization = `Bearer ${upstream.apiKey}`;
    }
    const body =
      upstream.target === "router"
        ? rewriteModel(upstream.body ?? "", upstream.model)
        : upstream.body;
    const response = await fetch(`${upstreamOrigin(upstream.target)}${upstream.path}`, {
      method: upstream.method ?? "POST",
      headers,
      body,
    });
    const text = await response.text();
    if (slot) {
      slot.status = response.status;
      slot.body = text;
    }
  } catch {
    if (slot) {
      slot.status = 502;
      slot.body = "上游沒有回應。";
    }
  }
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
      // 關視窗不呼叫這裡。停止是頁面上的單獨動作。
    },
    proxyBaseUrl: pageUrl.replace(/\/$/, ""),
    routes: createRouteFiles(routePaths()),
    copilot: {
      read: readCopilotProviders,
      write: writeCopilotProviders,
    },
    proxy: createProxy(),
    send: sendUpstream,
  });
  await app.start();

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
        await app.reloadCatalog();
        await app.reloadAllowlist();
        redirect(res);
        return;
      }
      const pathname = url.split("?")[0] ?? "/";
      if (
        (req.method === "POST" || req.method === "PUT") &&
        (pathname.startsWith("/v1/") || pathname.startsWith("/backend-api/"))
      ) {
        const body = await readBody(req, 1_048_576);
        const slot = { status: 502, body: "上游沒有回應。" };
        await responseSlot.run(slot, () =>
          app.forward({
            client: clientOf(req, pathname),
            model: modelFromBody(body),
            method: req.method,
            path: pathname,
            body,
          }),
        );
        res.writeHead(slot.status, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(slot.body);
        return;
      }
      if (req.method === "POST" && url === "/stop") {
        await app.stop();
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
    void app.start().catch(() => {
      process.stderr.write("無法寫入 VCRouter。\n");
    });
    const tray = process.platform === "win32" ? openTray(pageUrl) : undefined;
    openBrowser(pageUrl);
    const shutdown = () => {
      tray?.kill();
      server.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    process.stdout.write(`Classroom App: ${pageUrl}\n`);
  });
}

void main();
