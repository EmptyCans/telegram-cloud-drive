import { language } from "./drive-i18n.js";

const MiB = 1024 * 1024;
export const entryDateFormat = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });

export function formatEntrySize(bytes) {
  return bytes >= MiB ? (bytes / MiB).toFixed(1) + " MiB" : Math.ceil(bytes / 1024) + " KiB";
}

export function formatEntryKind(item) {
  if (item.kind === "folder") return "文件夹";
  return entryExtension(item.name)?.toUpperCase() ?? "文件";
}

export function entryExtension(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : null;
}
