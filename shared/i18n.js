/**
 * Localisation for the extension pages.
 *
 * The dictionary is bundled with the extension; nothing is fetched at runtime.
 * User content (history titles, URLs, device names) is never translated.
 */

export const LANGUAGES = Object.freeze(['system', 'zh-CN', 'en']);
export const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'en']);
const LANGUAGE_CACHE_KEY = 'edge-history-language';

export const MESSAGES = {
  'zh-CN': {
    // app / navigation
    'app.name': 'Edge 风格历史记录',
    'app.tagline': 'EDGE 风格',
    'app.brand': '历史记录',
    'app.pageTitleHistory': '历史记录 · Edge 风格历史记录',
    'app.pageTitleClosed': '最近关闭 · Edge 风格历史记录',
    'app.pageTitleDevices': '来自其他设备 · Edge 风格历史记录',
    'app.popupTitle': '历史记录',
    'app.demoBadge': '演示数据',
    'app.demoPill': '演示',
    'nav.aria': '历史记录导航',
    'nav.history': '历史记录',
    'nav.closed': '最近关闭',
    'nav.devices': '来自其他设备',
    'sidebar.shortcut': '随时打开历史记录',
    'sidebar.shortcutTitle': '可在 chrome://extensions/shortcuts 中修改',
    'sidebar.shortcutTitleMac': 'Option + Shift + H，可在 chrome://extensions/shortcuts 中修改',
    'sidebar.themeToggle': '切换主题',
    'sidebar.settings': '设置',
    'theme.systemDark': '跟随系统（当前深色）',
    'theme.systemLight': '跟随系统（当前浅色）',
    'theme.dark': '深色',
    'theme.light': '浅色',
    'theme.toggleTitle': '主题：{label}，点击切换',
    'view.history.title': '历史记录',
    'view.history.subtitle': '按日期查看、搜索和管理你的浏览记录',
    'view.closed.title': '最近关闭',
    'view.closed.subtitle': '恢复最近关闭的标签页或整个窗口',
    'view.devices.title': '来自其他设备',
    'view.devices.subtitle': '打开在其他设备上正在浏览的标签页',

    // common
    'common.select': '选择',
    'common.done': '完成',
    'common.export': '导出',
    'common.clear': '清除',
    'common.refresh': '刷新',
    'common.refreshing': '刷新中…',
    'common.loading': '正在加载…',
    'common.loadingMore': '正在加载更多…',
    'common.retry': '重试',
    'common.close': '关闭',
    'common.cancel': '取消',
    'common.delete': '删除',
    'common.clearSearch': '清除搜索',
    'common.showAllTime': '显示全部时间',
    'common.loadMore': '加载更多',
    'common.startDate': '开始日期',
    'common.endDate': '结束日期',
    'common.apply': '应用',
    'common.settings': '设置',
    'common.visit': '访问',
    'common.unknown': '未知',
    'common.untitledTab': '未命名标签页',
    'common.selectAllLoaded': '全选已加载',
    'common.deselectAll': '取消全选',
    'common.cancelSelection': '取消选择',
    'common.exitSelection': '退出选择模式',
    'common.deleteSelected': '删除',
    'common.version': '版本 {version}',

    // counts / plurals
    'count.group_one': '{count} 条',
    'count.group_other': '{count} 条',
    'count.total_one': '共 {count} 条',
    'count.total_other': '共 {count} 条',
    'count.loaded_one': '已加载 {count} 条',
    'count.loaded_other': '已加载 {count} 条',
    'count.search_one': '{count} 条搜索结果',
    'count.search_other': '{count} 条搜索结果',
    'count.zero': '0 条',
    'count.loading': '正在加载…',
    'count.failed': '加载失败',
    'count.closed_one': '{count} 个关闭项',
    'count.closed_other': '{count} 个关闭项',
    'count.matches_one': '{count} 个匹配项',
    'count.matches_other': '{count} 个匹配项',
    'count.devices_one': '{count} 台设备',
    'count.devices_other': '{count} 台设备',
    'count.tabs_one': '{count} 个标签页',
    'count.tabs_other': '{count} 个标签页',
    'count.windows_one': '{count} 个窗口',
    'count.windows_other': '{count} 个窗口',
    'count.matchingTabs_one': '{count} 个匹配标签页',
    'count.matchingTabs_other': '{count} 个匹配标签页',
    'count.visits_one': '{count} 次访问',
    'count.visits_other': '{count} 次访问',
    'count.visitsShort_one': '{count} 次',
    'count.visitsShort_other': '{count} 次',
    'count.allLoaded_one': '已显示全部 {count} 条',
    'count.allLoaded_other': '已显示全部 {count} 条',
    'count.deleted_one': '已删除 {count} 条记录',
    'count.deleted_other': '已删除 {count} 条记录',

    // ranges
    'range.all': '全部时间',
    'range.hour': '最近 1 小时',
    'range.24h': '最近 24 小时',
    'range.today': '今天',
    'range.yesterday': '昨天',
    'range.7d': '最近 7 天',
    'range.30d': '最近 30 天',
    'range.custom': '自定义范围',
    'range.customEllipsis': '自定义范围…',
    'range.earliest': '最早',
    'range.now': '现在',
    'range.heading': '时间范围',
    'range.menuAria': '时间范围',
    'range.filterAria': '按时间筛选',
    'range.startDate': '开始日期',
    'range.endDate': '结束日期',
    'range.apply': '应用',
    'range.chooseBoth': '请选择开始和结束日期',
    'range.invalidDate': '日期格式无效',
    'range.order': '开始日期不能晚于结束日期',
    'range.future': '不能选择未来的日期',

    // dates
    'time.today': '今天',
    'time.yesterday': '昨天',
    'time.justNow': '刚刚',
    'time.todayAt': '今天 {time}',
    'time.yesterdayAt': '昨天 {time}',

    // history page
    'history.listAria': '浏览历史记录',
    'history.clear': '清除历史记录',
    'history.searchPlaceholder': '搜索历史记录（标题或网址）',
    'history.searchAria': '搜索历史记录',
    'history.searchClosedPlaceholder': '搜索最近关闭（标题或网址）',
    'history.searchDevicesPlaceholder': '搜索来自其他设备的标签页',
    'history.readErrorTitle': '无法读取历史记录',
    'history.apiError': '无法访问 Chrome 历史记录 API。请通过扩展页面打开，或使用 ?demo=1 预览。',
    'history.initError': '页面初始化失败：{error}',
    'history.noResultsTitle': '未找到相关历史记录',
    'history.noResultsText': '没有与“{query}”匹配的标题或网址。试试其他关键词，或调整时间范围。',
    'history.emptyRangeTitle': '此时间范围内没有历史记录',
    'history.emptyRangeText': '当前筛选范围是“{range}”。可以换个时间范围，或查看全部记录。',
    'history.emptyTitle': '还没有历史记录',
    'history.emptyText': '打开一些网页后，你的浏览记录会按日期出现在这里。也可以试着搜索标题或网址。',
    'history.loadFailed': '加载失败：{error}',
    'history.allLoaded_one': '已显示全部 {count} 条记录',
    'history.allLoaded_other': '已显示全部 {count} 条记录',
    'history.scrollMore': '继续滚动以加载更多',
    'history.selectModeAnnounce': '已进入选择模式',
    'history.bulkSelectedHtml': '已选择 {count} 项',
    'history.selectAll': '全选已加载',
    'history.deselectAll': '取消全选',
    'history.cancelSelection': '取消选择',
    'history.bulkDelete': '删除',
    'history.bulkExit': '退出选择模式',
    'history.bulkDeleteTitle': '删除选中的历史记录？',
    'history.bulkDeleteMessage_one': '将删除选中的 {count} 条记录的全部浏览记录。Chrome 以网址为单位保存历史，删除会移除这些网址的所有访问记录，而不是只删除某一次访问。',
    'history.bulkDeleteMessage_other': '将删除选中的 {count} 条记录的全部浏览记录。Chrome 以网址为单位保存历史，删除会移除这些网址的所有访问记录，而不是只删除某一次访问。',
    'history.bulkDeleteNote': '此操作无法撤销，也不会删除 Cookie、缓存或书签。',
    'history.deleteNothing': '没有记录被删除，请重试',
    'history.rowSelect': '选择 {title}',
    'history.rowMore': '更多操作',
    'history.menuOpen': '在新标签页中打开',
    'history.menuCopy': '复制链接',
    'history.menuVisits': '查看访问记录',
    'history.menuDelete': '删除此记录',
    'history.menuDeleteSite': '删除 {site} 的所有记录',
    'history.menuDeleteSiteFallback': '删除此站点的所有记录',
    'history.copySuccess': '链接已复制',
    'history.copyFailure': '复制失败，请手动选择网址',
    'history.deleteMergedNote': '这条记录合并了 {count} 个网址变体，会一并删除。',
    'history.deleteTitle': '删除此历史记录？',
    'history.deleteMessage': '将删除“{title}”的全部访问记录（共 {visits}）。{mergedNote}Chrome 以网址为单位保存历史，因此无法只删除其中一次访问。',
    'history.deleteNote': '此操作无法撤销。',
    'history.deleteSuccess': '已删除该记录',
    'history.deleteFailed': '删除失败，请重试',
    'history.deleteSiteTitle': '删除此站点的历史记录？',
    'history.deleteSiteMessage': '将删除 {label} 这个主机下所有网址的全部浏览记录（不含子域名），包括当前页面中尚未显示的记录。Chrome 的历史记录以网址为单位，无法只删除某一次访问。',
    'history.deleteSiteNote': '此操作无法撤销，可能需要几秒钟。',
    'history.deleteSiteConfirm': '全部删除',
    'history.deleteSiteProgress': '正在删除 {label} 的历史记录…',
    'history.deleteSitePartial_one': '已删除 {count} 条；部分站点记录未能收集，可能仍有剩余',
    'history.deleteSitePartial_other': '已删除 {count} 条；部分站点记录未能收集，可能仍有剩余',
    'history.deleteSiteSuccess_one': '已删除 {label} 的 {count} 条记录',
    'history.deleteSiteSuccess_other': '已删除 {label} 的 {count} 条记录',
    'history.visits.title': '访问记录',
    'history.visits.loading': '正在读取访问明细…',
    'history.visits.summary': '该网址共有 {visits}{truncated}。',
    'history.visits.truncated': '，下面显示最近 {shown} 次',
    'history.visits.empty': '没有可用的访问明细。',
    'history.visits.error': '无法读取访问明细：{error}',

    // recently closed
    'closed.listAria': '最近关闭的标签页',
    'closed.limitNote': 'Chrome 最多保留最近 25 个关闭项',
    'closed.metaLoading': '正在读取…',
    'closed.metaFailed': '读取失败',
    'closed.loadingTitle': '正在读取最近关闭的记录',
    'closed.readErrorTitle': '无法读取最近关闭的标签页',
    'closed.emptyTitle': '没有最近关闭的标签页',
    'closed.emptyText': '关闭标签页或窗口后，它们会出现在这里，可以一键恢复。',
    'closed.noMatchesTitle': '没有匹配的关闭项',
    'closed.noMatchesText': '没有与“{query}”匹配的已关闭标签页。',
    'closed.unnamedTab': '未命名标签页',
    'closed.unknownTime': '最近关闭',
    'closed.restore': '恢复',
    'closed.restoreTab': '恢复标签页',
    'closed.restoreTabAria': '恢复 {title}',
    'closed.windowTitle': '窗口 · {tabs}',
    'closed.multipleTabs': '包含多个标签页',
    'closed.restoreWindow': '恢复窗口',
    'closed.restoreWindowAria_one': '恢复窗口，共 {count} 个标签页',
    'closed.restoreWindowAria_other': '恢复窗口，共 {count} 个标签页',
    'closed.restoredWindow': '已恢复窗口',
    'closed.restoredTab': '已恢复标签页',
    'closed.restoreFailed': '恢复失败，请重试',
    'closed.restoreFailedWithError': '恢复失败：{error}',

    // devices
    'devices.listAria': '来自其他设备的标签页',
    'devices.note': '需要登录 Chrome 并开启同步',
    'devices.metaLoading': '正在读取…',
    'devices.metaFailed': '读取失败',
    'devices.loadingTitle': '正在读取同步的标签页',
    'devices.readErrorTitle': '无法读取其他设备的标签页',
    'devices.emptyTitle': '还没有来自其他设备的标签页',
    'devices.emptyText': 'Chrome 没有返回已同步的会话。跨设备标签页需要登录同一个 Google 账号，并在同步设置中开启“打开的标签页”。',
    'devices.step1': '在这台电脑的 Chrome 中登录你的 Google 账号。',
    'devices.step2': '打开同步，并勾选“打开的标签页”这一项。',
    'devices.step3': '在手机或其他电脑上保持 Chrome 打开，然后点击刷新。',
    'devices.openSync': '打开 Chrome 同步设置',
    'devices.noMatchesTitle': '没有匹配的标签页',
    'devices.noMatchesText': '没有与“{query}”匹配的其他设备标签页。',
    'devices.unknown': '未知设备',
    'devices.windowTitle': '窗口 · {tabs}',
    'devices.searchPlaceholder': '搜索来自其他设备的标签页',
    'devices.syncCopied': '已复制同步设置地址，请在地址栏打开',
    'devices.syncFallback': '请在地址栏打开 chrome://settings/syncSetup',

    // welcome
    'welcome.title': '欢迎使用 Edge 风格历史记录',
    'welcome.local': '本地运行',
    'welcome.bodyBefore': '按日期分组、搜索筛选、最近关闭和跨设备标签页都在这一页。把扩展固定到工具栏，或按',
    'welcome.bodyAfter': '随时打开。',
    'welcome.note': 'Chrome 不允许扩展替换 chrome://history 或 Ctrl+H，建议把此页面固定为常用入口。',
    'welcome.dismiss': '知道了',
    'welcome.close': '关闭欢迎提示',

    // settings
    'settings.title': '设置',
    'settings.appearance': '外观',
    'settings.theme': '主题',
    'settings.themeHint': '跟随系统，或固定为浅色 / 深色。',
    'settings.themeSystem': '跟随',
    'settings.themeLight': '浅色',
    'settings.themeDark': '深色',
    'settings.language': '语言',
    'settings.languageHint': '选择界面语言。切换后立即生效，并同步到其他设备。',
    'settings.languageSystem': '跟随浏览器',
    'settings.languageZh': '简体中文',
    'settings.languageEn': 'English',
    'settings.showVisitCounts': '显示访问次数',
    'settings.showVisitCountsHint': '在记录右侧显示该网址的累计访问次数。',
    'settings.mergeDuplicates': '合并重复页面',
    'settings.mergeDuplicatesHint': '同一站点下标题相同、路径主体相同的记录合并为一条；忽略查询参数、# 片段和末尾楼层数字。',
    'settings.openInNewTab': '在新标签页中打开',
    'settings.openInNewTabHint': '点击历史记录时保留当前页面。也可以按住 Ctrl / ⌘ 临时在新标签页打开。',
    'settings.data': '数据',
    'settings.clear': '清除浏览历史',
    'settings.clearHint': '只清除历史记录，不影响 Cookie、缓存、下载或书签。',
    'settings.clearButton': '清除…',
    'settings.syncHint': '设置会通过 Chrome 同步到其他设备；未登录或同步不可用时，仅保存在本机。',
    'settings.privacyNote': '此扩展不会上传任何数据，没有网络请求或分析统计。历史记录、最近关闭和同步标签页都直接读取 Chrome 的本地 API。',
    'settings.shortcuts': '快捷键',
    'settings.shortcutOpen': '打开完整历史记录',
    'settings.shortcutHint': '当前快捷键：{shortcut}。Chrome 不允许扩展占用 Ctrl+H，可以在扩展快捷键页面修改。',
    'settings.copyShortcutPath': '复制设置地址',
    'settings.shortcutNote': '打开 {path}，找到“Edge 风格历史记录”即可自定义快捷键。',
    'settings.about': '关于',
    'settings.aboutName': 'Edge 风格历史记录',
    'settings.aboutBody': '为 Chrome 带来按日期分组、搜索筛选和最近关闭等更顺手的浏览体验。',
    'settings.version': '版本 {version}',
    'settings.localNoTracking': '本地运行 · 无追踪',
    'settings.aboutNote': '受 Chrome 扩展权限限制，本扩展无法替换 {history} 或 Ctrl+H，也无法读取 Edge 的历史记录。跨设备标签页依赖 Chrome 同步。',
    'settings.done': '完成',
    'settings.copyShortcutSuccess': '已复制快捷键设置地址',
    'settings.copyShortcutFallback': '复制失败，请手动输入 chrome://extensions/shortcuts',
    'settings.syncUnavailable': '设置已保存在本机，Chrome 同步当前不可用。',
    'settings.saveFailed': '设置保存失败，请重试。',

    // clear
    'clear.title': '清除历史记录',
    'clear.intro': '选择要清除的时间范围。此操作只删除 Chrome 的浏览历史，不会删除 Cookie、缓存、下载记录或书签。',
    'clear.rangeLabel': '时间范围',
    'clear.hour': '最近 1 小时',
    'clear.today': '今天',
    'clear.7d': '最近 7 天',
    'clear.30d': '最近 30 天',
    'clear.all': '全部时间',
    'clear.custom': '自定义范围…',
    'clear.startDate': '开始日期',
    'clear.endDate': '结束日期',
    'clear.nativeNote': 'Cookie、缓存、下载记录等需要在 Chrome 的“清除浏览数据”中处理。',
    'clear.openChrome': '打开 Chrome 清除浏览数据',
    'clear.warning': '历史记录清除后无法撤销。同步到其他设备的历史记录是否受影响，取决于 Chrome 的同步状态。',
    'clear.ack': '我了解此操作无法撤销',
    'clear.cancel': '取消',
    'clear.confirm': '清除历史记录',
    'clear.clearing': '正在清除…',
    'clear.empty': '此范围内没有可清除的历史记录',
    'clear.success': '已清除历史记录',
    'clear.failed': '清除失败：{error}',
    'clear.copied': '已复制地址，请在地址栏打开',
    'clear.copyFallback': '请在地址栏打开 chrome://settings/clearBrowserData',

    // export
    'export.title': '导出浏览数据',
    'export.intro': '把浏览历史导出到本地文件。文件只包含标题、网址、访问次数和最后访问时间，不包含 Cookie、缓存、密码或下载记录。',
    'export.scope': '导出范围',
    'export.scopeAll': '全部历史',
    'export.scopeCurrent': '当前搜索 / 时间筛选',
    'export.format': '文件格式',
    'export.csv': 'CSV（Excel 可打开）',
    'export.json': 'JSON',
    'export.note': '导出的文件可能包含敏感浏览记录，请自行妥善保管。',
    'export.cancel': '取消',
    'export.confirm': '导出',
    'export.exporting': '正在导出…',
    'export.exportingCount': '正在导出… {count} 条',
    'export.empty': '没有可导出的历史记录',
    'export.success': '已导出 {count} 条历史记录',
    'export.failed': '导出失败：{error}',
    'export.scopeLabelCurrent': '当前筛选',
    'export.scopeLabelAll': '全部历史',
    'export.headerTitle': '标题',
    'export.headerUrl': '网址',
    'export.headerVisitCount': '访问次数',
    'export.headerLastVisit': '最后访问时间',

    // popup
    'popup.fullPage': '完整页',
    'popup.openFullAria': '打开完整历史记录',
    'popup.openFullTitle': '打开完整历史记录（{shortcut}）',
    'popup.settings': '设置',
    'popup.demo': '演示',
    'popup.tabsAria': '历史记录视图',
    'popup.historyTab': '历史记录',
    'popup.closedTab': '最近关闭',
    'popup.filterAria': '按时间筛选',
    'popup.menuAria': '时间范围',
    'popup.byDate': '按日期',
    'popup.closedMeta': '最近关闭',
    'popup.historyListAria': '浏览历史记录',
    'popup.closedListAria': '最近关闭的标签页',
    'popup.searchHistory': '搜索历史记录',
    'popup.searchClosed': '搜索最近关闭',
    'popup.searchClear': '清除搜索',
    'popup.initError': '快捷面板加载失败，请打开完整历史记录。',
    'popup.readErrorTitle': '无法读取历史记录',
    'popup.noResultsTitle': '未找到相关历史记录',
    'popup.noResultsText': '没有与当前关键词匹配的标题或网址。',
    'popup.emptyRangeTitle': '此时间范围内没有记录',
    'popup.emptyRangeText': '当前筛选：{range}',
    'popup.emptyTitle': '还没有浏览记录',
    'popup.emptyText': '打开一些网页后，历史记录会按日期出现在这里。',
    'popup.closedEmptyTitle': '没有最近关闭的标签页',
    'popup.closedEmptyText': '关闭标签页或窗口后，可以在这里一键恢复。',
    'popup.closedNoMatchesTitle': '没有匹配的关闭项',
    'popup.closedNoMatchesText': '没有与“{query}”匹配的已关闭标签页。',
    'popup.closedErrorTitle': '无法读取最近关闭',
    'popup.closedTabFallback': '标签页',
    'popup.closedMultipleTabs': '包含多个标签页',
    'popup.closedWindow': '窗口 · {tabs}',
    'popup.closedRestoreAria': '恢复 {title}',
    'popup.closedRestoreTitle': '恢复标签页',
    'popup.closedRestoreWindow': '恢复窗口',
    'popup.closedRestoreWindowAria_one': '恢复窗口，共 {count} 个标签页',
    'popup.closedRestoreWindowAria_other': '恢复窗口，共 {count} 个标签页',
    'popup.closedRestoredWindow': '已恢复窗口',
    'popup.closedRestoredTab': '已恢复标签页',
    'popup.closedRestoreFailed': '恢复失败，请重试',

    // errors / urls / transitions
    'error.unknown': '未知错误',
    'error.tabClosed': '页面可能已经被关闭',
    'error.syncUnavailable': 'Chrome 同步或会话功能当前不可用',
    'error.openType': 'Chrome 不允许扩展直接打开此类型的页面，可以复制链接后在地址栏打开',
    'error.openTypeShort': 'Chrome 不允许扩展直接打开此类型的页面',
    'error.openPage': '无法打开该页面',
    'error.openFull': '无法打开完整历史记录',
    'url.localFile': '本地文件',
    'transition.link': '点击链接',
    'transition.typed': '地址栏输入',
    'transition.auto_bookmark': '书签',
    'transition.auto_subframe': '子框架',
    'transition.manual_subframe': '手动子框架',
    'transition.generated': '自动跳转',
    'transition.auto_toplevel': '自动打开',
    'transition.form_submit': '表单提交',
    'transition.reload': '重新加载',
    'transition.keyword': '搜索关键字',
    'transition.keyword_generated': '关键字跳转'
  },

  en: {
    // app / navigation
    'app.name': 'Edge-style History',
    'app.tagline': 'EDGE STYLE',
    'app.brand': 'History',
    'app.pageTitleHistory': 'History · Edge-style History',
    'app.pageTitleClosed': 'Recently closed · Edge-style History',
    'app.pageTitleDevices': 'Tabs from other devices · Edge-style History',
    'app.popupTitle': 'History',
    'app.demoBadge': 'Demo data',
    'app.demoPill': 'Demo',
    'nav.aria': 'History navigation',
    'nav.history': 'History',
    'nav.closed': 'Recently closed',
    'nav.devices': 'Other devices',
    'sidebar.shortcut': 'Open history anytime',
    'sidebar.shortcutTitle': 'Change this shortcut at chrome://extensions/shortcuts',
    'sidebar.shortcutTitleMac': 'Option + Shift + H. Change it at chrome://extensions/shortcuts',
    'sidebar.themeToggle': 'Toggle theme',
    'sidebar.settings': 'Settings',
    'theme.systemDark': 'System (currently dark)',
    'theme.systemLight': 'System (currently light)',
    'theme.dark': 'Dark',
    'theme.light': 'Light',
    'theme.toggleTitle': 'Theme: {label}. Click to switch.',
    'view.history.title': 'History',
    'view.history.subtitle': 'Browse, search and manage your history by date',
    'view.closed.title': 'Recently closed',
    'view.closed.subtitle': 'Restore recently closed tabs and windows',
    'view.devices.title': 'Tabs from other devices',
    'view.devices.subtitle': 'Open tabs that are active on your other devices',

    // common
    'common.select': 'Select',
    'common.done': 'Done',
    'common.export': 'Export',
    'common.clear': 'Clear',
    'common.refresh': 'Refresh',
    'common.refreshing': 'Refreshing…',
    'common.loading': 'Loading…',
    'common.loadingMore': 'Loading more…',
    'common.retry': 'Retry',
    'common.close': 'Close',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.clearSearch': 'Clear search',
    'common.showAllTime': 'Show all time',
    'common.loadMore': 'Load more',
    'common.startDate': 'Start date',
    'common.endDate': 'End date',
    'common.apply': 'Apply',
    'common.settings': 'Settings',
    'common.visit': 'Visit',
    'common.unknown': 'Unknown',
    'common.untitledTab': 'Untitled tab',
    'common.selectAllLoaded': 'Select all loaded',
    'common.deselectAll': 'Deselect all',
    'common.cancelSelection': 'Clear selection',
    'common.exitSelection': 'Exit selection mode',
    'common.deleteSelected': 'Delete',
    'common.version': 'Version {version}',

    // counts / plurals
    'count.group_one': '1 item',
    'count.group_other': '{count} items',
    'count.total_one': '1 item',
    'count.total_other': '{count} items',
    'count.loaded_one': '1 loaded',
    'count.loaded_other': '{count} loaded',
    'count.search_one': '1 result',
    'count.search_other': '{count} results',
    'count.zero': '0 items',
    'count.loading': 'Loading…',
    'count.failed': 'Failed to load',
    'count.closed_one': '1 closed item',
    'count.closed_other': '{count} closed items',
    'count.matches_one': '1 match',
    'count.matches_other': '{count} matches',
    'count.devices_one': '1 device',
    'count.devices_other': '{count} devices',
    'count.tabs_one': '1 tab',
    'count.tabs_other': '{count} tabs',
    'count.windows_one': '1 window',
    'count.windows_other': '{count} windows',
    'count.matchingTabs_one': '1 matching tab',
    'count.matchingTabs_other': '{count} matching tabs',
    'count.visits_one': '1 visit',
    'count.visits_other': '{count} visits',
    'count.visitsShort_one': '1 visit',
    'count.visitsShort_other': '{count} visits',
    'count.allLoaded_one': 'Showing all 1 item',
    'count.allLoaded_other': 'Showing all {count} items',
    'count.deleted_one': 'Deleted 1 item',
    'count.deleted_other': 'Deleted {count} items',

    // ranges
    'range.all': 'All time',
    'range.hour': 'Last hour',
    'range.24h': 'Last 24 hours',
    'range.today': 'Today',
    'range.yesterday': 'Yesterday',
    'range.7d': 'Last 7 days',
    'range.30d': 'Last 30 days',
    'range.custom': 'Custom range',
    'range.customEllipsis': 'Custom range…',
    'range.earliest': 'Earliest',
    'range.now': 'Now',
    'range.heading': 'Time range',
    'range.menuAria': 'Time range',
    'range.filterAria': 'Filter by time',
    'range.startDate': 'Start date',
    'range.endDate': 'End date',
    'range.apply': 'Apply',
    'range.chooseBoth': 'Choose both a start and end date',
    'range.invalidDate': 'Invalid date',
    'range.order': 'The start date must be before the end date',
    'range.future': 'Future dates are not allowed',

    // dates
    'time.today': 'Today',
    'time.yesterday': 'Yesterday',
    'time.justNow': 'Just now',
    'time.todayAt': 'Today {time}',
    'time.yesterdayAt': 'Yesterday {time}',

    // history page
    'history.listAria': 'Browsing history',
    'history.clear': 'Clear history',
    'history.searchPlaceholder': 'Search history (title or URL)',
    'history.searchAria': 'Search history',
    'history.searchClosedPlaceholder': 'Search recently closed (title or URL)',
    'history.searchDevicesPlaceholder': 'Search tabs from other devices',
    'history.readErrorTitle': 'Could not read history',
    'history.apiError': 'Chrome history API is unavailable. Open this page as an extension, or use ?demo=1 to preview.',
    'history.initError': 'Failed to initialize the page: {error}',
    'history.noResultsTitle': 'No matching history',
    'history.noResultsText': 'No titles or URLs match “{query}”. Try another keyword or change the time range.',
    'history.emptyRangeTitle': 'No history in this time range',
    'history.emptyRangeText': 'The current filter is “{range}”. Try another range or view all history.',
    'history.emptyTitle': 'No history yet',
    'history.emptyText': 'Pages you visit will appear here grouped by date. You can also search by title or URL.',
    'history.loadFailed': 'Failed to load: {error}',
    'history.allLoaded_one': 'Showing all 1 item',
    'history.allLoaded_other': 'Showing all {count} items',
    'history.scrollMore': 'Scroll to load more',
    'history.selectModeAnnounce': 'Selection mode enabled',
    'history.bulkSelectedHtml': '{count} selected',
    'history.selectAll': 'Select all loaded',
    'history.deselectAll': 'Deselect all',
    'history.cancelSelection': 'Clear selection',
    'history.bulkDelete': 'Delete',
    'history.bulkExit': 'Exit selection mode',
    'history.bulkDeleteTitle': 'Delete selected history?',
    'history.bulkDeleteMessage_one': 'This deletes every visit for 1 selected item. Chrome stores history per URL, so all visits to that URL are removed, not just one visit.',
    'history.bulkDeleteMessage_other': 'This deletes every visit for {count} selected items. Chrome stores history per URL, so all visits to those URLs are removed, not just one visit.',
    'history.bulkDeleteNote': 'This cannot be undone. Cookies, cache and bookmarks are not affected.',
    'history.deleteNothing': 'No items were deleted. Try again',
    'history.rowSelect': 'Select {title}',
    'history.rowMore': 'More actions',
    'history.menuOpen': 'Open in new tab',
    'history.menuCopy': 'Copy link',
    'history.menuVisits': 'View visits',
    'history.menuDelete': 'Delete this item',
    'history.menuDeleteSite': 'Delete all history for {site}',
    'history.menuDeleteSiteFallback': 'Delete all history for this site',
    'history.copySuccess': 'Link copied',
    'history.copyFailure': 'Copy failed. Select the URL manually',
    'history.deleteMergedNote': 'This item merged {count} URL variants; all of them will be deleted.',
    'history.deleteTitle': 'Delete this history item?',
    'history.deleteMessage': 'This deletes every visit to “{title}” ({visits}). {mergedNote}Chrome stores history per URL, so individual visits cannot be removed.',
    'history.deleteNote': 'This cannot be undone.',
    'history.deleteSuccess': 'Item deleted',
    'history.deleteFailed': 'Delete failed. Try again',
    'history.deleteSiteTitle': 'Delete history for this site?',
    'history.deleteSiteMessage': 'This deletes every visit for every URL on {label} (not subdomains), including items not currently displayed. Chrome stores history per URL, so individual visits cannot be removed.',
    'history.deleteSiteNote': 'This cannot be undone and may take a few seconds.',
    'history.deleteSiteConfirm': 'Delete all',
    'history.deleteSiteProgress': 'Deleting history for {label}…',
    'history.deleteSitePartial_one': 'Deleted 1 item; some site history could not be collected and may remain',
    'history.deleteSitePartial_other': 'Deleted {count} items; some site history could not be collected and may remain',
    'history.deleteSiteSuccess_one': 'Deleted 1 item for {label}',
    'history.deleteSiteSuccess_other': 'Deleted {count} items for {label}',
    'history.visits.title': 'Visits',
    'history.visits.loading': 'Loading visits…',
    'history.visits.summary': 'This URL has {visits}{truncated}.',
    'history.visits.truncated': '; showing the latest {shown}',
    'history.visits.empty': 'No visit details available.',
    'history.visits.error': 'Could not load visits: {error}',

    // recently closed
    'closed.listAria': 'Recently closed tabs',
    'closed.limitNote': 'Chrome keeps the 25 most recent closed items',
    'closed.metaLoading': 'Loading…',
    'closed.metaFailed': 'Failed to load',
    'closed.loadingTitle': 'Loading recently closed items',
    'closed.readErrorTitle': 'Could not read recently closed tabs',
    'closed.emptyTitle': 'No recently closed tabs',
    'closed.emptyText': 'Tabs and windows you close will appear here so you can restore them.',
    'closed.noMatchesTitle': 'No matching closed items',
    'closed.noMatchesText': 'No recently closed tabs match “{query}”.',
    'closed.unnamedTab': 'Untitled tab',
    'closed.unknownTime': 'Recently closed',
    'closed.restore': 'Restore',
    'closed.restoreTab': 'Restore tab',
    'closed.restoreTabAria': 'Restore {title}',
    'closed.windowTitle': 'Window · {tabs}',
    'closed.multipleTabs': 'Multiple tabs',
    'closed.restoreWindow': 'Restore window',
    'closed.restoreWindowAria_one': 'Restore window with 1 tab',
    'closed.restoreWindowAria_other': 'Restore window with {count} tabs',
    'closed.restoredWindow': 'Window restored',
    'closed.restoredTab': 'Tab restored',
    'closed.restoreFailed': 'Restore failed. Try again',
    'closed.restoreFailedWithError': 'Restore failed: {error}',

    // devices
    'devices.listAria': 'Tabs from other devices',
    'devices.note': 'Sign in to Chrome and turn on sync',
    'devices.metaLoading': 'Loading…',
    'devices.metaFailed': 'Failed to load',
    'devices.loadingTitle': 'Loading synced tabs',
    'devices.readErrorTitle': 'Could not read tabs from other devices',
    'devices.emptyTitle': 'No tabs from other devices yet',
    'devices.emptyText': 'Chrome did not return any synced sessions. Tabs from other devices require signing in to the same Google account and enabling “Open tabs” in sync settings.',
    'devices.step1': 'Sign in to your Google account in Chrome on this computer.',
    'devices.step2': 'Turn on sync and select “Open tabs”.',
    'devices.step3': 'Keep Chrome open on your phone or another computer, then refresh.',
    'devices.openSync': 'Open Chrome sync settings',
    'devices.noMatchesTitle': 'No matching tabs',
    'devices.noMatchesText': 'No tabs from other devices match “{query}”.',
    'devices.unknown': 'Unknown device',
    'devices.windowTitle': 'Window · {tabs}',
    'devices.searchPlaceholder': 'Search tabs from other devices',
    'devices.syncCopied': 'Sync settings address copied. Open it in the address bar',
    'devices.syncFallback': 'Open chrome://settings/syncSetup in the address bar',

    // welcome
    'welcome.title': 'Welcome to Edge-style History',
    'welcome.local': 'Local only',
    'welcome.bodyBefore': 'Date grouping, search filters, recently closed and tabs from other devices are all here. Pin the extension to the toolbar, or press',
    'welcome.bodyAfter': 'anytime.',
    'welcome.note': 'Chrome does not allow extensions to replace chrome://history or Ctrl+H. Pin this page for quick access.',
    'welcome.dismiss': 'Got it',
    'welcome.close': 'Close welcome banner',

    // settings
    'settings.title': 'Settings',
    'settings.appearance': 'Appearance',
    'settings.theme': 'Theme',
    'settings.themeHint': 'Follow the system, or use light or dark.',
    'settings.themeSystem': 'System',
    'settings.themeLight': 'Light',
    'settings.themeDark': 'Dark',
    'settings.language': 'Language',
    'settings.languageHint': 'Choose the interface language. Changes apply immediately and sync to your other devices.',
    'settings.languageSystem': 'Follow browser',
    'settings.languageZh': 'Chinese (Simplified)',
    'settings.languageEn': 'English',
    'settings.showVisitCounts': 'Show visit counts',
    'settings.showVisitCountsHint': 'Show the total visit count for each page.',
    'settings.mergeDuplicates': 'Merge duplicate pages',
    'settings.mergeDuplicatesHint': 'Merge pages with the same site, title and path; query strings, # fragments and trailing post numbers are ignored.',
    'settings.openInNewTab': 'Open in a new tab',
    'settings.openInNewTabHint': 'Keep this page open when you click a history item. You can also hold Ctrl / ⌘ to open it in a new tab.',
    'settings.data': 'Data',
    'settings.clear': 'Clear browsing history',
    'settings.clearHint': 'Clears history only. Cookies, cache, downloads and bookmarks are not affected.',
    'settings.clearButton': 'Clear…',
    'settings.syncHint': 'Settings sync to your other devices through Chrome. Without sign-in or sync, they are saved on this device only.',
    'settings.privacyNote': 'This extension uploads nothing and makes no network requests or analytics calls. History, recently closed items and synced tabs are read directly from Chrome local APIs.',
    'settings.shortcuts': 'Shortcuts',
    'settings.shortcutOpen': 'Open full history',
    'settings.shortcutHint': 'Current shortcut: {shortcut}. Chrome does not allow extensions to use Ctrl+H; change it on the extension shortcuts page.',
    'settings.copyShortcutPath': 'Copy settings URL',
    'settings.shortcutNote': 'Open {path} and find “Edge-style History” to customize the shortcut.',
    'settings.about': 'About',
    'settings.aboutName': 'Edge-style History',
    'settings.aboutBody': 'Brings date grouping, search filters and recently closed tabs to Chrome.',
    'settings.version': 'Version {version}',
    'settings.localNoTracking': 'Local only · No tracking',
    'settings.aboutNote': 'Due to Chrome extension restrictions, this extension cannot replace {history} or Ctrl+H, and cannot read Edge history. Tabs from other devices depend on Chrome Sync.',
    'settings.done': 'Done',
    'settings.copyShortcutSuccess': 'Shortcut settings URL copied',
    'settings.copyShortcutFallback': 'Copy failed. Enter chrome://extensions/shortcuts manually',
    'settings.syncUnavailable': 'Settings saved on this device; Chrome Sync is currently unavailable.',
    'settings.saveFailed': 'Could not save settings. Try again.',

    // clear
    'clear.title': 'Clear history',
    'clear.intro': 'Choose a time range. This only deletes Chrome browsing history; cookies, cache, downloads and bookmarks are not affected.',
    'clear.rangeLabel': 'Time range',
    'clear.hour': 'Last hour',
    'clear.today': 'Today',
    'clear.7d': 'Last 7 days',
    'clear.30d': 'Last 30 days',
    'clear.all': 'All time',
    'clear.custom': 'Custom range…',
    'clear.startDate': 'Start date',
    'clear.endDate': 'End date',
    'clear.nativeNote': 'Cookies, cache and downloads must be cleared in Chrome “Clear browsing data”.',
    'clear.openChrome': 'Open Chrome Clear browsing data',
    'clear.warning': 'Cleared history cannot be restored. Whether synced history on other devices is affected depends on Chrome Sync.',
    'clear.ack': 'I understand this cannot be undone',
    'clear.cancel': 'Cancel',
    'clear.confirm': 'Clear history',
    'clear.clearing': 'Clearing…',
    'clear.empty': 'There is no history to clear in this range',
    'clear.success': 'History cleared',
    'clear.failed': 'Clear failed: {error}',
    'clear.copied': 'Address copied. Open it in the address bar',
    'clear.copyFallback': 'Open chrome://settings/clearBrowserData in the address bar',

    // export
    'export.title': 'Export browsing data',
    'export.intro': 'Export browsing history to a local file. It contains only titles, URLs, visit counts and last visit times; no cookies, cache, passwords or downloads.',
    'export.scope': 'Scope',
    'export.scopeAll': 'All history',
    'export.scopeCurrent': 'Current search / time filter',
    'export.format': 'File format',
    'export.csv': 'CSV (opens in Excel)',
    'export.json': 'JSON',
    'export.note': 'Exported files may contain sensitive browsing history. Keep them safe.',
    'export.cancel': 'Cancel',
    'export.confirm': 'Export',
    'export.exporting': 'Exporting…',
    'export.exportingCount': 'Exporting… {count} items',
    'export.empty': 'No history to export',
    'export.success': 'Exported {count} items',
    'export.failed': 'Export failed: {error}',
    'export.scopeLabelCurrent': 'Current filter',
    'export.scopeLabelAll': 'All history',
    'export.headerTitle': 'Title',
    'export.headerUrl': 'URL',
    'export.headerVisitCount': 'Visit count',
    'export.headerLastVisit': 'Last visit time',

    // popup
    'popup.fullPage': 'Full page',
    'popup.openFullAria': 'Open full history',
    'popup.openFullTitle': 'Open full history ({shortcut})',
    'popup.settings': 'Settings',
    'popup.demo': 'Demo',
    'popup.tabsAria': 'History views',
    'popup.historyTab': 'History',
    'popup.closedTab': 'Recently closed',
    'popup.filterAria': 'Filter by time',
    'popup.menuAria': 'Time range',
    'popup.byDate': 'By date',
    'popup.closedMeta': 'Recently closed',
    'popup.historyListAria': 'Browsing history',
    'popup.closedListAria': 'Recently closed tabs',
    'popup.searchHistory': 'Search history',
    'popup.searchClosed': 'Search recently closed',
    'popup.searchClear': 'Clear search',
    'popup.initError': 'The popup failed to load. Open full history.',
    'popup.readErrorTitle': 'Could not read history',
    'popup.noResultsTitle': 'No matching history',
    'popup.noResultsText': 'No titles or URLs match your search.',
    'popup.emptyRangeTitle': 'No items in this time range',
    'popup.emptyRangeText': 'Current filter: {range}',
    'popup.emptyTitle': 'No browsing history yet',
    'popup.emptyText': 'Pages you visit will appear here grouped by date.',
    'popup.closedEmptyTitle': 'No recently closed tabs',
    'popup.closedEmptyText': 'Tabs and windows you close can be restored here.',
    'popup.closedNoMatchesTitle': 'No matching closed items',
    'popup.closedNoMatchesText': 'No recently closed tabs match “{query}”.',
    'popup.closedErrorTitle': 'Could not read recently closed',
    'popup.closedTabFallback': 'Tab',
    'popup.closedMultipleTabs': 'Multiple tabs',
    'popup.closedWindow': 'Window · {tabs}',
    'popup.closedRestoreAria': 'Restore {title}',
    'popup.closedRestoreTitle': 'Restore tab',
    'popup.closedRestoreWindow': 'Restore window',
    'popup.closedRestoreWindowAria_one': 'Restore window with 1 tab',
    'popup.closedRestoreWindowAria_other': 'Restore window with {count} tabs',
    'popup.closedRestoredWindow': 'Window restored',
    'popup.closedRestoredTab': 'Tab restored',
    'popup.closedRestoreFailed': 'Restore failed. Try again',

    // errors / urls / transitions
    'error.unknown': 'Unknown error',
    'error.tabClosed': 'The page may have been closed',
    'error.syncUnavailable': 'Chrome Sync or sessions are currently unavailable',
    'error.openType': 'Chrome does not allow extensions to open this type of page directly. Copy the link and open it in the address bar',
    'error.openTypeShort': 'Chrome does not allow extensions to open this type of page directly',
    'error.openPage': 'Could not open the page',
    'error.openFull': 'Could not open full history',
    'url.localFile': 'Local file',
    'transition.link': 'Link',
    'transition.typed': 'Typed',
    'transition.auto_bookmark': 'Bookmark',
    'transition.auto_subframe': 'Subframe',
    'transition.manual_subframe': 'Manual subframe',
    'transition.generated': 'Redirect',
    'transition.auto_toplevel': 'Auto open',
    'transition.form_submit': 'Form submit',
    'transition.reload': 'Reload',
    'transition.keyword': 'Keyword',
    'transition.keyword_generated': 'Generated keyword'
  }
};

let currentPreference = 'system';
let currentLocale = 'zh-CN';
let pluralRules = new Intl.PluralRules(currentLocale);
const numberFormatters = new Map();

function formatNumber(value) {
  let formatter = numberFormatters.get(currentLocale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(currentLocale);
    numberFormatters.set(currentLocale, formatter);
  }
  return formatter.format(Number(value) || 0);
}

function readCachedPreference() {
  try {
    const value = globalThis.localStorage?.getItem(LANGUAGE_CACHE_KEY);
    return LANGUAGES.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

function cachePreference(value) {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_CACHE_KEY, value);
  } catch {
    // localStorage is only a startup cache.
  }
}

export function normalizeLanguagePreference(value) {
  return LANGUAGES.includes(value) ? value : 'system';
}

export function resolveLocale(preference, browserLanguage = globalThis.navigator?.language || '') {
  const value = normalizeLanguagePreference(preference);
  if (value === 'zh-CN' || value === 'en') return value;
  return /^zh(?:-|$)/i.test(String(browserLanguage)) ? 'zh-CN' : 'en';
}

export function setLanguage(preference) {
  currentPreference = normalizeLanguagePreference(preference);
  currentLocale = resolveLocale(currentPreference);
  pluralRules = new Intl.PluralRules(currentLocale);
  cachePreference(currentPreference);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = currentLocale;
  }
  return currentLocale;
}

export function getLanguagePreference() {
  return currentPreference;
}

export function getLocale() {
  return currentLocale;
}

function interpolate(template, params) {
  if (!params) return template;
  return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => (
    Object.hasOwn(params, key) ? String(params[key] ?? '') : match
  ));
}

export function t(key, params = {}) {
  let template = MESSAGES[currentLocale]?.[key];
  if (params.count !== undefined) {
    const category = pluralRules.select(Number(params.count) || 0);
    template = MESSAGES[currentLocale]?.[`${key}_${category}`]
      ?? MESSAGES[currentLocale]?.[`${key}_other`]
      ?? template;
  }
  if (template === undefined) {
    template = MESSAGES.en?.[key];
  }
  if (template === undefined) return key;

  // Counts are formatted with Intl (5,000 rather than 5000). A caller may pass
  // a pre-built HTML string for count (the bulk bar does), in which case it is
  // intentionally left untouched.
  const values = typeof params.count === 'number'
    ? { ...params, count: formatNumber(params.count) }
    : params;
  return interpolate(template, values);
}

/**
 * Translate static markup. Supported hooks:
 *   data-i18n, data-i18n-html, data-i18n-placeholder,
 *   data-i18n-title, data-i18n-aria-label
 */
export function applyI18n(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope?.querySelectorAll) return;

  for (const element of scope.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of scope.querySelectorAll('[data-i18n-html]')) {
    element.innerHTML = t(element.dataset.i18nHtml);
  }
  for (const element of scope.querySelectorAll('[data-i18n-placeholder]')) {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
  }
  for (const element of scope.querySelectorAll('[data-i18n-title]')) {
    element.setAttribute('title', t(element.dataset.i18nTitle));
  }
  for (const element of scope.querySelectorAll('[data-i18n-aria-label]')) {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  }

  if (typeof document !== 'undefined') {
    document.documentElement.lang = currentLocale;
  }
}

// Resolve the startup language before the first render. A cached preference
// keeps the popup/full page from flashing the wrong language on slow storage.
currentPreference = readCachedPreference();
setLanguage(currentPreference);
