# 每日打卡 App — 配置指南

**它是怎么工作的**：手机上打开这个网页 App → 用你的个人 Microsoft 账号登录 → App 通过 Microsoft Graph API 直接读写 OneDrive 里的 `Tracking - 2026Q4.md`（就是电脑上 Obsidian 用的那一个）→ 你勾选一项，App 把那一行改成 `- [x] … ✅ 日期` 写回去 → 电脑上的 OneDrive 把改动同步下来 → Obsidian 和热力图自动更新。

一共 4 步，大约 30–40 分钟。

---

## 第 1 步：放到 GitHub Pages（免费网页托管）

1. 登录 GitHub → 右上角 **+** → **New repository**。
   - 名字填 `checkin`，选 **Public**（免费账号的 Pages 需要公开仓库；仓库里没有任何个人数据，客户端 ID 本来就是公开信息）。
   - 点 **Create repository**。
2. 在新仓库页面点 **uploading an existing file**，把解压后的**所有文件和 `vendor` 文件夹**一起拖进去 → **Commit changes**。
3. 仓库的 **Settings → Pages** → Source 选 **Deploy from a branch**，Branch 选 `main`、文件夹 `/ (root)` → **Save**。
4. 等 1–2 分钟，页面顶部会显示网址，类似 `https://你的用户名.github.io/checkin/`。**记下这个网址**（第 2 步要用，结尾的 `/` 也要保留）。

## 第 2 步：在 Entra ID 注册应用（给 App 一个“身份证”）

App 要访问你的 OneDrive，必须先在微软那里登记。登记要在一个 Entra 租户（tenant）里做，个人账号本身没有租户。

1. 用**和 OneDrive 同一个个人账号**登录 <https://portal.azure.com>。
   - 搜索 **Microsoft Entra ID**。能打开、看到一个目录（通常叫 *Default Directory*）→ 直接继续。
   - 提示你没有目录或订阅 → 先注册一个免费 Azure 账户（需要信用卡验证身份；注册应用本身不收费）。
   - 不要用公司账号：公司租户（Dover）里注册应用需要管理员批准。
2. Entra ID → **App registrations** → **New registration**：
   - **Name**：`Obsidian 打卡`
   - **Supported account types**：选 **Personal Microsoft accounts only**
   - **Redirect URI**：平台选 **Single-page application (SPA)**，网址填第 1 步记下的 `https://你的用户名.github.io/checkin/`
   - 点 **Register**。
3. 在应用的 **Overview** 页面复制 **Application (client) ID**（一串类似 `1a2b3c4d-…` 的字符）。
4. 左侧 **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions** → 勾选 **Files.ReadWrite** → **Add permissions**（`User.Read` 默认已有）。
   - 不需要 Client secret（单页应用用的是更安全的 PKCE 登录方式，不存密码）。

## 第 3 步：把 Client ID 填进 App

1. 回到 GitHub 仓库，点开 `config.js` → 右上角铅笔图标（Edit）。
2. 把 `在这里粘贴你的 Application (client) ID` 换成第 2 步复制的 ID（保留两边的引号）→ **Commit changes**。
3. 等 1 分钟让 Pages 更新。

## 第 4 步：iPhone 上使用

1. 用 **Safari** 打开 `https://你的用户名.github.io/checkin/`。
2. 点 **分享按钮 → 添加到主屏幕**。
3. 从主屏幕打开“打卡” → **登录** → 同意权限。
   - 主屏幕 App 和 Safari 的登录是分开的，所以在主屏幕 App 里要再登录一次。
4. 第一次会让你选计划文件：一层层点进 vault 所在的文件夹 → 点 `Tracking - 2026Q4.md`。
5. 完成。之后每次打开都会自动刷新；右上角 ↻ 手动刷新，⚙ 可以重新选文件或退出登录。

---

## 常见问题

- **登录时报 redirect URI 不匹配**：第 2 步填的网址必须和浏览器地址栏里的一字不差，包括结尾的 `/`。
- **电脑上多久能看到**：取决于 OneDrive 同步，通常几秒到一分钟。
- **电脑和手机同时改**：App 每次保存前会检查文件有没有被别处改过；改过的话会先重新下载、再重新勾选，不会覆盖电脑上的改动。
- **换季度（2027Q1）**：点 ⚙ 重新选择新的计划文件即可，不用改代码。
- **安全性**：`Files.ReadWrite` 权限能读写你整个 OneDrive，但代码只在你自己的手机浏览器里运行，只有登录了你账号的人才能用。别人打开这个网址，只能用他们自己的账号访问他们自己的文件。
- **App 认识哪些写法**：`- [ ]` / `- [x]`、`📅` 到期日、`✅` 完成日、`🔁 every day / every week / every week on Sunday / every 2 weeks` 这类重复规则（和 Obsidian Tasks 插件一致）。不认识的重复规则会只勾选、不生成下一次。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面和样式 |
| `app.js` | 登录、读写 OneDrive、显示任务 |
| `tasks.js` | 解析和修改任务行（和 Obsidian Tasks 格式一致） |
| `config.js` | 你的 Client ID |
| `manifest.json`、`icon-*.png` | 添加到主屏幕用的名称和图标 |
| `vendor/msal-browser.min.js` | 微软官方登录库 MSAL.js v3.30.0（MIT 许可，见 `vendor/MSAL-LICENSE`） |
