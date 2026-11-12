import { isDocumentPreview, previewType } from "./media-types.js";
import { observeCovers } from "./media-covers.js";

const $ = (id) => document.getElementById(id);
const token = location.hash.slice(1);
const folder = new URLSearchParams(location.search).get("folder");
const form = $("inbox-form");
const input = $("inbox-files");
const submit = $("inbox-submit");
const status = $("inbox-status");
const endpoint = "/api/inbox/" + encodeURIComponent(token);
const pageSize = 50;
let page = 0;
let maxUploadMiB;
let listing = 0;
let previewUrl;
let previewRequest;
let stopCovers;

function folderAddress(id) {
  const url = new URL("/inbox", location.origin);
  if (id) url.searchParams.set("folder", id);
  url.hash = token;
  return url.href;
}

function folderQuery(fields) {
  const params = new URLSearchParams(fields);
  if (folder) params.set("folder", folder);
  return endpoint + "?" + params;
}

async function request(path, options) {
  const response = await fetch(path, { ...options, credentials: "omit" });
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    const fallback = response.status === 413 ? "文件超过上传限制。" : "请求失败，请稍后重试。";
    throw Object.assign(new Error(error ?? fallback), { status: response.status });
  }
  return response;
}

function fileAddress(item) {
  return endpoint + "/" + encodeURIComponent(item.id) + "/download";
}

function clearPreview() {
  previewRequest?.abort();
  previewRequest = undefined;
  const content = $("preview-content");
  content.querySelector("audio, video")?.pause();
  content.replaceChildren();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
}

async function preview(item, type) {
  clearPreview();
  const controller = new AbortController();
  previewRequest = controller;
  const dialog = $("inbox-preview");
  const message = $("preview-status");
  $("inbox-preview-title").textContent = item.name;
  message.textContent = "正在加载预览…";
  dialog.showModal();
  try {
    const response = await request(fileAddress(item), { signal: controller.signal });
    const blob = await response.blob();
    if (controller.signal.aborted || !dialog.open) return;
    const kind = type.split("/")[0];
    const element = document.createElement(kind === "image" ? "img" : kind);
    if (kind === "image") {
      element.alt = item.name;
    } else {
      element.controls = true;
      element.playsInline = true;
    }
    element.addEventListener("error", () => {
      if (previewRequest === controller) message.textContent = "浏览器无法预览此文件，请下载后打开。";
    });
    previewUrl = URL.createObjectURL(blob.slice(0, blob.size, type));
    element.src = previewUrl;
    $("preview-content").append(element);
    message.textContent = "";
  } catch (error) {
    if (!controller.signal.aborted) message.textContent = error.message;
  }
}

function renderEntry(item) {
  const row = document.createElement("li");
  const isFolder = item.kind === "folder";
  const type = previewType(item);
  const documentPreview = !isFolder && isDocumentPreview(type);
  const open = document.createElement(!isFolder && !documentPreview && type ? "button" : "a");
  open.className = "inbox-tile";
  open.title = item.name;
  const icon = document.createElement("span");
  icon.className = "inbox-icon " + (isFolder ? "inbox-folder-icon" : "inbox-file-icon");
  if (!isFolder && !documentPreview && (type?.startsWith("image/") || type?.startsWith("video/"))) {
    icon.dataset.coverType = type;
    icon.dataset.coverSource = fileAddress(item);
  }
  const art = document.createElement("span");
  art.className = "inbox-art";
  art.setAttribute("aria-hidden", "true");
  art.append(icon);
  const name = document.createElement("span");
  name.textContent = item.name;
  open.append(art, name);
  row.append(open);
  if (isFolder) {
    open.href = folderAddress(item.id);
  } else if (documentPreview || type) {
    if (documentPreview) {
      const url = new URL("/html-preview", location.origin);
      url.searchParams.set("id", item.id);
      if (type === "application/pdf") url.searchParams.set("type", "pdf");
      url.hash = token;
      open.href = url.href;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
    } else {
      open.type = "button";
      open.addEventListener("click", () => preview(item, type));
    }
    const download = document.createElement("a");
    download.className = "inbox-download";
    download.href = fileAddress(item);
    download.download = item.name;
    download.textContent = "下载";
    row.append(download);
  } else {
    open.href = fileAddress(item);
    open.download = item.name;
  }
  return row;
}

async function loadFolder() {
  const sequence = ++listing;
  const response = await request(folderQuery({ offset: page * pageSize }));
  const data = await response.json();
  if (sequence !== listing) return;
  maxUploadMiB = data.maxUploadMiB;
  $("inbox-title").textContent = data.name;
  $("inbox-limit").textContent = "单个文件不超过 " + maxUploadMiB + " MiB";
  const up = $("inbox-up");
  up.hidden = data.root;
  if (!data.root) up.href = folderAddress(data.parent);
  const grid = $("inbox-entries");
  stopCovers?.();
  grid.replaceChildren(...data.entries.map(renderEntry));
  stopCovers = observeCovers(grid);
  $("inbox-empty").hidden = data.entries.length > 0;
  $("inbox-pagination").hidden = !page && !data.hasMore;
  $("inbox-previous").disabled = page === 0;
  $("inbox-next").disabled = !data.hasMore;
  $("inbox-page").textContent = "第 " + (page + 1) + " 页";
  form.hidden = false;
}

function folderError(error) {
  status.textContent = error.message;
  if (error.status === 404) {
    form.hidden = true;
    stopCovers?.();
    $("inbox-entries").replaceChildren();
    $("inbox-empty").hidden = $("inbox-pagination").hidden = true;
  }
}

async function uploadFiles(files) {
  if (!files.length || form.hidden || submit.disabled) return;
  input.disabled = submit.disabled = true;
  let completed = 0;
  const failures = [];
  try {
    for (const [index, file] of files.entries()) {
      status.textContent = "正在上传 " + (index + 1) + "/" + files.length + " · " + file.name;
      try {
        if (!file.size || file.size > maxUploadMiB * 1024 * 1024) {
          throw new Error("文件必须大于 0 字节且不超过 " + maxUploadMiB + " MiB");
        }
        await request(folderQuery({ name: file.name }), {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file
        });
        completed += 1;
      } catch (error) {
        failures.push(file.name + " · " + error.message);
        if (error.status === 404) {
          folderError(error);
          break;
        }
      }
    }
    status.textContent = ["已上传 " + completed + "/" + files.length + " 个文件", ...failures].join("\n");
    input.value = "";
    if (completed && !form.hidden) await loadFolder().catch(folderError);
  } finally {
    input.disabled = submit.disabled = false;
  }
}

submit.addEventListener("click", () => input.click());
input.addEventListener("change", () => uploadFiles(Array.from(input.files)));
form.addEventListener("submit", (event) => event.preventDefault());

function isFileDrag(event) {
  return event.dataTransfer?.types.includes("Files");
}

window.addEventListener("dragover", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  const ready = !form.hidden && !submit.disabled && !$("inbox-preview").open;
  event.dataTransfer.dropEffect = ready ? "copy" : "none";
  form.classList.toggle("inbox-dragging", ready);
});
window.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) form.classList.remove("inbox-dragging");
});
window.addEventListener("drop", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  form.classList.remove("inbox-dragging");
  if (!$("inbox-preview").open) uploadFiles(Array.from(event.dataTransfer.files));
});

$("inbox-previous").addEventListener("click", () => {
  page -= 1;
  loadFolder().catch(folderError);
});
$("inbox-next").addEventListener("click", () => {
  page += 1;
  loadFolder().catch(folderError);
});
$("inbox-preview-close").addEventListener("click", () => $("inbox-preview").close());
$("inbox-preview").addEventListener("close", clearPreview);

if (/^[a-f0-9]{32}$/.test(token)) {
  loadFolder().then(() => { status.textContent = ""; }).catch(folderError);
} else {
  status.textContent = "公开文件夹链接无效。";
}
