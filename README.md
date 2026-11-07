# Edge 风格历史记录（Chrome 扩展）

把 Edge 的历史记录体验带到 Chrome：**按日期分组、搜索与时间筛选、最近关闭、跨设备标签页、批量管理、访问明细**。所有数据都在本机读取，没有服务器、网络请求或统计埋点。

![历史记录主界面](screenshots/history-light.png)

## 为什么做这个

Chrome 自带的历史记录页把记录平铺成一条很长的列表，缺少按天分组、最近关闭和跨设备入口。Edge 的 `edge://history` 在这些方面更顺手。这个扩展在 Chrome 里重建了类似的浏览体验：

- 分组浏览：今天 / 昨天 / 具体日期，日期分组可折叠、可粘性悬浮。
- 快速搜索：标题和网址即时过滤，命中词高亮；支持 `/` 聚焦搜索框。
- 时间筛选：全部时间、今天、昨天、最近 7 天、最近 30 天、自定义日期。
- 最近关闭：恢复单个标签页或整个窗口。
- 来自其他设备：显示通过 Chrome 同步打开的标签页（需要登录并开启同步）。
- 管理：单条删除、按站点删除、多选批量删除、按时间范围清除历史。
- 访问明细：查看某个网址的每次访问时间与来源类型。
- 浅色 / 深色 / 跟随系统，选择会被记住。
- 工具栏快捷面板：快速查看最近访问、最近关闭并发起搜索。

| 最近关闭 | 来自其他设备 |
| --- | --- |
| ![最近关闭](screenshots/recently-closed.png) | ![来自其他设备](screenshots/devices.png) |

| 深色模式 | 工具栏面板 |
| --- | --- |
| ![深色模式](screenshots/history-dark.png) | ![工具栏面板](screenshots/popup.png) |

## 安装

1. 下载或克隆本项目，或解压发布包 `dist/edge-history-for-chrome-1.0.0.zip`。
2. 打开 `chrome://extensions`。
3. 打开右上角的 **开发者模式**。
4. 点击 **加载已解压的扩展程序**，选择本项目根目录（包含 `manifest.json` 的目录）。
5. 点击浏览器工具栏中的扩展图标即可打开快捷面板；右键图标选择“固定”更方便。

快捷键（可在 `chrome://extensions/shortcuts` 修改）：

- Windows / Linux：`Alt + H`
- macOS：`Option + Shift + H`

Chrome 不允许扩展接管内置的 `Ctrl + H`，所以本扩展提供独立的入口和快捷键。也可以把扩展页面固定为常用标签页。

## 使用

- **打开完整页面**：快捷面板底部“打开完整历史记录”，或按快捷键。
- **搜索**：按 `/` 聚焦搜索框，输入标题或网址关键词；`Enter` 打开第一条结果，`Esc` 清空/退出。
- **筛选**：搜索框旁的“全部时间”菜单。自定义范围可选择起止日期。
- **选择多条**：右上角“选择”，勾选记录；`Ctrl/Cmd + A` 全选已加载项，`Delete` 删除。
- **单条操作**：将鼠标移到记录右侧，点击 `⋯`：在新标签页打开、复制链接、查看访问明细、删除此记录、删除整个站点的记录。
- **最近关闭**：左侧“最近关闭”，点“恢复”或“恢复窗口”。
- **其他设备**：左侧“来自其他设备”，需要 Chrome 登录同一账号、开启同步，并在同步设置中勾选“打开的标签页”。
- **清除历史**：右上角垃圾桶按钮，选择时间范围。只有历史记录会被删除，不会动 Cookie、缓存、下载或书签。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `history` | 读取、搜索和删除浏览历史（扩展的核心功能）。 |
| `sessions` | 读取“最近关闭”和 Chrome 同步的标签页/窗口。 |
| `tabs` | Chrome 只有在拥有 `tabs` 权限时，才会向扩展暴露会话标签页的标题和网址；同时用于聚焦已经打开的历史页面。 |
| `storage` | 保存主题、显示选项等本地设置。 |
| `favicon` | 使用 Chrome 本地的 favicon 服务显示网站图标。 |

没有 `host_permissions`，没有内容脚本，没有后台网络请求。最近关闭、同步标签页和历史记录全部直接通过 Chrome API 读取。

## 已知限制（重要）

这些限制来自 Chrome 扩展平台本身，不是界面遗漏：

1. **无法替换 `chrome://history` 或接管 `Ctrl + H`**。Chrome 不允许扩展覆盖内置页面和这个保留快捷键。本扩展提供自己的完整页面、工具栏面板和 `Alt + H` 快捷键。
2. **Chrome 的历史记录以网址为单位**。删除一条记录会删除该网址的**全部访问记录**，不能只删除某一次访问；访问明细页也只用于查看。删除无法撤销。
3. **“来自其他设备”显示的是同步的“打开的标签页”，不是其他设备的完整历史记录**。Chrome 没有向扩展开放跨设备完整历史；同步未开启时该页为空。
4. **不会读取 Edge 的历史数据库**。这是一个在 Chrome 中复刻 Edge 浏览体验的独立扩展，不是 Edge → Chrome 的数据迁移工具。
5. **最近关闭依赖 Chrome 会话**，只保留最近 25 个关闭项；无痕窗口中的活动不会出现在普通会话列表中。
6. 时间范围按每条网址的**最后一次访问时间**筛选；同一天多次访问同一网址只显示一条，累计次数显示在右侧。
7. 清除历史只影响本机 Chrome 中保存的历史；同步到其他设备的数据是否同步删除，取决于 Chrome 的同步状态。
8. 本扩展默认不会在无痕模式启用；Chrome 的普通历史 API 也不包含无痕记录。

## 本地预览 / 开发

无需构建，直接加载目录即可。也可以在不安装扩展的情况下预览界面：

```bash
cd edge-history-for-chrome
python3 -m http.server 8765
```

打开：

- `http://127.0.0.1:8765/history.html?demo=1` — 完整历史页（演示数据）
- `http://127.0.0.1:8765/popup.html?demo=1` — 工具栏面板（演示数据）
- 附加参数：`&view=closed`、`&view=devices`、`&theme=dark`、`&q=chrome`、`&settings=1`、`&welcome=1`

`shared/demo.js` 只在 URL 带 `?demo=1` 且当前环境没有真实 `chrome.history` 时启用；在扩展页面中它会自动失效，不会覆盖真实 Chrome API。截图中的黄色“演示数据”标识就是提示。

其他开发命令：

```bash
# 重新生成多尺寸图标（需要 Pillow）
python3 tools/make_icons.py

# 用无头 Chrome 截图（可传入一段在页面里执行的 JS）
node tools/cdp-shot.mjs "http://127.0.0.1:8765/history.html?demo=1" screenshots/history-light.png "" 1440 960

# 连接已开启 remote debugging 的 Chrome，检查扩展页面
node tools/cdp-live.mjs 9333 "chrome-extension://<id>/history.html" "document.title"
```

## 项目结构

```text
edge-history-for-chrome/
├── manifest.json          # Manifest V3
├── background.js          # 安装默认值、快捷键、欢迎页
├── history.html/css/js    # 完整历史记录页面
├── popup.html/css/js      # 工具栏快捷面板
├── theme-boot.js          # 首屏前恢复主题，避免闪白
├── shared/
│   ├── utils.js           # 日期、URL、格式化和设置工具
│   ├── icons.js           # 本地 SVG 图标 sprite
│   └── demo.js            # 仅 ?demo=1 时启用的离线演示数据
├── icons/                 # 16/24/32/48/128/256 PNG 与源 SVG
├── screenshots/           # README 截图
└── tools/                 # 图标生成和 CDP 调试脚本
```

## 已验证的行为

使用 Chrome for Testing 156 加载未打包扩展，并通过 CDP 做了真实 API 验证：

- `chrome.history.search` 在新版 Chrome 中要求 `text` 字段存在（即使为空字符串），已处理。
- 仅有 `sessions` 权限时，最近关闭标签页只返回 `sessionId`；加入 `tabs` 权限后才会返回标题和网址，已处理。
- `sessions` 的 `lastModified` 可能以秒为单位返回，已统一归一化为毫秒。
- 单个标签页和整个窗口的恢复、删除历史、搜索、时间筛选、自定义日期范围、批量删除和清除范围均已跑通。
- 工具栏面板以真实 action popup 打开时尺寸为 **380 × 500**，底部操作栏可见，没有被 Chrome 裁切。
- 在无同步账号的环境下，“来自其他设备”会正确显示引导空状态。

## 版本

当前版本：`1.0.0`。个人使用的本地扩展；没有上传 Chrome Web Store。
