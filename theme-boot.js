/**
 * Runs before the stylesheets so a saved dark theme does not flash a light page
 * while chrome.storage.local is loading asynchronously.
 */
(function bootTheme() {
  try {
    const params = new URLSearchParams(location.search);
    const stored = localStorage.getItem('edge-history-theme');
    const theme = ["system", "light", "dark"].includes(stored)
      ? stored
      : (["system", "light", "dark"].includes(params.get("theme")) ? params.get("theme") : "system");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = theme === "system"
      ? (prefersDark ? "dark" : "light")
      : theme;

    // Set the document language before the module loads so fonts and screen
    // readers see the right locale as early as possible. The dictionary is
    // still applied asynchronously by shared/i18n.js.
    const storedLanguage = localStorage.getItem("edge-history-language");
    const requestedLanguage = params.get("lang");
    const preference = ["system", "zh-CN", "en"].includes(requestedLanguage)
      ? requestedLanguage
      : (["system", "zh-CN", "en"].includes(storedLanguage) ? storedLanguage : "system");
    const language = preference === "zh-CN" || preference === "en"
      ? preference
      : (/^zh(?:-|$)/i.test(navigator.language || "") ? "zh-CN" : "en");
    document.documentElement.lang = language;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
