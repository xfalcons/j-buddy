// Listen for text selection
document.addEventListener("mouseup", () => {
  if (chrome.runtime?.id) {
    const selection = window.getSelection()?.toString()?.trim();
    if (selection) {
      chrome.runtime.sendMessage({
        action: "textSelected",
        data: selection,
      });
    }
  }
});
