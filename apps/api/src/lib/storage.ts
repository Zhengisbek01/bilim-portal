/** Хранилище файлов: локальный диск сервера области (UPLOAD_DIR). Для S3/MinIO замените save/open. */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../env.js";

const root = () => path.resolve(env.UPLOAD_DIR);

export async function saveFile(buf: Buffer, originalName: string): Promise<string> {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
  const d = new Date();
  const key = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}${ext}`;
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
