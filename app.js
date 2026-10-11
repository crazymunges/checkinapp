(function () {
  "use strict";
  const T = window.CheckinTasks;
  const CFG = window.CHECKIN_CONFIG || {};
  const SCOPES = ["Files.ReadWrite", "User.Read"];
  const GRAPH = "https://graph.microsoft.com/v1.0";
  const PATH_KEY = "checkin.filePath";

  const $ = (sel) => document.querySelector(sel);
  const app = $("#app");
  const statusEl = $("#status");

  const state = { account: null, path: null, file: null, text: "", parsed: null, busy: false, showUpcoming: false };

  // ---------- 小工具 ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function store(key, val) { try { val == null ? localStorage.removeItem(key) : localStorage.setItem(key, val); } catch (e) { /* 存不了也不影响使用 */ } }
  function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function setStatus(msg, kind) { statusEl.textContent = msg || ""; statusEl.dataset.kind = kind || ""; }
  function encPath(p) { return p.split("/").filter(Boolean).map(encodeURIComponent).join("/"); }

  // ---------- 登录（MSAL） ----------
  const redirectUri = location.origin + location.pathname.replace(/index\.html$/, "");
  let msalApp;

  async function initAuth() {
    msalApp = new msal.PublicClientApplication({
      auth: { clientId: CFG.CLIENT_ID, authority: "https://login.microsoftonline.com/consumers", redirectUri },
      cache: { cacheLocation: "localStorage" },
    });
    await msalApp.initialize();
    const res = await msalApp.handleRedirectPromise();
    if (res && res.account) msalApp.setActiveAccount(res.account);
    state.account = msalApp.getActiveAccount() || msalApp.getAllAccounts()[0] || null;
    if (state.account) msalApp.setActiveAccount(state.account);
  }

  function login() { return msalApp.loginRedirect({ scopes: SCOPES }); }
  function logout() { return msalApp.logoutRedirect({ account: state.account, postLogoutRedirectUri: redirectUri }); }

  async function token() {
    try {
      const r = await msalApp.acquireTokenSilent({ scopes: SCOPES, account: state.account });
      return r.accessToken;
    } catch (e) {
      await msalApp.acquireTokenRedirect({ scopes: SCOPES, account: state.account });
      throw new Error("正在重新登录…");
    }
  }

  // ---------- OneDrive（Microsoft Graph） ----------
  async function graph(path, opts = {}) {
    const t = await token();
    const res = await fetch(GRAPH + path, { ...opts, headers: { Authorization: "Bearer " + t, ...(opts.headers || {}) } });
    return res;
  }

  async function loadFile() {
    const res = await graph(`/me/drive/root:/${encPath(state.path)}`);
    if (res.status === 404) throw new Error("找不到计划文件，请在设置里重新选择。");
    if (!res.ok) throw new Error(`读取文件信息失败（${res.status}）`);
    const meta = await res.json();
    const dl = await fetch(meta["@microsoft.graph.downloadUrl"]);
    if (!dl.ok) throw new Error(`下载文件失败（${dl.status}）`);
    state.file = { id: meta.id, eTag: meta.eTag, name: meta.name };
    state.text = await dl.text();
    state.parsed = T.parse(state.text);
  }

  async function saveText(text) {
    const res = await graph(`/me/drive/items/${state.file.id}/content`, {
      method: "PUT",
      headers: { "If-Match": state.file.eTag, "Content-Type": "text/plain; charset=utf-8" },
      body: text,
    });
    if (res.status === 412) return "conflict";
    if (!res.ok) throw new Error(`保存失败（${res.status}）`);
    const meta = await res.json();
    state.file.eTag = meta.eTag;
    state.text = text;
    state.parsed = T.parse(text);
    return "ok";
  }

  // 勾选 / 取消勾选。文件在别处被改过时（412），重新下载后再试一次。
  async function toggle(task) {
    if (state.busy) return;
    state.busy = true;
    const change = (text) => (task.done ? T.uncomplete(text, task) : T.complete(text, task));
    const before = state.text;
    try {
      let next = change(state.text);
      if (next == null) { await loadFile(); next = change(state.text); }
      if (next == null) throw new Error("这条任务在文件里找不到了，已重新加载。");
      state.parsed = T.parse(next); // 先在屏幕上显示结果
      render();
      setStatus("保存中…");
      let r = await saveText(next);
      if (r === "conflict") {
        await loadFile();
        next = change(state.text);
        if (next == null) throw new Error("文件在别处被改过，这条任务已不存在。");
        r = await saveText(next);
        if (r === "conflict") throw new Error("文件正在别处被修改，请稍后刷新再试。");
      }
      setStatus("已同步 ✓", "ok");
    } catch (e) {
      state.text = before;
      state.parsed = T.parse(before);
      setStatus(e.message, "err");
    } finally {
      state.busy = false;
      render();
    }
  }

  // ---------- 页面 ----------
  function groupByHeading(tasks) {
    const groups = new Map();
    for (const t of tasks) {
      if (!groups.has(t.heading)) groups.set(t.heading, []);
      groups.get(t.heading).push(t);
    }
    return groups;
  }

  function taskRow(t, today) {
    const overdue = !t.done && t.due && t.due < today;
    const meta = [];
    if (t.due) meta.push(`<span class="${overdue ? "late" : ""}">${overdue ? "逾期 " : ""}📅 ${t.due.slice(5)}</span>`);
    if (t.recur) meta.push(`<span>🔁</span>`);
    return `<li><label class="task ${t.done ? "done" : ""}">
      <input type="checkbox" data-i="${t.index}" ${t.done ? "checked" : ""}>
      <span class="desc">${esc(t.description)}</span>
      <span class="meta">${meta.join(" ")}</span>
    </label></li>`;
  }

  function section(title, tasks, today, empty) {
    if (!tasks.length) return `<section><h2>${title}</h2><p class="empty">${empty}</p></section>`;
    let html = `<section><h2>${title} <small>${tasks.length}</small></h2>`;
    for (const [h, list] of groupByHeading(tasks)) {
      html += `<h3>${esc(h || "其他")}</h3><ul>${list.map((t) => taskRow(t, today)).join("")}</ul>`;
    }
    return html + `</section>`;
  }

  function heatmap(tasks, today) {
    const counts = {};
    for (const t of tasks) if (t.done && t.doneDate) counts[t.doneDate] = (counts[t.doneDate] || 0) + 1;
    // 最近 12 周，每列一周（周一到周日）
    const d = new Date();
    const dow = (d.getDay() + 6) % 7; // 周一 = 0
    const start = T.addDays(today, -(7 * 11 + dow));
    let cells = "";
    for (let i = 0; i < 84; i++) {
      const day = T.addDays(start, i);
      const n = day > today ? -1 : counts[day] || 0;
      const lvl = n < 0 ? "f" : n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : 3;
      cells += `<i class="l${lvl}" title="${day}：${Math.max(n, 0)} 项"></i>`;
    }
    const streak = (() => { let s = 0, day = counts[today] ? today : T.addDays(today, -1); while (counts[day]) { s++; day = T.addDays(day, -1); } return s; })();
    return `<section><h2>打卡 <small>连续 ${streak} 天</small></h2><div class="heat">${cells}</div></section>`;
  }

  function render() {
    if (!CFG.CLIENT_ID || CFG.CLIENT_ID.startsWith("在这里")) {
      app.innerHTML = `<section><h2>还差一步</h2><p>请先在 <code>config.js</code> 里填上 CLIENT_ID。</p></section>`;
      return;
    }
    if (!state.account) {
      app.innerHTML = `<section class="center"><h2>每日打卡</h2><p>用你的个人 Microsoft 账号登录，读取 OneDrive 里的 Obsidian 计划。</p><button id="login" class="primary">登录</button></section>`;
      $("#login").onclick = login;
      return;
    }
    if (!state.path) { renderPicker(""); return; }
    if (!state.parsed) { app.innerHTML = `<p class="empty">加载中…</p>`; return; }

    const today = T.today();
    const all = state.parsed.tasks;
    const todo = all.filter((t) => !t.done && t.due && t.due <= today);
    const doneToday = all.filter((t) => t.done && t.doneDate === today);
    const upcoming = all.filter((t) => !t.done && t.due && t.due > today && t.due <= T.addDays(today, 7));

    app.innerHTML =
      section("今天要做", todo, today, "今天的任务都完成了 🎉") +
      section("今天完成", doneToday, today, "还没有完成的任务") +
      `<details ${state.showUpcoming ? "open" : ""} id="up"><summary>接下来 7 天（${upcoming.length}）</summary>${section("", upcoming, today, "没有")}</details>` +
      heatmap(all, today);

    app.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.onchange = () => {
        const t = state.parsed.tasks.find((x) => x.index === Number(cb.dataset.i));
        if (t) toggle(t);
      };
    });
    $("#up").ontoggle = (e) => { state.showUpcoming = e.target.open; };
  }

  // 选择计划文件：一层层浏览 OneDrive 文件夹，点 .md 文件即选中。
  async function renderPicker(folder) {
    app.innerHTML = `<section><h2>选择计划文件</h2><p class="crumb">OneDrive/${esc(folder)}</p><ul class="picker"><li class="empty">加载中…</li></ul></section>`;
    try {
      const url = folder ? `/me/drive/root:/${encPath(folder)}:/children?$top=200&$select=name,folder,file` : `/me/drive/root/children?$top=200&$select=name,folder,file`;
      const res = await graph(url);
      if (!res.ok) throw new Error(`读取文件夹失败（${res.status}）`);
      const items = (await res.json()).value
        .filter((x) => x.folder || /\.md$/i.test(x.name))
        .sort((a, b) => (!!b.folder - !!a.folder) || a.name.localeCompare(b.name));
      const up = folder ? `<li><button data-up>⬆ 上一级</button></li>` : "";
      app.querySelector(".picker").innerHTML = up + items.map((x) =>
        `<li><button data-name="${esc(x.name)}" data-folder="${x.folder ? 1 : 0}">${x.folder ? "📁" : "📄"} ${esc(x.name)}</button></li>`).join("");
      app.querySelectorAll(".picker button").forEach((b) => {
        b.onclick = () => {
          if (b.hasAttribute("data-up")) return renderPicker(folder.split("/").slice(0, -1).join("/"));
          const p = (folder ? folder + "/" : "") + b.dataset.name;
          if (b.dataset.folder === "1") return renderPicker(p);
          state.path = p;
          store(PATH_KEY, p);
          refresh();
        };
      });
    } catch (e) {
      setStatus(e.message, "err");
    }
  }

  async function refresh() {
    if (!state.account || !state.path || state.busy) return render();
    setStatus("同步中…");
    state.parsed = state.parsed || null;
    render();
    try {
      await loadFile();
      setStatus("已同步 ✓", "ok");
    } catch (e) {
      setStatus(e.message, "err");
    }
    render();
  }

  // ---------- 启动 ----------
  $("#refresh").onclick = refresh;
  $("#settings").onclick = () => {
    if (!state.account) return;
    const choice = confirm("重新选择计划文件？\n（点“取消”可以退出登录）");
    if (choice) { state.path = null; state.parsed = null; store(PATH_KEY, null); render(); }
    else if (confirm("确定退出登录？")) logout();
  };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  $("#today").textContent = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });

  (async function start() {
    state.path = load(PATH_KEY);
    if (!CFG.CLIENT_ID || CFG.CLIENT_ID.startsWith("在这里")) return render();
    try {
      await initAuth();
    } catch (e) {
      setStatus("登录初始化失败：" + e.message, "err");
    }
    refresh();
  })();
})();
