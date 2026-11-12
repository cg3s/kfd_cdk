const API_BASE = "https://kafuda.com/api/public/cdk";
const POLL_INTERVAL_MS = 3000;
const MAX_AUTOMATIC_POLLS = 100;

const codeForm = document.querySelector("#code-form");
const sessionForm = document.querySelector("#session-form");
const codeInput = document.querySelector("#code");
const sessionInput = document.querySelector("#session");
const codeCheckButton = document.querySelector("#code-check-button");
const sessionCheckButton = document.querySelector("#session-check-button");
const changeCodeButton = document.querySelector("#change-code-button");
const redeemButton = document.querySelector("#redeem-button");
const backButton = document.querySelector("#back-button");
const restartButton = document.querySelector("#restart-button");
const statusButton = document.querySelector("#status-button");
const toggleSessionButton = document.querySelector("#toggle-session");
const confirmationPanel = document.querySelector("#confirmation-panel");
const progressPanel = document.querySelector("#progress-panel");
const errorBox = document.querySelector("#form-error");

const state = {
  code: "",
  preview: undefined,
  redemptionToken: "",
  plan: "",
  accountEmail: "",
  checking: false,
  polling: false,
  pollCount: 0,
  pollTimer: undefined,
};

const planLabels = {
  free: "免费",
  go: "Go",
  plus: "Plus",
  plus_half: "Plus 半价",
  pro_5x: "Pro 5x",
  pro_20x: "Pro 20x",
  pro_50x: "Pro 50x",
  credit250: "Codex 250",
  credit1000: "Codex 1,000",
  credit2000: "Codex 2,000",
};

const planName = (plan) => planLabels[plan] ?? plan ?? "—";

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.textContent = "";
  errorBox.hidden = true;
}

function removeProviderBrand(value) {
  return String(value).replace(/kafuda|卡付达/gi, "兑换服务");
}

async function request(path, body) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new Error("无法连接兑换服务，请检查网络后重试。");
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("服务暂时无法处理请求，请稍后重试。");
  }

  if (!response.ok) {
    throw new Error(
      removeProviderBrand(
        result?.error?.message ||
          `请求失败（HTTP ${response.status}），请稍后重试。`
      )
    );
  }

  if (!result?.data) {
    throw new Error("服务返回的数据不完整，请稍后重试。");
  }

  return result.data;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  const text = button.querySelector("span");
  if (busy) {
    button.dataset.labelBeforeBusy = text.textContent;
    text.textContent = label;
    return;
  }
  text.textContent = button.dataset.labelBeforeBusy || text.textContent;
  delete button.dataset.labelBeforeBusy;
}

function normalizeCode(value) {
  return value.trim().replace(/[\s-]/g, "").toUpperCase();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function setStep(step) {
  const formTitle = document.querySelector("#form-title");
  const stepKicker = document.querySelector("#step-kicker");
  codeForm.hidden = step !== "code";
  sessionForm.hidden = step !== "session";
  confirmationPanel.hidden = step !== "confirm";
  progressPanel.hidden = step !== "progress";
  if (step === "code") {
    formTitle.textContent = "验证兑换卡密";
    stepKicker.textContent = "STEP 01 / 03";
    codeCheckButton.querySelector("span").textContent = "验证卡密";
  } else if (step === "session") {
    formTitle.textContent = "填写账号信息";
    stepKicker.textContent = "STEP 02 / 03";
    sessionCheckButton.querySelector("span").textContent = "检查账号";
  } else if (step === "confirm") {
    formTitle.textContent = "确认兑换信息";
    stepKicker.textContent = "STEP 03 / 03";
  } else if (step === "progress") {
    formTitle.textContent = "兑换进度";
    stepKicker.textContent = "REDEMPTION STATUS";
  }
}

function populateVerifiedCode(preview) {
  document.querySelector("#verified-plan").textContent = planName(preview.plan);
  const expiry = preview.expires_at
    ? ` · 有效期至 ${formatDate(preview.expires_at)}`
    : "";
  document.querySelector("#verified-expiry").textContent = expiry;
}

function populateConfirmation(preview, checked) {
  const name = planName(checked.plan || preview.plan);
  document.querySelector("#account-email").textContent =
    checked.account_email || "已验证账号";
  document.querySelector("#account-plan").textContent = name;
  document.querySelector("#plan-name").textContent = name;
  document.querySelector("#current-plan").textContent =
    planName(checked.current_plan || "free");
  document.querySelector("#redemption-kind").textContent =
    checked.kind === "upgrade" ? "升级" : "新开";
  document.querySelector("#code-expiry").textContent = formatDate(
    preview.expires_at
  );
}

function setProgress(status, data = {}) {
  const statusText = removeProviderBrand(
    data.status_text || statusTextFor(status)
  );
  const progressTitle = document.querySelector("#progress-title");
  const progressMessage = document.querySelector("#progress-message");

  progressPanel.classList.remove("is-success", "is-failure");
  progressTitle.textContent = statusText;
  progressMessage.textContent = removeProviderBrand(
    messageForStatus(status, data)
  );
  document.querySelector("#progress-plan").textContent = planName(
    data.plan || state.plan
  );
  document.querySelector("#progress-account").textContent =
    data.account_email || state.accountEmail || "已验证账号";
  document.querySelector("#progress-meta").hidden = false;
  statusButton.hidden = true;
  restartButton.hidden = true;

  if (status === "completed") {
    progressPanel.classList.add("is-success");
    document.querySelector("#progress-kicker").textContent = "COMPLETED";
    statusButton.hidden = true;
    restartButton.hidden = false;
    stopPolling();
    return;
  }

  if (status === "failed" || status === "cancelled") {
    progressPanel.classList.add("is-failure");
    document.querySelector("#progress-kicker").textContent = "NOT COMPLETED";
    statusButton.hidden = true;
    restartButton.hidden = false;
    stopPolling();
    return;
  }

  document.querySelector("#progress-kicker").textContent =
    status === "needs_review" ? "MANUAL REVIEW" : "IN PROGRESS";
}

function statusTextFor(status) {
  const labels = {
    submitting: "正在提交兑换",
    processing: "正在开通套餐",
    needs_review: "兑换结果核对中",
    completed: "套餐开通成功",
    failed: "暂未开通成功",
    cancelled: "兑换已取消",
  };
  return labels[status] || "正在查询兑换进度";
}

function messageForStatus(status, data) {
  if (status === "completed") {
    return "兑换成功。请刷新 ChatGPT 页面查看套餐状态。";
  }
  if (status === "failed" || status === "cancelled") {
    return (
      data.error_message || "卡密已恢复可用。请检查账号后重新兑换。"
    );
  }
  if (status === "needs_review") {
    return "订单正在核对中，卡密暂时保持占用。请稍后查询，不要重复提交。";
  }
  return "兑换通常需要 1–3 分钟，请稍候，不要重复提交。";
}

function stopPolling() {
  state.polling = false;
  window.clearTimeout(state.pollTimer);
  state.pollTimer = undefined;
}

function schedulePoll() {
  if (!state.polling) return;
  if (state.pollCount >= MAX_AUTOMATIC_POLLS) {
    stopPolling();
    document.querySelector("#progress-message").textContent =
      "兑换仍在处理中。你可以手动查询最新进度，请勿重复提交。";
    statusButton.hidden = false;
    return;
  }
  state.pollTimer = window.setTimeout(pollStatus, POLL_INTERVAL_MS);
}

async function pollStatus() {
  if (!state.redemptionToken) return;
  state.pollCount += 1;

  try {
    const progress = await request(
      `/status?token=${encodeURIComponent(state.redemptionToken)}`
    );
    setProgress(progress.status, progress);

    if (!["completed", "failed", "cancelled"].includes(progress.status)) {
      schedulePoll();
    }
  } catch (error) {
    document.querySelector("#progress-message").textContent =
      `${error.message} 正在稍后重试查询。`;
    schedulePoll();
  }
}

async function startRedemption() {
  if (state.checking || !state.redemptionToken) return;
  clearError();
  state.checking = true;
  setBusy(redeemButton, true, "正在提交");

  try {
    const progress = await request("/redeem", {
      code: state.code,
      redemption_token: state.redemptionToken,
    });
    setStep("progress");
    setProgress(progress.status, progress);
    if (!["completed", "failed", "cancelled"].includes(progress.status)) {
      state.polling = true;
      state.pollCount = 0;
      schedulePoll();
    }
  } catch (error) {
    showError(error.message);
  } finally {
    state.checking = false;
    setBusy(redeemButton, false);
  }
}

codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  if (state.checking) return;

  const code = normalizeCode(codeInput.value);
  if (!code) {
    showError("请输入兑换卡密。");
    codeInput.focus();
    return;
  }

  state.checking = true;
  setBusy(codeCheckButton, true, "正在验证卡密");
  try {
    const preview = await request("/preview", { code });
    if (preview.status !== "unused") {
      throw new Error(
        removeProviderBrand(
          preview.status_text || "此卡密当前不可兑换，请检查卡密状态。"
        )
      );
    }

    state.code = code;
    state.preview = preview;
    codeInput.value = code;
    populateVerifiedCode(preview);
    setStep("session");
    sessionInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    state.checking = false;
    setBusy(codeCheckButton, false);
  }
});

sessionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const session = sessionInput.value.trim();
  if (!session) {
    showError("请输入 ChatGPT Session。");
    sessionInput.focus();
    return;
  }
  if (state.checking || !state.code || !state.preview) return;

  state.checking = true;
  setBusy(sessionCheckButton, true, "正在检查账号");
  try {
    const checked = await request("/check", {
      code: state.code,
      session,
    });
    if (!checked.redemption_token) {
      throw new Error("账号检查未返回兑换令牌，请重新检查。");
    }

    state.redemptionToken = checked.redemption_token;
    state.plan = checked.plan || state.preview.plan || "";
    state.accountEmail = checked.account_email || "";
    populateConfirmation(state.preview, checked);
    setStep("confirm");
  } catch (error) {
    showError(error.message);
  } finally {
    sessionInput.value = "";
    sessionInput.classList.remove("is-visible");
    toggleSessionButton.setAttribute("aria-label", "显示 Session");
    toggleSessionButton.setAttribute("aria-pressed", "false");
    state.checking = false;
    setBusy(sessionCheckButton, false);
  }
});

redeemButton.addEventListener("click", startRedemption);

backButton.addEventListener("click", () => {
  clearError();
  state.redemptionToken = "";
  state.accountEmail = "";
  state.plan = "";
  setStep("session");
  sessionInput.focus();
});

changeCodeButton.addEventListener("click", () => {
  clearError();
  state.code = "";
  state.preview = undefined;
  state.redemptionToken = "";
  state.accountEmail = "";
  state.plan = "";
  sessionInput.value = "";
  codeInput.value = "";
  sessionForm.reset();
  setStep("code");
  codeInput.focus();
});

toggleSessionButton.addEventListener("click", () => {
  const isVisible = toggleSessionButton.getAttribute("aria-pressed") === "true";
  toggleSessionButton.setAttribute("aria-pressed", String(!isVisible));
  toggleSessionButton.setAttribute(
    "aria-label",
    isVisible ? "显示 Session" : "隐藏 Session"
  );
  sessionInput.classList.toggle("is-visible", !isVisible);
});

statusButton.addEventListener("click", async () => {
  if (!state.redemptionToken) return;
  statusButton.disabled = true;
  try {
    const progress = await request(
      `/status?token=${encodeURIComponent(state.redemptionToken)}`
    );
    setProgress(progress.status, progress);
    if (!["completed", "failed", "cancelled"].includes(progress.status)) {
      state.polling = true;
      state.pollCount = 0;
      schedulePoll();
    }
  } catch (error) {
    document.querySelector("#progress-message").textContent = error.message;
    statusButton.hidden = false;
  } finally {
    statusButton.disabled = false;
  }
});

restartButton.addEventListener("click", () => {
  stopPolling();
  state.code = "";
  state.preview = undefined;
  state.redemptionToken = "";
  state.plan = "";
  state.accountEmail = "";
  codeForm.reset();
  sessionForm.reset();
  clearError();
  setStep("code");
});

document.querySelector("#year").textContent = new Date().getFullYear();
setStep("code");
