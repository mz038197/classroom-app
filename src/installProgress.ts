export const installProgressScript = `
  var installBusy = false;
  document.addEventListener("click", function (event) {
    if (event.target && event.target.closest && event.target.closest("[data-install-dismiss]")) {
      window.location.reload();
    }
  });
  document.addEventListener("submit", async function (event) {
    var form = event.target;
    if (!form || !form.matches || !form.matches('form[action="/confirm"]')) return;
    event.preventDefault();
    if (installBusy) return;
    installBusy = true;
    var panel = form.closest(".confirm-panel");
    var title = panel.querySelector("h2");
    var status = panel.querySelector("[data-install-status]");
    var output = panel.querySelector("[data-install-output]");
    var dismiss = panel.querySelector("[data-install-dismiss]");
    var choices = panel.querySelector(".choices");
    var buttons = panel.querySelectorAll("button");
    buttons.forEach(function (button) { button.disabled = true; });
    panel.setAttribute("aria-busy", "true");
    title.textContent = "安裝中";
    status.textContent = "正在執行，請稍候…";
    output.hidden = false;
    var finished = false;
    var timer;
    async function update() {
      try {
        var response = await fetch("/command-status", { cache: "no-store" });
        if (!response.ok) throw new Error("status unavailable");
        var progress = await response.json();
        if (finished) return;
        var atBottom = output.scrollTop + output.clientHeight >= output.scrollHeight - 24;
        output.textContent = progress.output || "等待安裝程式輸出…";
        if (atBottom) output.scrollTop = output.scrollHeight;
        status.textContent = "正在執行，請稍候…";
      } catch (error) {
        if (!finished) status.textContent = "暫時無法更新進度，正在重新連線…";
      }
      if (!finished) timer = setTimeout(update, 500);
    }
    try {
      var request = fetch(form.action, {
        method: "POST",
        headers: { "X-Classroom-Progress": "1" },
        body: new URLSearchParams(new FormData(form)),
      });
      update();
      var result = await request;
      if (!result.ok) throw new Error("confirmation failed");
      var outcome = await result.json();
      finished = true;
      clearTimeout(timer);
      panel.setAttribute("aria-busy", "false");
      title.textContent = outcome.succeeded ? "安裝成功" : "安裝失敗";
      status.textContent = "請查看執行結果，按下確認後關閉。";
      output.textContent = outcome.output || (outcome.succeeded ? "安裝完成。" : "指令執行失敗。");
      choices.hidden = true;
      dismiss.disabled = false;
      dismiss.hidden = false;
    } catch (error) {
      finished = true;
      clearTimeout(timer);
      panel.setAttribute("aria-busy", "false");
      title.textContent = "無法確認安裝結果";
      status.textContent = "請重新整理頁面查看結果，避免重複安裝。";
      choices.hidden = true;
      dismiss.disabled = false;
      dismiss.hidden = false;
    }
  });
`;
