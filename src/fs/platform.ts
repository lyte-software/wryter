export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Android or iOS. iPadOS reports itself as a Mac, so a Mac with a touchscreen is an
 * iPad (desktop Macs report 0 touch points).
 */
export const isMobile =
  typeof navigator !== "undefined" &&
  (/Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
