import { createContext, useContext, type ReactNode } from "react";
import { useApi } from "./hooks";

export interface Meta {
  regionName: string; domain: string; districts: { id: string; name: string; town: string }[];
  requirements: { school: string[]; kg: string[]; appealDays: number }; maintenance: string;
  sectionTitles: Record<string, string>; counts: { total: number; schools: number; kgs: number };
}
const MetaCtx = createContext<{ meta: Meta | null; reload: () => void }>({ meta: null, reload: () => {} });
export function MetaProvider({ children }: { children: ReactNode }) {
  const { data, reload } = useApi<Meta>("/public/meta");
  return <MetaCtx.Provider value={{ meta: data, reload }}>{children}</MetaCtx.Provider>;
}
export const useMeta = () => useContext(MetaCtx);

export const SECTION_KEYS = ["about", "admin", "blog", "docs", "admission", "food", "budget", "anticorr", "vacancies", "news", "contacts"] as const;
export const REQUIRABLE = ["about", "admin", "docs", "admission", "food", "budget", "anticorr", "vacancies", "news", "contacts"];
export const SEC: Record<string, { ru: string; kk: string; en: string }> = {
  about: { ru: "Об организации", kk: "Ұйым туралы", en: "About" },
  admin: { ru: "Руководство", kk: "Басшылық", en: "Leadership" },
  blog: { ru: "Блог руководителя", kk: "Басшы блогы", en: "Ask the director" },
  docs: { ru: "Устав и лицензия", kk: "Жарғы және лицензия", en: "Charter & license" },
  admission: { ru: "Приём и зачисление", kk: "Қабылдау", en: "Admission" },
  food: { ru: "Питание", kk: "Тамақтану", en: "Meals" },
  budget: { ru: "Бюджет и госзакупки", kk: "Бюджет және сатып алу", en: "Budget & procurement" },
  anticorr: { ru: "Противодействие коррупции", kk: "Сыбайлас жемқорлыққа қарсы іс-қимыл", en: "Anti-corruption" },
  vacancies: { ru: "Вакансии", kk: "Бос орындар", en: "Vacancies" },
  news: { ru: "Новости", kk: "Жаңалықтар", en: "News" },
  contacts: { ru: "Контакты", kk: "Байланыс", en: "Contacts" },
};
export const DOC_TYPES = ["Устав организации", "Лицензия", "План работы на учебный год", "Меню", "План госзакупок", "Отчёт об исполнении бюджета", "Антикоррупционный стандарт", "Другое"];
export const POST_TAGS = ["Новости", "Олимпиады", "Спорт", "Родителям", "Приём"];
export const FEED_TAGS = ["Официально", "Мероприятия", "Конкурсы и олимпиады", "Родителям", "Педагогам", "Приём"];
export const AUDIENCE: Record<string, string> = { all: "Для всех", families: "Родителям и ученикам", staff: "Персоналу" };
