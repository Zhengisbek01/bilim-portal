/**
 * Демо-данные: районы области Жетісу, 600 условных организаций, учётные записи всех ролей и примеры контента.
 * В рабочей среде организации загружаются из НОБД (см. scripts/import-orgs.ts), а пользователи создаются в кабинетах.
 */
import { q, one } from "./db.js";
import { addDays, today } from "./lib/http.js";

export const DISTRICTS = [
  { id: "tal", name: "г. Талдыкорган", town: "г. Талдыкорган", code: "7282", slug: "taldykorgan", w: 0.17 },
  { id: "tek", name: "г. Текели", town: "г. Текели", code: "72835", slug: "tekeli", w: 0.04 },
  { id: "aks", name: "Аксуский район", town: "п. Жансугуров", code: "72832", slug: "aksu", w: 0.09 },
  { id: "ala", name: "Алакольский район", town: "г. Ушарал", code: "72833", slug: "alakol", w: 0.09 },
  { id: "esk", name: "Ескельдинский район", town: "п. Карабулак", code: "72836", slug: "eskeldi", w: 0.09 },
  { id: "kar", name: "Каратальский район", town: "г. Уштобе", code: "72834", slug: "karatal", w: 0.08 },
  { id: "ker", name: "Кербулакский район", town: "п. Сарыозек", code: "72840", slug: "kerbulak", w: 0.09 },
  { id: "kok", name: "Коксуский район", town: "п. Балпык би", code: "72838", slug: "koksu", w: 0.09 },
  { id: "pan", name: "Панфиловский район", town: "г. Жаркент", code: "72831", slug: "panfilov", w: 0.15 },
  { id: "sar", name: "Саркандский район", town: "г. Саркан", code: "72839", slug: "sarkand", w: 0.10 },
];

function rng(s: number) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export async function seed() {
  if (await one(`SELECT 1 FROM orgs LIMIT 1`)) { console.log("[seed] данные уже есть — пропуск"); return; }
  const R = rng(19), pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)], ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const PEOPLE = ["Абая Кунанбаева", "Ыбырая Алтынсарина", "Ильяса Жансугурова", "Мухтара Ауэзова", "Шокана Уалиханова", "Жамбыла Жабаева", "Сакена Сейфуллина", "Магжана Жумабаева", "Биржан сала", "Ахмета Байтурсынова", "Миржакыпа Дулатова", "Кенена Азербаева"];
  const KG = ["Балапан", "Ақбота", "Айгөлек", "Балдырған", "Шұғыла", "Еркетай", "Құлыншақ", "Нұрай", "Жұлдыз", "Бөбек", "Ботақан", "Күншуақ", "Ертөстік", "Гүлдер", "Арайлым", "Таңшолпан"];
  const LN = ["Ахметова", "Сейткали", "Нурланова", "Жумабеков", "Касымова", "Абдрахманов", "Утегенова", "Бекболатов", "Есенова", "Ким", "Омарова", "Тлеубаев", "Мусина", "Ибраимов", "Садыкова", "Жакупов"];
  const FN = ["Айгуль", "Ерлан", "Гульнара", "Нурлан", "Сауле", "Бауыржан", "Динара", "Асхат", "Жанар", "Марат", "Алия", "Ержан", "Лаура", "Даурен"];
  const KEYS = ["about", "admin", "blog", "docs", "admission", "food", "budget", "anticorr", "vacancies", "news", "contacts"];

  for (const d of DISTRICTS) await q(`INSERT INTO districts(id, name, town, phone_code, slug) VALUES ($1,$2,$3,$4,$5)`, [d.id, d.name, d.town, d.code, d.slug]);
  let n = 0;
  const values: unknown[][] = [];
  for (const [di, d] of DISTRICTS.entries()) {
    const cnt = di === DISTRICTS.length - 1 ? 600 - n : Math.round(600 * d.w); let s = 0, k = 0;
    for (let i = 0; i < cnt; i++) {
      const isSchool = R() < 0.52; let name: string;
      if (isSchool) { s++; const r = R(); name = r < 0.62 ? `Средняя школа №${s}` : r < 0.75 ? `Школа-гимназия №${s}` : r < 0.82 ? `Школа-лицей №${s}` : `Средняя школа имени ${pick(PEOPLE)}`; }
      else { k++; name = `${R() < 0.7 ? "Ясли-сад" : "Детский сад"} «${pick(KG)}» №${k}`; }
      const fill = R(), sections: Record<string, boolean> = {};
      KEYS.forEach((key) => { sections[key] = ["about", "contacts", "admin", "blog"].includes(key) ? true : R() < 0.3 + fill * 0.7; });
      values.push([`o${++n}`, d.id, isSchool ? "school" : "kg", name, `${isSchool ? "sch" + s : "ds" + k}-${d.slug}`, `${pick(LN)} ${pick(FN)}`,
        `8 (${d.code}) ${ri(2, 5)}${ri(0, 9)}-${ri(10, 99)}-${ri(10, 99)}`, d.town, pick(["казахский", "казахский", "казахский и русский", "русский"]), isSchool ? ri(90, 1400) : ri(40, 320), JSON.stringify(sections)]);
    }
  }
  for (const v of values) await q(`INSERT INTO orgs(id, district_id, kind, name, slug, director, phone, address, lang, size, sections) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`, v);

  const school = "o1", kg = "o2";
  const director = (await one(`SELECT director FROM orgs WHERE id = $1`, [school]))!.director;
  await q(`UPDATE orgs SET about = $2, sections = sections || '{"about":true,"docs":true,"food":true}'::jsonb WHERE id = $1`, [school, "Общеобразовательная школа с углублённым изучением информатики. Две смены, 34 класса-комплекта, кружки робототехники, домбры и волейбола."]);

  // Демо-ИИН начинаются с 000000 — таких не бывает у реальных людей
  const U = async (full_name: string, role: string, extra: Record<string, unknown> = {}) =>
    // id детерминирован (по ИИН/телефону): сессия остаётся рабочей, даже если демо-база пересоздана на другом экземпляре
    (await one(`INSERT INTO users(id, full_name, role, iin, phone, org_id, district_id, pupil_id, note) VALUES (md5('bilim-demo:' || $9)::uuid, $1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [full_name, role, extra.iin ?? null, extra.phone ?? null, extra.org ?? null, extra.district ?? null, extra.pupil ?? null, extra.note ?? "", String(extra.iin ?? extra.phone ?? full_name)]))!.id as string;
  const op = await U("Сервисная служба платформы", "operator", { iin: "000000000001" });
  const reg = await U("Жумабекова Асель", "region", { iin: "000000000002", note: "Управление образования области" });
  await U("Аппарат акима области", "observer", { iin: "000000000003", note: "Только просмотр отчётов" });
  const dist = await U("Омарова Алия", "district", { iin: "000000000004", district: "tal", note: "Отдел образования г. Талдыкорган" });
  const head = await U(director, "head", { iin: "000000000005", org: school, note: "Директор" });
  const ed = await U("Касымова Жанар", "editor", { iin: "000000000006", org: school, note: "Заместитель директора по ВР" });
  const teacher = await U("Ибраимов Ержан", "teacher", { iin: "000000000007", org: school, note: "Учитель информатики" });
  await U("Мусина Лаура", "personnel", { iin: "000000000008", org: school, note: "Медицинская сестра" });
  const vos = await U("Есенова Гульнара", "teacher", { iin: "000000000009", org: kg, note: "Воспитатель старшей группы" });
  await U("Тлеубаев Асхат", "author", { iin: "000000000010", org: school, note: "Учитель физкультуры" });

  const c5a = (await one(`INSERT INTO classes(org_id, name, kind, teacher_id) VALUES ($1,'5 «А»','class',$2) RETURNING id`, [school, teacher]))!.id;
  const grp = (await one(`INSERT INTO classes(org_id, name, kind, teacher_id) VALUES ($1,'Старшая группа «Күншуақ»','group',$2) RETURNING id`, [kg, vos]))!.id;
  const P = async (org: string, cls: string, name: string) => (await one(`INSERT INTO pupils(org_id, class_id, full_name) VALUES ($1,$2,$3) RETURNING id`, [org, cls, name]))!.id as string;
  const aru = await P(school, c5a, "Сейтказы Аружан"); await P(school, c5a, "Ахметов Данияр"); const mad = await P(school, c5a, "Ким Мадина");
  const ali = await P(kg, grp, "Нурланов Алихан"); await P(kg, grp, "Бекболатова Айлин");
  const mom = await U("Сейтказы Сауле", "parent", { phone: "+77010000001", org: school, note: "Мама · Сейтказы Аружан" });
  await q(`INSERT INTO parent_children(user_id, pupil_id, relation) VALUES ($1,$2,'Мама')`, [mom, aru]);
  const dad = await U("Нурланов Марат", "parent", { phone: "+77010000002", org: kg, note: "Папа · Нурланов Алихан" });
  await q(`INSERT INTO parent_children(user_id, pupil_id, relation) VALUES ($1,$2,'Папа')`, [dad, ali]);
  await U("Сейтказы Аружан", "student", { phone: "+77010000003", org: school, pupil: aru, note: "5 «А»" });

  const t = today();
  await q(`INSERT INTO posts(org_id, title, body, tag, status, author_id, author_name, published_at) VALUES
    ($1,'День учителя: чествование педагогов','5 октября в школе прошли праздничные мероприятия. Ученики 11 классов провели уроки в начальной школе.','Новости','published',$2,'Касымова Жанар', now() - interval '5 days'),
    ($1,'Родительское собрание по итогам первой четверти','Собрание пройдёт в актовом зале в 18:00. Повестка: успеваемость, питание, дополнительные занятия.','Родителям','published',$2,'Касымова Жанар', now() - interval '2 days')`, [school, ed]);
  await q(`INSERT INTO posts(org_id, title, body, tag, status, author_id, author_name) VALUES ($1,'Районная олимпиада по информатике: 3 призёра','Ученики 9–10 классов заняли два вторых и одно третье место.','Олимпиады','review',$2,'Ибраимов Ержан')`, [school, teacher]);
  await q(`INSERT INTO posts(org_id, title, body, tag, status, author_id, author_name, comment) VALUES ($1,'Секция робототехники набирает учеников','Занятия по вторникам и четвергам, 5–8 классы.','Новости','returned',$2,'Ибраимов Ержан','Добавьте время занятий и кабинет')`, [school, teacher]);
  await q(`INSERT INTO documents(org_id, type, section, title, valid_until, uploader) VALUES ($1,'Устав организации','docs','Устав КГУ «Средняя школа №1»',NULL,'Касымова Жанар'), ($1,'Меню','food','Меню на прошлую неделю',$2,'Касымова Жанар')`, [school, addDays(t, -1)]);
  await q(`INSERT INTO remarks(org_id, section, text, due, status, created_by, author) VALUES ($1,'food','Меню на текущую неделю не загружено. Загрузите актуальное меню.',$2,'open',$3,'Омарова Алия · Отдел образования'),
    ('o3','budget','Не опубликован план госзакупок на текущий год.',$4,'open',$3,'Омарова Алия · Отдел образования')`, [school, addDays(t, 3), dist, addDays(t, -3)]);
  await q(`INSERT INTO appeals(id, org_id, name, contact, text, status, created_at) VALUES ('A-DEMO01',$1,'Айгерим','+7 701 000 00 00','Будет ли в этом году группа продлённого дня для 1 классов?','new', now() - interval '1 day'),
    ('A-DEMO02','o5','Нуржан','nurzhan@example.kz','Почему не работает спортзал после уроков?','new', now() - interval '16 days')`, [school]);
  await q(`INSERT INTO announcements(scope, text, until, created_by, author) VALUES ('region','Осенние каникулы для учащихся 1–11 классов — согласно приказу управления образования.',$1,$2,'Жумабекова Асель')`, [addDays(t, 20), reg]);
  await q(`INSERT INTO feed(scope, title, body, tag, audience, pinned, created_by, author) VALUES
    ('region','Открыт приём заявок на областной конкурс по робототехнике','Участвуют команды учащихся 5–11 классов. Заявки — через отделы образования районов.','Конкурсы и олимпиады','all',true,$1,'Жумабекова Асель'),
    ('region','Семинар для ответственных за сайты организаций','Онлайн-семинар по работе на платформе: публикации, документы, обращения.','Педагогам','staff',false,$1,'Жумабекова Асель'),
    ('tal','Родительский всеобуч по безопасности детей в интернете','Встреча для родителей в актовом зале средней школы №1.','Родителям','families',false,$2,'Омарова Алия')`, [reg, dist]);
  const hw = (await one(`INSERT INTO class_posts(class_id, type, subject, due, text, created_by, author) VALUES ($1,'homework','Информатика',$2,'Учебник § 5, задания 1–4. Нарисовать блок-схему утреннего распорядка дня.',$3,'Ибраимов Ержан') RETURNING id`, [c5a, addDays(t, 3), teacher]))!.id;
  await q(`INSERT INTO class_posts(class_id, type, subject, due, text, created_by, author) VALUES ($1,'announce','Экскурсия',$2,'Экскурсия в краеведческий музей. Сбор в 9:00 у школы.',$3,'Ибраимов Ержан'),
    ($4,'announce','Утренник',$5,'Осенний утренник в 10:00. Приводите детей к 9:30.',$6,'Есенова Гульнара')`, [c5a, addDays(t, 6), teacher, grp, addDays(t, 12), vos]);
  await q(`INSERT INTO homework_done(pupil_id, class_post_id) VALUES ($1,$2)`, [mad, hw]);
  await q(`INSERT INTO messages(pupil_id, sender_id, sender_name, sender_side, text, read_by_family) VALUES ($1,$2,'Сейтказы Сауле','family','Здравствуйте! Аружан пропустит урок в среду — запись к врачу. Какие задания будут?', true)`, [aru, mom]);
  const pers = (await one(`SELECT id FROM users WHERE role = 'personnel' LIMIT 1`))!.id;
  await q(`INSERT INTO tasks(org_id, assignee_id, title, due, status, created_by, author) VALUES ($1,$2,'Провести плановый медосмотр 1–4 классов',$3,'open',$4,$5), ($1,$6,'Загрузить актуальное меню',$7,'open',$4,$5)`, [school, pers, addDays(t, 9), head, director, ed, addDays(t, 2)]);
  await q(`INSERT INTO inner_posts(org_id, text, created_by, author) VALUES ($1,'Педсовет по итогам первой четверти — в пятницу в 15:00, кабинет 204.',$2,$3)`, [school, head, director]);
  await q(`INSERT INTO audit_log(user_id, user_name, role, action, org_id, district_id) VALUES ($1,'Сервисная служба платформы','operator','Платформа развёрнута, загружены демо-данные',NULL,NULL)`, [op]);
  console.log(`[seed] районов: ${DISTRICTS.length}, организаций: ${n}, демо-пользователей: 13`);
}
