import { language } from "./drive-i18n.js";

const MiB = 1024 * 1024;
const dateFormats = new Map();
export function formatEntryDate(value) {
  if (!dateFormats.has(language)) {
    dateFormats.set(language, new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }));
  }
  return dateFormats.get(language).format(new Date(value));
}

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
