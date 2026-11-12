const token = location.hash.slice(1);
const form = document.getElementById("inbox-form");
const input = document.getElementById("inbox-files");
const submit = document.getElementById("inbox-submit");
const status = document.getElementById("inbox-status");
const endpoint = "/api/inbox/" + encodeURIComponent(token);

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error ?? "无法上传，请稍后重试。"), { status: response.status });
  }
  return data;
}

async function setup() {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error("收件链接无效。");
  const { name, maxUploadMiB } = await request(endpoint);
  document.getElementById("inbox-title").textContent = "上传到「" + name + "」";
  document.getElementById("inbox-limit").textContent = "选择文件，单个文件不超过 " + maxUploadMiB + " MiB";
  status.textContent = "";
  form.hidden = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const files = Array.from(input.files);
    if (!files.length || submit.disabled) return;
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
          await request(endpoint + "?" + new URLSearchParams({ name: file.name }), { method: "POST", body: file });
          completed += 1;
        } catch (error) {
          failures.push(file.name + " · " + error.message);
          if (error.status === 404) {
            form.hidden = true;
            break;
          }
        }
      }
      status.textContent = ["已上传 " + completed + "/" + files.length + " 个文件", ...failures].join("\n");
      input.value = "";
    } finally {
      input.disabled = submit.disabled = false;
    }
  });
}

setup().catch((error) => { status.textContent = error.message; });
