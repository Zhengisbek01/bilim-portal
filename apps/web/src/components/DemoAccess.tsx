import { useNavigate } from "react-router-dom";

export const DEMO_PASSWORD = "Bilim2026";
/** Тестовые учётные записи для показа платформы */
export const TEST_USERS: [string, string, string][] = [
  ["region", "Администратор области", "Управление образования"],
  ["akimat", "Наблюдатель акимата", "Только просмотр отчётов"],
  ["operator", "Оператор платформы", "Сервисная служба"],
  ["district", "Администратор района", "Отдел образования г. Талдыкорган"],
  ["director", "Руководитель", "Директор школы"],
  ["editor", "Редактор", "Заместитель директора"],
  ["author", "Автор", "Учитель физкультуры"],
  ["teacher", "Педагог", "Классный руководитель 5 «А»"],
  ["kg_teacher", "Педагог", "Воспитатель детского сада"],
  ["staff", "Сотрудник", "Медицинская сестра"],
  ["parent", "Родитель", "Мама ученицы 5 «А»"],
  ["parent_kg", "Родитель", "Папа воспитанника детсада"],
  ["student", "Ученик", "5 «А»"],
];

/** Блок «Тестовый доступ»: логины и пароль на виду; onPick — подставить в форму, иначе переход на /login */
export function DemoAccess({ onPick }: { onPick?: (login: string) => void }) {
  const nav = useNavigate();
  const pick = (l: string) => (onPick ? onPick(l) : nav(`/login?u=${l}`));
  return (
    <section className="panel" style={{ padding: "22px 24px", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Тестовый доступ</h2>
        <span>Пароль для всех ролей: <b style={{ fontSize: "1.15em", letterSpacing: 1 }}>{DEMO_PASSWORD}</b></span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Нажмите на роль — логин и пароль подставятся автоматически.</p>
      <div className="accs">{TEST_USERS.map(([l, role, who]) => (
        <button key={l} type="button" className="acc" onClick={() => pick(l)}>
          <span className="rl">{role}</span><b>{l}</b><span className="muted small">{who}</span></button>))}</div>
    </section>
  );
}
