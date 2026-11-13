import { isDocumentPreview, previewType } from "./media-types.js";
import { formatEntryKind, formatEntrySize } from "./entry-format.js";

export function createMediaPreview(dialog, load, download) {
  const title = dialog.querySelector("h2");
  const details = dialog.querySelector(".media-details");
  const counter = dialog.querySelector(".media-position");
  const status = dialog.querySelector("#preview-status");
  const content = dialog.querySelector("#preview-content");
  const previous = dialog.querySelector("[data-previous]");
  const next = dialog.querySelector("[data-next]");
  let items = [];
  let index = 0;
  let request;
  let url;

  function clear() {
    request?.abort();
    content.querySelector("audio, video")?.pause();
    content.replaceChildren();
    if (url) URL.revokeObjectURL(url);
    url = undefined;
  }

  async function show(position) {
    if (position < 0 || position >= items.length) return;
    index = position;
    clear();
    const controller = new AbortController();
    request = controller;
    const { item, type } = items[index];
    title.textContent = title.title = item.name;
    details.textContent = [formatEntryKind(item), Number.isFinite(item.size) ? formatEntrySize(item.size) : ""]
      .filter(Boolean).join(" · ");
    counter.textContent = (index + 1) + " / " + items.length;
    previous.disabled = index === 0;
    next.disabled = index === items.length - 1;
    status.textContent = "正在加载预览…";
    if (!dialog.open) dialog.showModal();
    try {
      const blob = await load(item, type, controller.signal);
      if (controller.signal.aborted || !dialog.open) return;
      const kind = type.split("/")[0];
      const media = document.createElement(kind === "image" ? "img" : kind);
      if (kind === "image") media.alt = item.name;
      else {
        media.controls = true;
        media.playsInline = true;
      }
      media.addEventListener(kind === "image" ? "load" : "loadedmetadata", () => {
        if (!controller.signal.aborted) status.textContent = "";
      });
      media.addEventListener("error", () => {
        if (!controller.signal.aborted) status.textContent = "浏览器无法预览此文件，请下载后打开。";
      });
      url = URL.createObjectURL(blob.slice(0, blob.size, type));
      media.src = url;
      content.append(media);
    } catch (error) {
      if (!controller.signal.aborted) status.textContent = error.message;
    }
  }

  previous.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  dialog.querySelector("[data-preview-close]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-preview-download]").addEventListener("click", async () => {
    const selected = items[index];
    const current = request;
    try {
      await download(selected.item);
    } catch (error) {
      if (dialog.open && current === request) status.textContent = error.message;
    }
  });
  dialog.addEventListener("close", () => { if (!dialog.open) clear(); });
  document.addEventListener("keydown", (event) => {
    if (!dialog.open || event.target.closest("audio, video") || event.altKey || event.ctrlKey || event.metaKey) return;
    if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      show(index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1));
    }
  });

  return (selected, entries) => {
    items = entries.map(item => ({ item, type: previewType(item) }))
      .filter(({ item, type }) => item.kind !== "folder" && type && !isDocumentPreview(type));
    return show(items.findIndex(({ item }) => item.id === selected.id));
  };
}
