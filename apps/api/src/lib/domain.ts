export const ROLES = {
  operator: "Оператор платформы",
  region: "Администратор области",
  observer: "Наблюдатель",
  district: "Администратор района",
  head: "Руководитель организации",
  editor: "Редактор сайта",
  author: "Автор",
  teacher: "Педагог / воспитатель",
  personnel: "Сотрудник организации",
  parent: "Родитель",
  student: "Ученик",
} as const;
export type Role = keyof typeof ROLES;

export const REGION_LEVEL: Role[] = ["operator", "region", "observer"];
export const ORG_STAFF: Role[] = ["head", "editor", "author", "teacher", "personnel"];
export const FAMILY: Role[] = ["parent", "student"];

/** Кто кому может выдавать доступ */
export const CAN_CREATE: Partial<Record<Role, Role[]>> = {
  operator: ["region"],
  region: ["district", "observer", "region"],
  district: ["head"],
  head: ["editor", "author", "teacher", "personnel"],
  editor: ["author"],
  teacher: ["parent", "student"],
};

export const SECTION_KEYS = ["about", "admin", "blog", "docs", "admission", "food", "budget", "anticorr", "vacancies", "news", "contacts"] as const;
export const REQUIRABLE = ["about", "admin", "docs", "admission", "food", "budget", "anticorr", "vacancies", "news", "contacts"] as const;
export const DEFAULT_REQUIRED = ["about", "admin", "docs", "admission", "food", "budget", "anticorr", "contacts"];
export const SECTION_TITLES: Record<string, string> = {
  about: "Об организации", admin: "Руководство", blog: "Блог руководителя", docs: "Устав и лицензия",
  admission: "Приём и зачисление", food: "Питание", budget: "Бюджет и госзакупки",
  anticorr: "Противодействие коррупции", vacancies: "Вакансии", news: "Новости", contacts: "Контакты",
};

/** Тип документа → раздел сайта */
export const DOC_TYPES: Record<string, string> = {
  "Устав организации": "docs",
  "Лицензия": "docs",
  "План работы на учебный год": "docs",
  "Меню": "food",
  "План госзакупок": "budget",
  "Отчёт об исполнении бюджета": "budget",
  "Антикоррупционный стандарт": "anticorr",
  "Другое": "docs",
};

export const POST_TAGS = ["Новости", "Олимпиады", "Спорт", "Родителям", "Приём"];
export const FEED_TAGS = ["Официально", "Мероприятия", "Конкурсы и олимпиады", "Родителям", "Педагогам", "Приём"];
