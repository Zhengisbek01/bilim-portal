/**
 * Хранилище файлов документов.
 * — Если задан BLOB_READ_WRITE_TOKEN — Vercel Blob (ключ = публичный URL файла).
 * — Иначе локальный диск сервера (UPLOAD_DIR), например на сервере области в Docker.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../env.js";
import { fail } from "./http.js";

const root = () => path.resolve(env.UPLOAD_DIR);
const useBlob = () => !!env.BLOB_READ_WRITE_TOKEN;
export const isRemoteKey = (key: string) => /^https?:\/\//.test(key);

export async function saveFile(buf: Buffer, originalName: string, mime?: string): Promise<string> {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
  const d = new Date();
  const key = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}${ext}`;
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    const r = await put(`documents/${key}`, buf, { access: "public", contentType: mime, token: env.BLOB_READ_WRITE_TOKEN });
    return r.url;
  }
  if (process.env.VERCEL) fail(503, "Хранилище файлов не подключено: создайте Vercel Blob в настройках проекта");
  const full = path.join(root(), key);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, buf);
  return key;
}
export function openFile(key: string) {
  const full = path.join(root(), key);
  if (!full.startsWith(root())) throw new Error("bad key");
  return fs.createReadStream(full);
}
export async function removeFile(key: string | null) {
  if (!key) return;
  if (isRemoteKey(key)) {
    if (!useBlob()) return;
    const { del } = await import("@vercel/blob");
    await del(key, { token: env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
    return;
  }
  await fsp.rm(path.join(root(), key), { force: true });
}
export const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg", "image/png",
]);
