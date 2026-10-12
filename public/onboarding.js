const state = {
  csrf: null,
  onboarding: null,
  platforms: [],
};

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.csrf && options.method && options.method !== "GET") {
    headers["x-csrf-token"] = state.csrf;
  }
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error((data && data.error) || res.statusText);
  }
  return data;
}

function showError(message) {
  const el = document.getElementById("wizard-error");
  if (el) el.textContent = message || "";
}

function renderSelect() {
  const selected = new Set((state.onboarding && state.onboarding.platforms) || state.platforms.map((p) => p.id));
  const checks = state.platforms
    .map(
      (p) =>
        `<label><input type="checkbox" name="platform" value="${p.id}" ${selected.has(p.id) ? "checked" : ""}> ${p.name}</label>`,
    )
    .join("");
  document.getElementById("step").innerHTML = `
    <p>Step 1 — which platforms to bridge, and whether the repo is new or existing.</p>
    <form id="select-form">
      ${checks}
      <label><input type="radio" name="repoMode" value="new" checked> New private repo</label>
      <label><input type="radio" name="repoMode" value="existing"> Existing private repo</label>
      <label>Existing repo (owner/name) <input name="existingRepo" placeholder="owner/name"></label>
      <button type="submit">Save and continue</button>
    </form>
  `;
  document.getElementById("select-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");
    const form = event.target;
    const platforms = [...form.querySelectorAll("input[name=platform]:checked")].map((el) => el.value);
    const repoMode = form.repoMode.value;
    const existingRepo = form.existingRepo.value;
    try {
      state.onboarding = await api("/api/onboarding", {
        method: "POST",
        body: JSON.stringify({ platforms, repoMode, existingRepo }),
      });
      await goToNextPlatformOrScaffold();
    } catch (error) {
      showError(error.message);
    }
  });
}

function platformGuide(id) {
  return state.platforms.find((p) => p.id === id);
}

function renderPlatform(step) {
  const guide = platformGuide(step.platform);
  const connector = state.onboarding.connectors.find((c) => c.platform === step.platform);
  document.getElementById("step").innerHTML = `
    <p>Step ${guide.wizardStep} — ${guide.name}</p>
    <p>${guide.notes}</p>
    <ol>${guide.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    <p><a href="${guide.connectUrl}" target="_blank" rel="noopener">Open connector</a> ·
       <a href="${guide.revokeUrl}" target="_blank" rel="noopener">Revoke on platform</a> ·
       <a href="${guide.githubRevokeUrl}" target="_blank" rel="noopener">Review GitHub grants</a></p>
    <p class="muted">Status: ${connector ? connector.status : "pending"}${connector && connector.notes ? ` — ${connector.notes}` : ""}</p>
    <p>Bridge App never stores this platform's tokens. Only status, a reference, and these revoke links.</p>
    <button type="button" id="mark-connected">${guide.confirmationPrompt}</button>
    <button type="button" class="secondary" id="skip-later">Resume later</button>
  `;
  document.getElementById("mark-connected").addEventListener("click", async () => {
    showError("");
    try {
      state.onboarding = await api(`/api/onboarding/${state.onboarding.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          currentStep: guide.wizardStep,
          platform: guide.id,
          status: "connected",
        }),
      });
      await goToNextPlatformOrScaffold();
    } catch (error) {
      showError(error.message);
    }
  });
}

async function goToNextPlatformOrScaffold() {
  const pending = state.onboarding.steps.find((s) => {
    if (s.kind !== "platform") return false;
    const connector = state.onboarding.connectors.find((c) => c.platform === s.platform);
    return !connector || connector.status !== "connected";
  });
  if (pending) {
    renderPlatform(pending);
    return;
  }
  renderScaffold();
}

function renderScaffold() {
  document.getElementById("step").innerHTML = `
    <p>Create the private workspace (or attach an existing private repo), then write AGENTS.md, STATE.md, HANDOFF.md, SECURITY.md, and SETUP.md.</p>
    <label>New repo name <input id="repo-name" value="bridge-workspace"></label>
    <p>
      <button type="button" id="create-repo">Create / attach private repo</button>
      <button type="button" class="secondary" id="write-files">Write workspace files</button>
    </p>
    <pre id="scaffold-out" class="muted"></pre>
    <button type="button" id="to-verify">Continue to verification</button>
  `;
  document.getElementById("create-repo").addEventListener("click", async () => {
    showError("");
    try {
      const repoName = document.getElementById("repo-name").value;
      const result = await api(`/api/onboarding/${state.onboarding.id}/workspace`, {
        method: "POST",
        body: JSON.stringify({ repoName }),
      });
      document.getElementById("scaffold-out").textContent = JSON.stringify(result, null, 2);
      state.onboarding = await api(`/api/onboarding/${state.onboarding.id}`);
    } catch (error) {
      showError(error.message);
    }
  });
  document.getElementById("write-files").addEventListener("click", async () => {
    showError("");
    try {
      const result = await api(`/api/onboarding/${state.onboarding.id}/scaffold`, { method: "POST" });
      document.getElementById("scaffold-out").textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      showError(error.message);
    }
  });
  document.getElementById("to-verify").addEventListener("click", renderVerify);
}

function renderVerify() {
  document.getElementById("step").innerHTML = `
    <p>Verification — Bridge App pushes <code>bridge-test.md</code> and reads it back through GitHub. It cannot call AI platform APIs (no platform tokens are stored).</p>
    <button type="button" id="run-verify">Push test file and read it back</button>
    <pre id="verify-out" class="muted"></pre>
    <p>Then ask another connected AI to quote the timestamp in <code>bridge-test.md</code>.</p>
  `;
  document.getElementById("run-verify").addEventListener("click", async () => {
    showError("");
    try {
      const result = await api(`/api/onboarding/${state.onboarding.id}/verify`, { method: "POST" });
      document.getElementById("verify-out").textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      showError(error.message);
    }
  });
}

async function boot() {
  const session = await api("/api/session");
  state.csrf = session.csrfToken;
  document.getElementById("session-status").textContent = session.user
    ? `Signed in as ${session.user.githubLogin || session.user.id}`
    : "Not signed in. GitHub App OAuth never asks for your password.";
  const stubBtn = document.getElementById("stub-auth");
  if (session.stubMode) {
    stubBtn.hidden = false;
    stubBtn.addEventListener("click", async () => {
      showError("");
      try {
        await api("/api/session/stub", { method: "POST" });
        location.reload();
      } catch (error) {
        document.getElementById("session-status").textContent = error.message;
      }
    });
  }
  if (!session.user) return;
  document.getElementById("wizard").hidden = false;
  state.platforms = (await api("/api/platforms")).platforms;
  renderSelect();
}

boot().catch((error) => {
  document.getElementById("session-status").textContent = error.message;
});
