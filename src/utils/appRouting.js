const PAGE_PATHS = {
  Home: "/home",
  "Speaking Challenge": "/speaking-challenge",
  Lessons: "/lessons",
  Vocabulary: "/vocabulary",
  Flashcards: "/flashcards",
  Pronunciation: "/pronunciation",
  Practice: "/practice",
  Progress: "/progress",
};

const ROUTE_EVENT = "bd10-route-change";

function cleanPath(pathname = window.location.pathname) {
  const normalized = `/${String(pathname).split("?")[0].split("#")[0].replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "/" : normalized.toLowerCase();
}

export function pathForPage(page) {
  return PAGE_PATHS[page] || "/home";
}

export function pageFromPath(pathname) {
  const path = cleanPath(pathname);
  if (path === "/lessons" || path.startsWith("/lessons/")) return "Lessons";
  return Object.entries(PAGE_PATHS).find(([, route]) => route === path)?.[0] || null;
}

export function lessonIdFromPath(pathname) {
  const path = String(pathname || "").split("?")[0].split("#")[0];
  const match = path.match(/^\/lessons\/([^/]+)\/?$/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function lessonPath(lessonId) {
  return `/lessons/${encodeURIComponent(lessonId)}`;
}

export function navigateTo(path, { replace = false } = {}) {
  if (window.location.pathname === path) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  window.dispatchEvent(new CustomEvent(ROUTE_EVENT, { detail: { path } }));
}

export function subscribeToRouteChanges(onChange) {
  const handleChange = () => onChange(window.location.pathname);
  window.addEventListener("popstate", handleChange);
  window.addEventListener(ROUTE_EVENT, handleChange);
  return () => {
    window.removeEventListener("popstate", handleChange);
    window.removeEventListener(ROUTE_EVENT, handleChange);
  };
}
