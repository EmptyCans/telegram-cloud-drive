export function pastedFiles(event) {
  if (event.target.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return [];
  return Array.from(event.clipboardData?.files ?? []);
}

export function uploadFile(path, file, headers, update) {
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
      reject(Object.assign(new Error(request.response?.error ?? "上传失败（" + request.status + "）"), { status: request.status }));
    });
    request.addEventListener("error", () => reject(new Error("网络连接失败，请重试。")));
    request.addEventListener("abort", () => reject(new Error("上传已中断。")));
    request.responseType = "json";
    request.send(file);
  });
}

export function showUploadProgress(panel, file, index, total) {
  const label = panel.querySelector("span");
  const bar = panel.querySelector("progress");
  const name = (index + 1) + "/" + total + " · " + file.name;
  function update(percent) {
    bar.value = percent;
    label.textContent = percent === 100 ? "正在保存 · " + name : "正在上传 " + percent + "% · " + name;
  }
  update(0);
  panel.hidden = false;
  return update;
}
