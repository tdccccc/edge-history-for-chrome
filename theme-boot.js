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
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
