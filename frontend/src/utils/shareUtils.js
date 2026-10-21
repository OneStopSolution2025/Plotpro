/**
 * Centralized share & clipboard utility.
 * 
 * Supports:
 * 1. navigator.share() when available and supported.
 * 2. Fallback to navigator.clipboard.writeText().
 * 3. Legacy fallback using document.execCommand('copy').
 * 4. Graceful handling of user cancellation (AbortError).
 */

export const shareContent = async ({ title, text, url }) => {
  const shareUrl = url || window.location.href;

  // 1. Try Web Share API (typically mobile devices and HTTPS desktop browsers)
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: title || document.title || "PlotPro",
        text: text || "",
        url: shareUrl,
      });
      return { success: true, method: "share" };
    } catch (err) {
      // User dismissed or aborted the native share sheet
      if (err.name === "AbortError") {
        return { success: false, cancelled: true };
      }
      console.warn("navigator.share failed, falling back to clipboard:", err);
      // Fall through to clipboard copy
    }
  }

  // 2. Try modern Clipboard API
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(shareUrl);
      return { success: true, method: "clipboard" };
    } catch (err) {
      console.warn("navigator.clipboard.writeText failed, trying legacy fallback:", err);
    }
  }

  // 3. Legacy textarea execCommand fallback
  try {
    const textArea = document.createElement("textarea");
    textArea.value = shareUrl;
    textArea.style.position = "fixed";
    textArea.style.top = "-9999px";
    textArea.style.left = "-9999px";
    textArea.setAttribute("readonly", "");
    document.body.appendChild(textArea);
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);

    if (successful) {
      return { success: true, method: "clipboard" };
    }
  } catch (err) {
    console.error("Legacy copy failed:", err);
  }

  return {
    success: false,
    cancelled: false,
    error: new Error("Unable to share or copy link to clipboard"),
  };
};
