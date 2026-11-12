const MiB = 1024 * 1024;
export const entryDateFormat = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });

export function formatEntrySize(bytes) {
  return bytes >= MiB ? (bytes / MiB).toFixed(1) + " MiB" : Math.ceil(bytes / 1024) + " KiB";
}
