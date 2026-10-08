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
  clipboard: {
    write(text: string): Promise<void>;
  };
  storage: {
    getApiKey(): Promise<string | undefined>;
    setApiKey(apiKey: string): Promise<void>;
    clearApiKey(): Promise<void>;
  };
  stopProcess(): void;
};

export type ClassroomAppView = {
  connected: boolean;
  classLabel?: string;
  detail: string;
  canCopyKey: boolean;
  notice?: string;
  mode: ModelSwitchMode;
  modelId?: string;
};

export class ClassroomApp {
  private connected = false;
  private classLabel: string | undefined;
  private detail = "";
  private notice: string | undefined;
  private mode: ModelSwitchMode = "native";
  private modelIds: string[] = [];

  constructor(private readonly deps: ClassroomAppDeps) {}

  view(): ClassroomAppView {
    const view: ClassroomAppView = {
      connected: this.connected,
      detail: this.detail,
      canCopyKey: this.connected,
      mode: this.mode,
    };
    if (this.classLabel) {
      view.classLabel = this.classLabel;
    }
    if (this.notice) {
      view.notice = this.notice;
    }
    if (this.mode === "classroom" && this.modelIds[0]) {
      view.modelId = this.modelIds[0];
    }
    return view;
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
    await this.loadModels(redeemed.api_key);
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
    this.mode = "native";
    this.modelIds = [];
  }

  closeWindow(): void {
    // 關分頁不停止本機行程。停止留給之後的票。
  }
}
