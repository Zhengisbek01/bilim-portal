import type { Request, Response, NextFunction } from "express";
import { z, ZodError, type ZodTypeAny } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
export const forbid = (msg = "Недостаточно прав для этого действия") => fail(403, msg);
export const notFound = (msg = "Не найдено") => fail(404, msg);

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Проверьте заполнение полей", fields: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Файл слишком большой" });
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
}

/** Дата 'YYYY-MM-DD' в часовом поясе сервера */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД");
export const optDate = z.union([isoDate, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
export const text = (max = 5000) => z.string().trim().min(1, "Обязательное поле").max(max);
