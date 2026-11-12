export function bindViewSwitch(control, storageKey, defaultView, render) {
  const buttons = control.querySelectorAll("button[data-view]");
  function select(view) {
    render(view);
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    }
  }

  let view = defaultView;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === "list" || saved === "grid") view = saved;
  } catch {
    // The view can still be switched when browser storage is unavailable.
  }
  select(view);
  for (const button of buttons) {
    button.addEventListener("click", () => {
      select(button.dataset.view);
      try {
        localStorage.setItem(storageKey, button.dataset.view);
      } catch {
        // Keep the selection for the current page.
      }
    });
  }
}
