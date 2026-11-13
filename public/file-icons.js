export const extensionGroups = new Map([
  ["document", ["doc", "docx", "odt", "rtf", "txt", "md"]],
  ["sheet", ["xls", "xlsx", "ods", "csv", "tsv"]],
  ["slides", ["ppt", "pptx", "odp", "key"]],
  ["archive", ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"]],
  ["code", ["html", "htm", "css", "js", "ts", "json", "xml", "yaml", "yml", "py", "go", "sh", "sql"]],
  ["app", ["exe", "msi", "apk", "dmg", "pkg"]],
  ["image", ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "bmp", "tif", "tiff", "heic", "ico", "psd"]],
  ["video", ["mp4", "m4v", "mov", "webm", "ogv", "avi", "mkv", "wmv", "flv", "mpeg", "mpg"]],
  ["audio", ["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "weba", "wma", "aiff", "mid", "midi"]]
]);

export function fileIcon(name, type) {
  const extension = name.match(/\.([a-z\d]+)$/i)?.[1].toLowerCase();
  const media = type?.split("/")[0];
  let group = "generic";
  if (extension === "pdf") group = "pdf";
  else if (media === "image" || media === "video" || media === "audio") group = media;
  else {
    for (const [category, extensions] of extensionGroups) {
      if (extensions.includes(extension)) {
        group = category;
        break;
      }
    }
  }
  const icon = document.createElement("span");
  icon.className = "file-symbol file-symbol-" + group;
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = extension && extension.length <= 5 ? extension.toUpperCase() : "FILE";
  icon.append(label);
  return icon;
}
