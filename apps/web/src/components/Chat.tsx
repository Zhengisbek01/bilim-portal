import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useApi, useAction } from "../lib/hooks";
import { fdt } from "../lib/format";
import { Loading, ErrorText } from "./ui";

/** Переписка по ребёнку: педагог ↔ родители. Обновляется раз в 20 секунд. */
export function Chat({ pupilId, onRead }: { pupilId: string; onRead?: () => void }) {
  const { data, error, reload } = useApi<any>(`/pupils/${pupilId}/messages`);
  const [text, setText] = useState("");
  const { busy, run } = useAction();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setInterval(reload, 20000); return () => clearInterval(t); }, [reload]);
  useEffect(() => { if (data) onRead?.(); box.current?.scrollTo(0, box.current.scrollHeight); }, [data]); // eslint-disable-line
  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (await run(() => api.post(`/pupils/${pupilId}/messages`, { text }))) { setText(""); reload(); }
  };
  return (
    <div className="panel" style={{ gap: 10 }}>
      <div className="thread" ref={box}>
        {data.messages.length ? data.messages.map((m: any) => {
          const mine = m.sender_side === data.side;
          return <div key={m.id} className="bubble" style={{ justifySelf: mine ? "end" : "start", background: mine ? "var(--accent-soft)" : "var(--surface-2)" }}>
            <div className="small"><b>{m.sender_name}</b> <span className="muted">{fdt(m.created_at)}</span></div><div className="pre">{m.text}</div></div>;
        }) : <div className="muted small">Сообщений пока нет.</div>}
      </div>
      <form className="row" onSubmit={send}>
        <input className="in" value={text} onChange={(e) => setText(e.target.value)} placeholder="Сообщение" style={{ flex: 1, minWidth: 180 }} aria-label="Сообщение" />
        <button className="btn pri" disabled={busy || !text.trim()}>Отправить</button>
      </form>
    </div>
  );
}
