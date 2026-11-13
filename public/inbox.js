import { createMediaPreview } from "./media-preview.js";
import { isDocumentPreview, previewType } from "./media-types.js";
import { observeCovers } from "./media-covers.js";
import { fileIcon } from "./file-icons.js";
import { entryDateFormat, formatEntryKind, formatEntrySize } from "./entry-format.js";
import { bindViewSwitch } from "./view-switch.js";
import { droppedItems, pastedFiles, selectedDirectoryItems, showUploadProgress, uploadDirectories, uploadFile } from "./uploads.js";

const $ = (id) => document.getElementById(id);
const code = location.pathname.match(/^\/s\/([a-zA-Z0-9_-]{12})$/)?.[1];
let folder = new URLSearchParams(location.search).get("folder");
const form = $("inbox-form");
const panel = $("inbox-panel");
const input = $("inbox-files");
const submit = $("inbox-submit");
const directoryInput = $("inbox-directory");
const chooseDirectory = $("inbox-choose-directory");
const mkdir = $("inbox-mkdir");
const status = $("inbox-status");
const endpoint = "/api/inbox/" + code;
const pageSize = 50;
let page = 0;
let maxUploadMiB;
let listing = 0;
let navigating = false;
let treeSnapshot;

let stopCovers;

const viewSwitch = $("inbox-view-switch");
bindViewSwitch(viewSwitch, "cloud-drive-inbox-view", "grid", (view) => {
  $("inbox-entries").classList.toggle("inbox-list", view === "list");
});

function folderAddress(id) {
  const url = new URL(location.pathname, location.origin);
  if (id) url.searchParams.set("folder", id);
  return url.href;
}

function folderQuery(fields, target = folder) {
  const params = new URLSearchParams(fields);
  if (target) params.set("folder", target);
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

const preview = createMediaPreview($("inbox-preview"), async (item, _type, signal) =>
  (await request(fileAddress(item), { signal })).blob(), (item) => {
    const link = document.createElement("a");
    link.href = fileAddress(item);
    link.download = item.name;
    link.click();
  });

function renderEntry(item, entries) {
  const row = document.createElement("li");
  const isFolder = item.kind === "folder";
  const type = previewType(item);
  const documentPreview = !isFolder && isDocumentPreview(type);
  const open = document.createElement(!isFolder && !documentPreview && type ? "button" : "a");
  open.className = "inbox-tile";
  open.title = item.name;
  const icon = document.createElement("span");
  icon.className = "inbox-icon " + (isFolder ? "icon-folder" : "inbox-file-art");
  if (!isFolder) icon.append(fileIcon(item.name, type));
  if (!isFolder && !documentPreview && (type?.startsWith("image/") || type?.startsWith("video/"))) {
    icon.dataset.coverType = type;
    icon.dataset.coverSource = fileAddress(item);
  }
  const art = document.createElement("span");
  art.className = "inbox-art";
  art.setAttribute("aria-hidden", "true");
  art.append(icon);
  const name = document.createElement("span");
  name.className = "inbox-name";
  name.textContent = item.name;
  const info = document.createElement("span");
  info.className = "inbox-info";
  info.append(name);
  const meta = document.createElement("span");
  meta.className = "inbox-meta";
  const kind = document.createElement("span");
  kind.className = "inbox-kind";
  kind.textContent = formatEntryKind(item);
  meta.append(kind);
  if (!isFolder && Number.isFinite(item.size)) {
    const size = document.createElement("span");
    size.className = "inbox-size";
    size.textContent = formatEntrySize(item.size);
    meta.append(size);
  }
  if (item.created_at) {
    const time = document.createElement("time");
    time.dateTime = item.created_at;
    time.textContent = entryDateFormat.format(new Date(item.created_at));
    meta.append(time);
  }
  info.append(meta);
  open.append(art, info);
  row.append(open);
  if (isFolder) {
    open.href = folderAddress(item.id);
    open.dataset.folderLink = "";
  } else if (documentPreview || type) {
    if (documentPreview) {
      const url = new URL(location.pathname, location.origin);
      url.searchParams.set("file", item.id);
      open.href = url.href;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
    } else {
      open.type = "button";
      open.addEventListener("click", () => preview(item, entries));
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

function renderFolderTree(data) {
  const tree = $("inbox-tree");
  const children = new Map();
  const current = folder || data.rootId;
  const byId = new Map(data.folders.map(item => [item.id, item]));
  const ancestors = new Set();
  for (let item = byId.get(current); item && !ancestors.has(item.id); item = byId.get(item.parent_id)) {
    ancestors.add(item.id);
  }
  const snapshot = JSON.stringify(data.folders);
  if (snapshot === treeSnapshot) {
    for (const link of tree.querySelectorAll(".tree-folder")) {
      if (link.dataset.folderId === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
    for (const toggle of tree.querySelectorAll('.tree-toggle[aria-expanded="false"]')) {
      if (toggle.dataset.folder !== current && ancestors.has(toggle.dataset.folder)) toggle.click();
    }
    return;
  }
  const expanded = new Set([...tree.querySelectorAll('[aria-expanded="true"]')].map(toggle => toggle.dataset.folder));
  for (const item of data.folders) {
    if (!children.has(item.parent_id)) children.set(item.parent_id, []);
    children.get(item.parent_id).push(item);
  }
  function branch(parent) {
    const list = document.createElement("ul");
    if (parent !== null) list.className = "folder-tree";
    else list.className = "inbox-tree-root";
    for (const item of children.get(parent) ?? []) {
      const node = document.createElement("li");
      const row = document.createElement("div");
      row.className = "tree-row";
      node.append(row);
      if (children.has(item.id)) {
        const nested = branch(item.id);
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "tree-toggle";
        toggle.dataset.folder = item.id;
        toggle.setAttribute("aria-label", item.name + "的子目录");
        const setExpanded = open => {
          nested.hidden = !open;
          toggle.setAttribute("aria-expanded", String(open));
        };
        setExpanded(tree.childElementCount ? expanded.has(item.id) : ancestors.has(item.id));
        toggle.addEventListener("click", () => setExpanded(nested.hidden));
        row.append(toggle);
        node.append(nested);
      }
      const link = document.createElement("a");
      link.className = "tree-folder";
      link.dataset.folderId = item.id;
      link.dataset.folderLink = "";
      link.href = folderAddress(item.id === data.rootId ? null : item.id);
      link.title = item.name;
      if (item.id === current) link.setAttribute("aria-current", "location");
      const icon = document.createElement("span");
      icon.className = "icon icon-folder";
      icon.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.className = "tree-folder-name";
      name.textContent = item.name;
      link.append(icon, name);
      row.append(link);
      list.append(node);
    }
    return list;
  }
  tree.replaceChildren(branch(null));
  treeSnapshot = snapshot;
  $("inbox-sidebar").hidden = false;
}

async function loadFolder(target = folder, offsetPage = page, historyMode) {
  const sequence = ++listing;
  let data;
  try {
    const response = await request(folderQuery({ offset: offsetPage * pageSize }, target));
    data = await response.json();
  } catch (error) {
    if (sequence !== listing) return;
    throw error;
  }
  if (sequence !== listing) return;
  if (historyMode === "push") history.pushState(null, "", folderAddress(target));
  if (folder !== target || page !== offsetPage) panel.querySelector(".file-scroll").scrollTop = 0;
  folder = target;
  page = offsetPage;
  maxUploadMiB = data.maxUploadMiB;
  document.title = data.name;
  $("inbox-title").textContent = data.name;
  if (data.folders) renderFolderTree(data);
  $("inbox-limit").textContent = "单个文件不超过 " + maxUploadMiB + " MiB";
  const up = $("inbox-up");
  up.hidden = data.root;
  if (!data.root) up.href = folderAddress(data.parent);
  const grid = $("inbox-entries");
  stopCovers?.();
  grid.replaceChildren(...data.entries.map(item => renderEntry(item, data.entries)));
  stopCovers = observeCovers(grid);
  $("inbox-empty").hidden = data.entries.length > 0;
  $("inbox-pagination").hidden = !page && !data.hasMore;
  $("inbox-previous").disabled = page === 0;
  $("inbox-next").disabled = !data.hasMore;
  $("inbox-page").textContent = "第 " + (page + 1) + " 页";
  form.hidden = false;
  viewSwitch.hidden = false;
}

async function navigateFolder(target, historyMode) {
  navigating = true;
  const expected = listing + 1;
  try {
    await loadFolder(target, 0, historyMode);
  } catch (error) {
    if (historyMode === "pop") history.replaceState(null, "", folderAddress(folder));
    status.textContent = error.message;
  } finally {
    if (expected === listing) navigating = false;
  }
}

$("inbox-up").dataset.folderLink = "";
panel.addEventListener("click", event => {
  const link = event.target.closest("a[data-folder-link]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (submit.disabled) return;
  const target = new URL(link.href).searchParams.get("folder");
  if (target !== folder || navigating) void navigateFolder(target, "push");
});
window.addEventListener("popstate", () => {
  void navigateFolder(new URLSearchParams(location.search).get("folder"), "pop");
});

function folderError(error) {
  status.textContent = error.message;
  if (error.status === 404) {
    $("inbox-sidebar").hidden = true;
    form.hidden = true;
    viewSwitch.hidden = true;
    stopCovers?.();
    $("inbox-entries").replaceChildren();
    $("inbox-empty").hidden = $("inbox-pagination").hidden = true;
  }
}

async function createFolder(name, target = folder) {
  const response = await request(folderQuery({ action: "mkdir" }, target), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return (await response.json()).id;
}

function setUploadBusy(busy) {
  input.disabled = directoryInput.disabled = submit.disabled = chooseDirectory.disabled = mkdir.disabled = busy;
}

async function uploadItems(items) {
  if (form.hidden || submit.disabled || navigating) return;
  const uploadFolder = folder;
  setUploadBusy(true);
  const progress = $("inbox-progress");
  status.textContent = "";
  let completed = 0;
  let index = 0;
  let created = 0;
  const failures = [];
  const ensurePath = uploadDirectories(folder, async (name, target) => {
    const id = await createFolder(name, target);
    created += 1;
    return id;
  });
  try {
    items = await items;
    const total = items.filter(item => item.file).length;
    for (const { file, path } of items) {
      try {
        if (!file) {
          await ensurePath(path);
          continue;
        }
        const position = index++;
        if (!file.size || file.size > maxUploadMiB * 1024 * 1024) {
          throw new Error("文件必须大于 0 字节且不超过 " + maxUploadMiB + " MiB");
        }
        const target = await ensurePath(path);
        const update = showUploadProgress(progress, file, position, total);
        await uploadFile(folderQuery({ name: file.name }, target), file, {}, update);
        completed += 1;
      } catch (error) {
        failures.push([...path, ...(file ? [file.name] : [])].join("/") + " · " + error.message);
        if (error.status === 404) {
          if (folder === uploadFolder && !navigating) folderError(error);
          break;
        }
      }
    }
    const summary = ["已上传 " + completed + "/" + total + " 个文件"];
    if (created) summary.push("已创建 " + created + " 个文件夹");
    status.textContent = [...summary, ...failures].join("\n");
    if ((completed || created) && !form.hidden && !navigating) await loadFolder().catch(folderError);
  } catch (error) {
    folderError(error);
  } finally {
    input.value = directoryInput.value = "";
    progress.hidden = true;
    setUploadBusy(false);
  }
}

function uploadFiles(files) {
  if (files.length) void uploadItems(files.map(file => ({ file, path: [] })));
}

submit.addEventListener("click", () => input.click());
input.addEventListener("change", () => uploadFiles(Array.from(input.files)));
chooseDirectory.hidden = !("webkitdirectory" in directoryInput);
chooseDirectory.addEventListener("click", () => directoryInput.click());
directoryInput.addEventListener("change", () => {
  const items = selectedDirectoryItems(directoryInput.files);
  if (items.length) void uploadItems(items);
});
mkdir.addEventListener("click", async () => {
  if (navigating) return;
  const name = prompt("文件夹名称")?.trim();
  if (!name) return;
  setUploadBusy(true);
  try {
    await createFolder(name);
    status.textContent = "已创建文件夹「" + name + "」";
    await loadFolder();
  } catch (error) {
    folderError(error);
  } finally {
    setUploadBusy(false);
  }
});
form.addEventListener("submit", (event) => event.preventDefault());
document.addEventListener("paste", (event) => {
  if (form.hidden || $("inbox-preview").open) return;
  const files = pastedFiles(event);
  if (!files.length) return;
  event.preventDefault();
  void uploadFiles(files);
});

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
  if (!form.hidden && !submit.disabled && !$("inbox-preview").open) {
    void uploadItems(droppedItems(event.dataTransfer));
  }
});

$("inbox-previous").addEventListener("click", () => {
  if (!navigating && !submit.disabled) loadFolder(folder, page - 1).catch(folderError);
});
$("inbox-next").addEventListener("click", () => {
  if (!navigating && !submit.disabled) loadFolder(folder, page + 1).catch(folderError);
});

if (code) {
  loadFolder().catch(folderError).finally(() => { panel.hidden = false; });
} else {
  status.textContent = "公开文件夹链接已失效，请索取新的短链接。";
  panel.hidden = false;
}
