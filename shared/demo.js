/**
 * Local demo mode.
 *
 * Loading history.html?demo=1 outside the packaged extension supplies a small
 * in-memory chrome.history / chrome.sessions implementation. It makes design
 * review and screenshots possible without touching a real browser profile.
 * Inside the extension (where chrome.history exists) this module is inert.
 */

const params = new URLSearchParams(location.search);
const shouldInstall = params.has('demo') && !(globalThis.chrome && globalThis.chrome.history);

if (shouldInstall) {
  globalThis.__demoChrome = createDemoChrome(params);
}

function createDemoChrome(params) {
  const MINUTE = 60 * 1000;
  const NOW = Date.now();
  let sequence = 0;

  const makeEntry = (title, url, lastVisitTime, visitCount = 1) => ({
    id: ++sequence,
    title,
    url,
    lastVisitTime,
    visitCount,
    typedCount: 0
  });

  const entry = (title, url, minutesAgo, visitCount = 1) => (
    makeEntry(title, url, NOW - minutesAgo * MINUTE, visitCount)
  );

  let history = [
    entry('GitHub · Build software better, together', 'https://github.com/', 8, 14),
    entry('chrome.history | API reference', 'https://developer.chrome.com/docs/extensions/reference/api/history', 24, 6),
    entry('History API - Web APIs | MDN', 'https://developer.mozilla.org/zh-CN/docs/Web/API/History_API', 51, 3),
    entry('如何评价 Microsoft Edge 的历史记录页面？ - 知乎', 'https://www.zhihu.com/question/584920173', 78, 8),
    entry('How to read Chrome history from an extension? - Stack Overflow', 'https://stackoverflow.com/questions/78912345/chrome-history-extension', 136, 4),
    entry('【4K】城市夜景漫步 · 第 12 期_哔哩哔哩_bilibili', 'https://www.bilibili.com/video/BV1xx411c7mD', 188, 2),
    entry('History redesign – Exploration – Figma', 'https://www.figma.com/file/8pQ2mHk9/History-redesign', 276, 5),
    entry('lofi hip hop radio 📚 beats to relax/study to - YouTube', 'https://www.youtube.com/watch?v=jfKfPfyJRdk', 360, 9),
    entry('Edge 浏览器 10 个被低估的效率技巧 - 少数派', 'https://sspai.com/post/81234', 488, 2),
    entry('DeepSeek - 探索未至之境', 'https://chat.deepseek.com/', 610, 12),
    entry('chrome history api maxresults - Google 搜索', 'https://www.google.com/search?q=chrome+history+api+maxresults', 1480, 3),
    entry('GitHub - chrome-extensions/history-ui: Edge-like history for Chrome', 'https://github.com/chrome-extensions/history-ui', 1540, 7),
    entry('History UI - Chrome Web Store', 'https://chromewebstore.google.com/detail/history-ui/abcdefghijklmnop', 1620, 2),
    entry('Microsoft Edge - 维基百科，自由的百科全书', 'https://zh.wikipedia.org/wiki/Microsoft_Edge', 1700, 1),
    entry('history - npm', 'https://www.npmjs.com/package/history', 1810, 4),
    entry('浏览器历史记录的设计演进 - 36氪', 'https://36kr.com/p/2456789012345', 1950, 2),
    entry('Manifest V3 迁移指南 - 掘金', 'https://juejin.cn/post/7261234567890123456', 2880, 5),
    entry('产品路线图 · Q4 - Notion', 'https://www.notion.so/workspace/Product-Roadmap-Q4-9f8e7d6c', 3120, 3),
    entry('History UI - Dribbble', 'https://dribbble.com/shots/22123456-History-UI', 4380, 4),
    entry('Chrome DevTools (@ChromeDevTools) / X', 'https://x.com/ChromeDevTools', 4620, 6),
    entry('r/chrome - Reddit', 'https://www.reddit.com/r/chrome/', 5900, 2),
    entry('Google 地图', 'https://www.google.com/maps', 7200, 3),
    entry('Gmail', 'https://mail.google.com/mail/u/0/#inbox', 8600, 11),
    entry('Google 日历', 'https://calendar.google.com/calendar/u/0/r/week', 8720, 5),
    entry('ChatGPT', 'https://chatgpt.com/', 12900, 8),
    entry('飞书 - 先进团队，先用飞书', 'https://www.feishu.cn/product/messenger', 14400, 4),
    entry('微信公众平台', 'https://mp.weixin.qq.com/', 15800, 2),
    entry('豆瓣电影 - 最近热门电影', 'https://movie.douban.com/', 17200, 3),
    entry('网易云音乐 - 发现音乐', 'https://music.163.com/#/discover', 21600, 7),
    entry('36氪 - 让一部分人先看到未来', 'https://36kr.com/', 28800, 5),
    entry('V2EX - 创意工作者们的社区', 'https://www.v2ex.com/', 43200, 6),
    entry('Hacker News', 'https://news.ycombinator.com/', 57600, 9),
    entry('Product Hunt – The best new products', 'https://www.producthunt.com/', 86400, 3),
    entry('设置 - Chrome', 'chrome://settings/', 100000, 2),
    entry('历史记录 - Chrome', 'chrome://history/', 100100, 4),
    entry('history-ideas.md - 本地文件', 'file:///home/user/notes/history-ideas.md', 115000, 1)
  ];

  const tab = (sessionId, title, url) => ({ sessionId, title, url });
  let closed = [
    {
      lastModified: NOW - 8 * MINUTE,
      window: {
        sessionId: 4101,
        tabs: [
          tab(4101, 'chrome.history | API reference', 'https://developer.chrome.com/docs/extensions/reference/api/history'),
          tab(4101, 'How to read Chrome history from an extension? - Stack Overflow', 'https://stackoverflow.com/questions/78912345/chrome-history-extension'),
          tab(4101, 'History API - Web APIs | MDN', 'https://developer.mozilla.org/zh-CN/docs/Web/API/History_API'),
          tab(4101, 'GitHub · Build software better, together', 'https://github.com/')
        ]
      }
    },
    {
      lastModified: NOW - 36 * MINUTE,
      tab: tab(4102, '如何评价 Microsoft Edge 的历史记录页面？ - 知乎', 'https://www.zhihu.com/question/584920173')
    },
    {
      lastModified: NOW - 3 * 60 * MINUTE,
      window: {
        sessionId: 4103,
        tabs: [
          tab(4103, '【4K】城市夜景漫步 · 第 12 期_哔哩哔哩_bilibili', 'https://www.bilibili.com/video/BV1xx411c7mD'),
          tab(4103, 'lofi hip hop radio 📚 - YouTube', 'https://www.youtube.com/watch?v=jfKfPfyJRdk')
        ]
      }
    },
    {
      lastModified: NOW - 22 * 60 * MINUTE,
      tab: tab(4104, 'History redesign – Exploration – Figma', 'https://www.figma.com/file/8pQ2mHk9/History-redesign')
    },
    {
      lastModified: NOW - 2 * 24 * 60 * MINUTE,
      window: {
        sessionId: 4105,
        tabs: [
          tab(4105, 'Manifest V3 迁移指南 - 掘金', 'https://juejin.cn/post/7261234567890123456'),
          tab(4105, 'chrome.history | API reference', 'https://developer.chrome.com/docs/extensions/reference/api/history'),
          tab(4105, '产品路线图 · Q4 - Notion', 'https://www.notion.so/workspace/Product-Roadmap-Q4-9f8e7d6c')
        ]
      }
    },
    {
      lastModified: NOW - 4 * 24 * 60 * MINUTE,
      tab: tab(4106, 'History UI - Dribbble', 'https://dribbble.com/shots/22123456-History-UI')
    }
  ];

  let devices = [
    {
      deviceName: 'MacBook Pro',
      sessions: [
        {
          lastModified: NOW - 12 * MINUTE,
          window: {
            tabs: [
              tab(5101, 'chrome.history | API reference', 'https://developer.chrome.com/docs/extensions/reference/api/history'),
              tab(5101, 'History API - Web APIs | MDN', 'https://developer.mozilla.org/zh-CN/docs/Web/API/History_API'),
              tab(5101, 'GitHub - chrome-extensions/history-ui', 'https://github.com/chrome-extensions/history-ui')
            ]
          }
        },
        {
          lastModified: NOW - 2 * 60 * MINUTE,
          window: {
            tabs: [
              tab(5102, 'Figma – History redesign', 'https://www.figma.com/file/8pQ2mHk9/History-redesign'),
              tab(5102, 'Dribbble - History UI', 'https://dribbble.com/shots/22123456-History-UI')
            ]
          }
        }
      ]
    },
    {
      deviceName: 'Surface Laptop 5',
      sessions: [
        {
          lastModified: NOW - 58 * MINUTE,
          window: {
            tabs: [
              tab(5201, 'Microsoft Edge - 维基百科', 'https://zh.wikipedia.org/wiki/Microsoft_Edge'),
              tab(5201, 'Edge 浏览器 10 个被低估的效率技巧 - 少数派', 'https://sspai.com/post/81234'),
              tab(5201, '36氪 - 让一部分人先看到未来', 'https://36kr.com/'),
              tab(5201, 'V2EX', 'https://www.v2ex.com/')
            ]
          }
        }
      ]
    },
    {
      deviceName: 'iPhone 15',
      sessions: [
        {
          lastModified: NOW - 3 * 60 * MINUTE,
          window: {
            tabs: [
              tab(5301, '如何评价 Microsoft Edge 的历史记录页面？ - 知乎', 'https://www.zhihu.com/question/584920173'),
              tab(5301, '豆瓣电影 - 最近热门电影', 'https://movie.douban.com/'),
              tab(5301, 'DeepSeek - 探索未至之境', 'https://chat.deepseek.com/')
            ]
          }
        }
      ]
    }
  ];

  /**
   * Test-only demo fixtures driven by query parameters. Default demo data is
   * unchanged so screenshots and the 36-row baseline stay stable.
   */
  function buildSyntheticHistory(count, tie) {
    const rows = [];
    const today = new Date(NOW);
    today.setHours(0, 0, 0, 0);
    const boundary = today.getTime();
    const split = Math.ceil(count / 2);

    for (let index = 0; index < count; index += 1) {
      const lastVisitTime = tie
        ? (index < split ? boundary - 1 : boundary)
        : NOW - (index + 1) * 5 * MINUTE;
      rows.push(makeEntry(
        `Fixture page ${index + 1}`,
        `https://fixture.example.com/page/${index + 1}`,
        lastVisitTime,
        1 + (index % 7)
      ));
    }
    return rows;
  }

  function buildDuplicateHistory() {
    const rows = [];
    const variants = [
      '/topic/123/21',
      '/topic/123/23',
      '/topic/123/21?page=2',
      '/topic/123/23#reply',
      '/topic/123/21/'
    ];
    variants.forEach((path, index) => {
      rows.push(makeEntry(
        'Duplicate thread',
        `https://dupe.example.com${path}`,
        NOW - (index + 1) * 1000,
        2
      ));
    });
    rows.push(makeEntry('Duplicate thread', 'https://dupe.example.com/topic/456/1', NOW - 10 * 1000, 1));
    rows.push(makeEntry('Duplicate thread', 'https://dupe.example.com/topic/456/2', NOW - 11 * 1000, 1));
    rows.push(makeEntry('Other title', 'https://dupe.example.com/topic/123/22', NOW - 12 * 1000, 3));
    return rows;
  }

  const requestedCount = Number(params.get('count'));
  if (params.get('empty') === '1') {
    history = [];
    closed = [];
    devices = [];
  } else if (params.get('duplicates') === '1') {
    history = buildDuplicateHistory();
  } else if (Number.isInteger(requestedCount) && requestedCount > 0) {
    history = buildSyntheticHistory(Math.min(requestedCount, 20000), params.get('tie') === '1');
  }

  const visitsByUrl = new Map();
  function buildVisits(item) {
    const count = Math.max(1, item.visitCount || 1);
    const transitions = ['link', 'typed', 'reload', 'link', 'keyword', 'form_submit'];
    return Array.from({ length: Math.min(count, 12) }, (_, index) => ({
      visitId: item.id * 100 + index,
      visitTime: item.lastVisitTime - index * 37 * MINUTE,
      transition: index === 0 ? 'link' : transitions[index % transitions.length]
    })).sort((a, b) => b.visitTime - a.visitTime);
  }

  const requestedLanguage = params.get('lang') || '';
  const storageData = {
    theme: params.get('theme') || 'system',
    language: requestedLanguage === 'en'
      ? 'en'
      : requestedLanguage.startsWith('zh') ? 'zh-CN' : 'system',
    showVisitCounts: true,
    openInNewTab: false,
    pageSize: 200,
    mergeDuplicates: true,
    welcomeDismissed: true
  };

  // Demo pages use the same sync-first settings API as the real extension.
  // Both areas share one in-memory store so a save is visible everywhere.
  const storageListeners = new Set();
  function createStorageArea(areaName) {
    return {
      async get(defaults) {
        if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
          return { ...storageData };
        }
        const result = {};
        for (const [key, fallback] of Object.entries(defaults)) {
          result[key] = key in storageData ? storageData[key] : fallback;
        }
        return result;
      },
      async set(patch) {
        const previous = { ...storageData };
        Object.assign(storageData, patch);
        const changes = {};
        for (const key of Object.keys(patch)) {
          changes[key] = { oldValue: previous[key], newValue: storageData[key] };
        }
        for (const listener of [...storageListeners]) {
          try {
            listener(changes, areaName);
          } catch {
            // Demo listeners are best-effort, matching chrome.storage.
          }
        }
      }
    };
  }
  const storageLocal = createStorageArea('local');
  const storageSync = createStorageArea('sync');
  const storageOnChanged = {
    addListener(listener) {
      storageListeners.add(listener);
    },
    removeListener(listener) {
      storageListeners.delete(listener);
    }
  };

  function matchText(item, text) {
    if (!text) return true;
    const haystack = `${item.title} ${item.url}`.toLocaleLowerCase();
    return text
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => haystack.includes(token));
  }

  const api = {
    runtime: {
      getURL: (path) => path,
      getManifest: () => ({ version: '1.4.0' }),
      getContexts: undefined
    },
    storage: {
      local: storageLocal,
      sync: storageSync,
      onChanged: storageOnChanged
    },
    history: {
      async search({ text = '', startTime = 0, endTime = Date.now(), maxResults = 100 } = {}) {
        return history
          // Chrome treats endTime as exclusive; mirror that so pagination
          // behaves the same in the offline demo.
          .filter((item) => item.lastVisitTime >= startTime && item.lastVisitTime < endTime && matchText(item, text))
          .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
          .slice(0, maxResults)
          .map((item) => ({ ...item }));
      },
      async getVisits({ url }) {
        const item = history.find((candidate) => candidate.url === url);
        if (!item) return [];
        if (!visitsByUrl.has(url)) visitsByUrl.set(url, buildVisits(item));
        return visitsByUrl.get(url).map((visit) => ({ ...visit }));
      },
      async deleteUrl({ url }) {
        history = history.filter((item) => item.url !== url);
        visitsByUrl.delete(url);
      },
      async deleteRange({ startTime, endTime }) {
        // Chrome treats endTime as exclusive.
        history = history.filter((item) => item.lastVisitTime < startTime || item.lastVisitTime >= endTime);
      },
      async deleteAll() {
        history = [];
        visitsByUrl.clear();
      }
    },
    sessions: {
      onChanged: { addListener() {} },
      async getRecentlyClosed({ maxResults = 25 } = {}) {
        return closed
          .slice()
          .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
          .slice(0, maxResults);
      },
      async restore(sessionId) {
        const index = closed.findIndex((session) =>
          (session.tab && session.tab.sessionId === sessionId) ||
          (session.window && session.window.sessionId === sessionId)
        );
        if (index >= 0) closed.splice(index, 1);
        return {};
      },
      async getDevices() {
        return devices;
      }
    },
    tabs: {
      async create({ url }) {
        if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
      },
      async update() {}
    },
    windows: {
      WINDOW_ID_NONE: -1,
      async update() {}
    }
  };

  return api;
}
