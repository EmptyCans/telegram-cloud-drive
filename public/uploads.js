import { localizeValue } from "./drive-i18n.js";

export function pastedFiles(event) {
  if (event.target.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return [];
  return Array.from(event.clipboardData?.files ?? []);
}

export async function droppedItems(transfer) {
  async function read(entry, path) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      return [{ file, path }];
    }
    if (!entry.isDirectory) return [];
    const directory = [...path, entry.name];
    const items = [{ path: directory }];
    const reader = entry.createReader();
    while (true) {
      const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) return items;
      for (const child of batch) items.push(...await read(child, directory));
    }
  }

  const items = Array.from(transfer.items).filter(item => item.kind === "file");
  const files = Array.from(transfer.files);
  if (!items.length) return files.map(file => ({ file, path: [] }));
  const tasks = items.map((item, index) => {
    const entry = item.webkitGetAsEntry?.();
    if (entry) return read(entry, []);
    const file = item.getAsFile() ?? files[index];
    return file ? [{ file, path: [] }] : [];
  });
  return (await Promise.all(tasks)).flat();
}

export function selectedDirectoryItems(files) {
  return Array.from(files, file => ({ file, path: file.webkitRelativePath.split("/").slice(0, -1) }));
}

export function uploadDirectories(parent, createFolder) {
  const directories = new Map();
  return async function ensurePath(path) {
    let target = parent;
    for (const [depth, name] of path.entries()) {
      const key = JSON.stringify(path.slice(0, depth + 1));
      if (!directories.has(key)) directories.set(key, await createFolder(name, target));
      target = directories.get(key);
    }
    return target;
  };
}

export function uploadFile(path, file, headers, update, translate = null) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", path);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) update(Math.min(100, Math.floor(event.loaded / event.total * 100)));
    });
    request.upload.addEventListener("load", () => update(100));
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      const message = translate
        ? translate("上传失败（{status}）", { status: request.status })
        : request.response?.error ?? "上传失败（" + request.status + "）";
      reject(Object.assign(new Error(message), { status: request.status }));
    });
    request.addEventListener("error", () => reject(new Error(translate?.("网络连接失败，请重试。") ?? "网络连接失败，请重试。")));
    request.addEventListener("abort", () => reject(new Error(translate?.("上传已中断。") ?? "上传已中断。")));
    request.responseType = "json";
    request.send(file);
  });
}

export function showUploadProgress(panel, file, index, total, translate = null) {
  const label = panel.querySelector("span");
  const bar = panel.querySelector("progress");
  const name = (index + 1) + "/" + total + " · " + file.name;
  function update(percent) {
    bar.value = percent;
    const message = percent === 100 ? "正在保存 · {name}" : "正在上传 {percent}% · {name}";
    if (translate) localizeValue(label, () => translate(message, { name, percent }));
    else label.textContent = percent === 100 ? "正在保存 · " + name : "正在上传 " + percent + "% · " + name;
  }
  update(0);
  panel.hidden = false;
  return update;
}
