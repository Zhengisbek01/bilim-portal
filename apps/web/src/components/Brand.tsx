/** Фирменные элементы: знак-шаңырақ, орнамент «қошқар мүйіз», иконки организаций */
import type { CSSProperties } from "react";

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="var(--accent)" />
      <circle cx="20" cy="20" r="11" fill="none" stroke="var(--sun)" strokeWidth="2" />
      <path d="M9 20h22M20 9v22M12.2 12.2l15.6 15.6M27.8 12.2 12.2 27.8" stroke="var(--sun)" strokeWidth="1.6" />
      <circle cx="20" cy="20" r="4" fill="var(--sun)" />
    </svg>
  );
}

const MOTIF = "M48 70V54M48 54c0-14-22-14-22-2 0 8 10 9 12 3M48 54c0-14 22-14 22-2 0 8-10 9-12 3M48 26c0 8-10 12-16 6M48 26c0 8 10 12 16 6M48 26v-8";

/** Фон-орнамент для тёмных блоков. Кладётся первым ребёнком в position:relative контейнер. */
export function Ornament({ id, opacity = 0.16 }: { id: string; opacity?: number }) {
  return (
    <svg className="ornament" width="100%" height="100%" style={{ opacity }} aria-hidden="true">
      <defs>
        <pattern id={id} width="96" height="96" patternUnits="userSpaceOnUse">
          <path d={MOTIF} fill="none" stroke="var(--sun)" strokeWidth="2.2" strokeLinecap="round" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

export function Motif({ size = 220, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" style={style} aria-hidden="true">
      <path d={MOTIF} fill="none" stroke="var(--sun)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

const ICONS = {
  school: "M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6M12 10v.01",
  kg: "M4 21V11l8-6 8 6v10M9 21v-5a3 3 0 0 1 6 0v5M12 9.5v.01",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14ZM20 20l-3.5-3.5",
  menu: "M5 11h14M7 11V7a5 5 0 0 1 10 0v4M6 11l1 9h10l1-9",
  plus: "M12 7v10M7 12h10M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5",
  chat: "M4 4h16v12H8l-4 4zM8 9h8M8 12h5",
  people: "M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM15 20c0-2.5 1-4.5 2.5-4.5S21 17.5 21 20",
  cap: "M3 8 12 4l9 4-9 4zM7 10v5c0 1.5 2.2 3 5 3s5-1.5 5-3v-5",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color = "currentColor", stroke = 1.8 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Плитка с иконкой школы или сада */
export function OrgTile({ kind, size = 52 }: { kind: "school" | "kg" | string; size?: number }) {
  const school = kind === "school";
  return (
    <span className="org-tile" style={{ width: size, height: size, background: school ? "var(--accent-soft)" : "var(--sun-soft)" }}>
      <Icon name={school ? "school" : "kg"} size={Math.round(size / 2)} color={school ? "var(--accent)" : "var(--sun-deep)"} />
    </span>
  );
}
