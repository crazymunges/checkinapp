// 读取和修改 Obsidian Tasks 格式的任务行。
// 只依赖纯文本，不依赖浏览器，可以在 node 里测试。
(function (root) {
  "use strict";

  const TASK_RE = /^(\s*[-*] \[)( |x|X)(\] )(.*)$/;
  const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;
  const FIELD_START = /[📅🔁✅⏳🛫➕⏫🔼🔽🔺⏬]/u;

  function pad(n) { return String(n).padStart(2, "0"); }
  function fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return fmt(d); }
  function today() { return fmt(new Date()); }

  function parse(text) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    const tasks = [];
    let heading = "";
    lines.forEach((raw, index) => {
      const h = raw.match(HEADING_RE);
      if (h) { heading = h[2]; return; }
      const m = raw.match(TASK_RE);
      if (!m) return;
      const body = m[4];
      const cut = body.search(FIELD_START);
      const description = (cut === -1 ? body : body.slice(0, cut)).trim();
      const due = (body.match(/📅\s*(\d{4}-\d{2}-\d{2})/u) || [])[1] || null;
      const doneDate = (body.match(/✅\s*(\d{4}-\d{2}-\d{2})/u) || [])[1] || null;
      const recur = (body.match(/🔁\s*([^📅✅⏳🛫➕]+?)\s*(?=[📅✅⏳🛫➕]|$)/u) || [])[1] || null;
      tasks.push({
        index, raw, heading, description, due, doneDate, recur,
        done: m[2].toLowerCase() === "x",
      });
    });
    return { lines, eol, tasks };
  }

  const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  // 根据 🔁 规则算出下一次的日期；不认识的规则返回 null。
  function nextDue(rule, due) {
    if (!rule || !due) return null;
    const r = rule.toLowerCase().trim();
    let m;
    if ((m = r.match(/^every (\d+ )?days?$/))) return addDays(due, Number(m[1] || 1));
    if ((m = r.match(/^every (\d+ )?weeks? on (\w+)$/))) {
      const step = Number(m[1] || 1);
      const target = WEEKDAYS.indexOf(m[2]);
      if (target === -1) return null;
      const d = parseDate(due);
      d.setDate(d.getDate() + 1);
      while (d.getDay() !== target) d.setDate(d.getDate() + 1);
      d.setDate(d.getDate() + 7 * (step - 1));
      return fmt(d);
    }
    if ((m = r.match(/^every (\d+ )?weeks?$/))) return addDays(due, 7 * Number(m[1] || 1));
    return null;
  }

  // 在文件里找到这个任务现在所在的行（文件可能已在别处被改过）。
  function locate(lines, task) {
    if (lines[task.index] === task.raw) return task.index;
    const i = lines.indexOf(task.raw);
    return i;
  }

  // 勾选完成：返回新的文本；找不到原行时返回 null。
  function complete(text, task, onDate) {
    const { lines, eol } = parse(text);
    const i = locate(lines, task);
    if (i === -1) return null;
    const date = onDate || today();
    const original = lines[i];
    const doneLine = original.replace(TASK_RE, (_, a, _s, b, rest) => `${a}x${b}${rest.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/u, "")} ✅ ${date}`);
    const out = lines.slice();
    out[i] = doneLine;
    const next = nextDue(task.recur, task.due);
    if (next) {
      const newLine = original
        .replace(TASK_RE, (_, a, _s, b, rest) => `${a} ${b}${rest}`)
        .replace(/📅\s*\d{4}-\d{2}-\d{2}/u, `📅 ${next}`);
      out.splice(i, 0, newLine); // 和 Tasks 插件默认一样：新的一次放在上面
    }
    return out.join(eol);
  }

  // 取消勾选：去掉 ✅ 日期，变回未完成。
  function uncomplete(text, task) {
    const { lines, eol } = parse(text);
    const i = locate(lines, task);
    if (i === -1) return null;
    const out = lines.slice();
    out[i] = lines[i].replace(TASK_RE, (_, a, _s, b, rest) => `${a} ${b}${rest.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/u, "")}`);
    return out.join(eol);
  }

  const api = { parse, complete, uncomplete, nextDue, today, addDays, fmt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CheckinTasks = api;
})(typeof self !== "undefined" ? self : this);
