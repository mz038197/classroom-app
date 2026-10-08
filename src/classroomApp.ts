import { parseCourseCatalog } from "./courseCatalog";

export type NicknameRedeemResult = {
  api_key: string;
  session: {
    class_name?: string;
    name?: string;
    invite_code?: string;
    expires_at?: string;
  };
};

export type ModelSwitchMode = "native" | "classroom";

export type ClassroomAppDeps = {
  router: {
    redeemNickname(body: {
      invite_code: string;
      nickname: string;
    }): Promise<NicknameRedeemResult>;
    fetchSessionModels(apiKey: string): Promise<string[]>;
  };
  catalog: {
    fetchCourseCatalog(
      apiKey: string,
    ): Promise<{ course_catalog_yaml?: unknown }>;
  };
  projectFiles: {
    readClassroomInstalls(folder: string): Promise<string | undefined>;
  };
  clipboard: {
    write(text: string): Promise<void>;
  };
  commands: {
    run(cwd: string, command: string): Promise<string>;
  };
  // 測試注入的寫檔口。核心不呼叫它，MCP 動作只跑 catalog command。
  files: {
    write(path: string, contents: string): Promise<void>;
  };
  storage: {
    getApiKey(): Promise<string | undefined>;
    setApiKey(apiKey: string): Promise<void>;
    clearApiKey(): Promise<void>;
  };
  stopProcess(): void;
};

export type CourseActionView = {
  id: string;
  title: string;
  kind: "skill" | "package" | "mcp";
  command: string;
  description?: string;
};

export type CourseSnippetView = {
  id: string;
  title: string;
  body: string;
  pasteHint?: string;
};

export type CourseCatalogView = {
  source: "remote" | "local";
  actions: CourseActionView[];
  snippets?: CourseSnippetView[];
  localNote?: string;
};

export type ClassroomAppView = {
  connected: boolean;
  classLabel?: string;
  detail: string;
  canCopyKey: boolean;
  notice?: string;
  projectFolder?: string;
  installAvailable: boolean;
  installNotice?: string;
  catalog?: CourseCatalogView;
  catalogError?: string;
  pendingCommand?: string;
  commandOutput?: string;
  commandRunning: boolean;
  mode: ModelSwitchMode;
  modelId?: string;
};

const LOCAL_LIST_NOTE = "這是本機清單。";
const INSTALL_UNAVAILABLE = "尚未指定專案資料夾，安裝不可用。";

export class ClassroomApp {
  private connected = false;
  private classLabel: string | undefined;
  private detail = "";
  private notice: string | undefined;
  private projectFolder: string | undefined;
  private catalog: CourseCatalogView | undefined;
  private catalogError: string | undefined;
  private remoteCatalogHeld = false;
  private pendingCommand: string | undefined;
  private commandOutput: string | undefined;
  private commandRunning = false;
  private mode: ModelSwitchMode = "native";
  private modelIds: string[] = [];

  constructor(private readonly deps: ClassroomAppDeps) {}

  view(): ClassroomAppView {
    const view: ClassroomAppView = {
      connected: this.connected,
      detail: this.detail,
      canCopyKey: this.connected,
      installAvailable: Boolean(this.projectFolder),
      commandRunning: this.commandRunning,
      mode: this.mode,
    };
    if (this.classLabel) {
      view.classLabel = this.classLabel;
    }
    if (this.notice) {
      view.notice = this.notice;
    }
    if (this.projectFolder) {
      view.projectFolder = this.projectFolder;
    } else {
      view.installNotice = INSTALL_UNAVAILABLE;
    }
    if (this.catalog) {
      view.catalog = this.catalog;
    }
    if (this.catalogError) {
      view.catalogError = this.catalogError;
    }
    if (this.pendingCommand) {
      view.pendingCommand = this.pendingCommand;
    }
    if (this.commandOutput !== undefined) {
      view.commandOutput = this.commandOutput;
    }
    if (this.mode === "classroom" && this.modelIds[0]) {
      view.modelId = this.modelIds[0];
    }
    return view;
  }

  prepare(actionId: string): void {
    if (this.commandRunning || !this.projectFolder) {
      return;
    }
    const action = this.catalog?.actions.find((item) => item.id === actionId);
    if (!action) {
      return;
    }
    this.pendingCommand = action.command;
    this.commandOutput = undefined;
  }

  async confirm(): Promise<void> {
    if (this.commandRunning || !this.projectFolder || !this.pendingCommand) {
      return;
    }
    const cwd = this.projectFolder;
    const command = this.pendingCommand;
    this.commandRunning = true;
    this.commandOutput = undefined;
    try {
      this.commandOutput = await this.deps.commands.run(cwd, command);
    } catch {
      this.commandOutput = "指令執行失敗。";
    } finally {
      this.commandRunning = false;
    }
  }

  cancel(): void {
    if (this.commandRunning) {
      return;
    }
    this.pendingCommand = undefined;
  }

  async redeem(inviteCode: string, nickname: string): Promise<void> {
    const invite = inviteCode.trim();
    const name = nickname.trim();
    if (!invite || !name) {
      this.detail = "請先輸入邀請碼與課堂暱稱，再按「連線」。";
      this.notice = undefined;
      return;
    }
    let redeemed: NicknameRedeemResult;
    try {
      redeemed = await this.deps.router.redeemNickname({
        invite_code: invite,
        nickname: name,
      });
    } catch {
      if (!this.connected) {
        this.detail = "兌換失敗。請檢查邀請碼與課堂暱稱。";
        this.notice = undefined;
      }
      return;
    }
    await this.deps.storage.setApiKey(redeemed.api_key);
    const label = [redeemed.session.class_name, redeemed.session.name]
      .filter(Boolean)
      .join(" · ");
    this.classLabel = label || undefined;
    this.connected = true;
    this.detail = "Classroom API Key 已設定。";
    this.notice = undefined;
    await this.loadCatalog();
    await this.loadModels(redeemed.api_key);
  }

  async setProjectFolder(folder: string): Promise<void> {
    if (this.commandRunning) {
      return;
    }
    const next = folder.trim();
    this.projectFolder = next || undefined;
    if (!this.remoteCatalogHeld) {
      await this.loadCatalog();
    }
  }

  async setSwitch(mode: ModelSwitchMode): Promise<void> {
    if (mode === "native") {
      this.mode = "native";
      return;
    }
    const apiKey = await this.deps.storage.getApiKey();
    if (!apiKey || this.modelIds.length === 0) {
      this.mode = "native";
      return;
    }
    this.mode = "classroom";
  }

  async reloadAllowlist(): Promise<void> {
    const apiKey = await this.deps.storage.getApiKey();
    if (!apiKey) {
      return;
    }
    await this.loadModels(apiKey);
  }

  private async loadModels(apiKey: string): Promise<void> {
    let ids: string[];
    try {
      ids = await this.deps.router.fetchSessionModels(apiKey);
    } catch {
      return;
    }
    if (ids.length === 0) {
      this.modelIds = [];
      this.mode = "native";
      return;
    }
    this.modelIds = ids;
  }

  async copyKey(): Promise<void> {
    const apiKey = await this.deps.storage.getApiKey();
    if (!apiKey) {
      this.notice = "無法複製 Classroom API Key。請重新連線後再試。";
      return;
    }
    try {
      await this.deps.clipboard.write(apiKey);
    } catch {
      this.notice = "無法複製 Classroom API Key。請重新連線後再試。";
      return;
    }
    this.notice = "已複製 Classroom API Key。請勿分享給不信任的人。";
  }

  async clearConnection(): Promise<void> {
    await this.deps.storage.clearApiKey();
    this.connected = false;
    this.classLabel = undefined;
    this.detail = "";
    this.notice = undefined;
    this.catalog = undefined;
    this.catalogError = undefined;
    this.remoteCatalogHeld = false;
    this.mode = "native";
    this.modelIds = [];
  }

  closeWindow(): void {
    // 關分頁不停止本機行程。停止留給之後的票。
  }

  private async loadCatalog(): Promise<void> {
    if (!this.connected) {
      return;
    }
    const apiKey = await this.deps.storage.getApiKey();
    if (!apiKey) {
      this.catalog = undefined;
      this.catalogError = undefined;
      this.remoteCatalogHeld = false;
      return;
    }
    let body: { course_catalog_yaml?: unknown };
    try {
      body = await this.deps.catalog.fetchCourseCatalog(apiKey);
    } catch {
      await this.loadLocalCatalog();
      return;
    }
    if (typeof body?.course_catalog_yaml !== "string") {
      await this.loadLocalCatalog();
      return;
    }
    const parsed = parseCourseCatalog(body.course_catalog_yaml);
    if (!parsed.ok) {
      this.catalog = undefined;
      this.catalogError = parsed.error;
      this.remoteCatalogHeld = false;
      return;
    }
    this.catalog = catalogView(parsed.actions, parsed.snippets, "remote");
    this.catalogError = undefined;
    this.remoteCatalogHeld = true;
  }

  private async loadLocalCatalog(): Promise<void> {
    this.remoteCatalogHeld = false;
    if (!this.projectFolder) {
      this.catalog = undefined;
      this.catalogError = "遠端清單不可用。";
      return;
    }
    let text: string | undefined;
    try {
      text = await this.deps.projectFiles.readClassroomInstalls(this.projectFolder);
    } catch {
      text = undefined;
    }
    if (text === undefined) {
      this.catalog = undefined;
      this.catalogError = "找不到 classroom-installs.yaml";
      return;
    }
    const parsed = parseCourseCatalog(text);
    if (!parsed.ok) {
      this.catalog = undefined;
      this.catalogError = parsed.error;
      return;
    }
    this.catalog = catalogView(parsed.actions, parsed.snippets, "local");
    this.catalogError = undefined;
  }
}

function catalogView(
  actions: CourseCatalogView["actions"],
  snippets: NonNullable<CourseCatalogView["snippets"]>,
  source: "remote" | "local",
): CourseCatalogView {
  const view: CourseCatalogView = { source, actions };
  if (snippets.length > 0) {
    view.snippets = snippets;
  }
  if (source === "local") {
    view.localNote = LOCAL_LIST_NOTE;
  }
  return view;
}
