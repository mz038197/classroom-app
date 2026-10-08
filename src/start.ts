import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { ClassroomApp, type NicknameRedeemResult } from "./classroomApp";
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
    router: { redeemNickname },
    catalog: { fetchCourseCatalog },
    projectFiles: { readClassroomInstalls },
    clipboard: { write: writeClipboard },
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
