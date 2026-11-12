const types = new Map([
  ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["png", "image/png"],
  ["gif", "image/gif"], ["webp", "image/webp"], ["avif", "image/avif"],
  ["mp4", "video/mp4"], ["m4v", "video/mp4"], ["mov", "video/quicktime"],
  ["webm", "video/webm"], ["ogv", "video/ogg"],
  ["mp3", "audio/mpeg"], ["wav", "audio/wav"], ["m4a", "audio/mp4"],
  ["aac", "audio/aac"], ["ogg", "audio/ogg"], ["opus", "audio/ogg"],
  ["flac", "audio/flac"], ["weba", "audio/webm"]
]);

export function mediaType(item) {
  const extension = item.name.match(/\.([^.]+)$/)?.[1].toLowerCase();
  return item.mime?.startsWith("image/") ? item.mime : types.get(extension);
}
