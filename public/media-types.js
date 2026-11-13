const types = new Map([
  ["pdf", "application/pdf"], ["html", "text/html"], ["htm", "text/html"],
  ["md", "text/markdown"], ["txt", "text/plain"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["png", "image/png"],
  ["gif", "image/gif"], ["webp", "image/webp"], ["avif", "image/avif"],
  ["mp4", "video/mp4"], ["m4v", "video/mp4"], ["mov", "video/quicktime"],
  ["webm", "video/webm"], ["ogv", "video/ogg"],
  ["mp3", "audio/mpeg"], ["wav", "audio/wav"], ["m4a", "audio/mp4"],
  ["aac", "audio/aac"], ["ogg", "audio/ogg"], ["opus", "audio/ogg"],
  ["flac", "audio/flac"], ["weba", "audio/webm"]
]);

const images = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);

export function previewType(item) {
  const extension = item.name.match(/\.([^.]+)$/)?.[1].toLowerCase();
  const type = types.get(extension);
  if (isDocumentPreview(type)) return type;
  return images.has(item.mime) ? item.mime : type;
}

export function isDocumentPreview(type) {
  return type === "application/pdf" || type === "text/html" || type === "text/plain" || isRenderedDocument(type) || isWorkbookPreview(type);
}

export function isWorkbookPreview(type) {
  return type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

export function isRenderedDocument(type) {
  return type === "text/markdown" || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}
