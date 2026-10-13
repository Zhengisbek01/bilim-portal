/**
 * Миграции схемы. Хранятся в коде, чтобы попадать в сборку serverless-функции (Vercel) без отдельных файлов.
 * Новая миграция — новый элемент массива с уникальным именем; применённые не изменяйте.
 */
export const MIGRATIONS: { name: string; sql: string }[] = [
  { name: "001_init.sql", sql: `
-- Білім порталы: начальная схема
-- PostgreSQL 14+ (также запускается на PGlite для локальной разработки и тестов)

CREATE TABLE districts (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  town        text NOT NULL,
  phone_code  text NOT NULL DEFAULT '',
  slug        text NOT NULL UNIQUE
);

CREATE TABLE orgs (
  id          text PRIMARY KEY,
  district_id text NOT NULL REFERENCES districts(id),
  kind        text NOT NULL CHECK (kind IN ('school','kg')),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  bin         text,
  director    text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  address     text NOT NULL DEFAULT '',
  reception   text NOT NULL DEFAULT '',
  about       text NOT NULL DEFAULT '',
  vacancies   text NOT NULL DEFAULT '',
  lang        text NOT NULL DEFAULT '',
  size        integer NOT NULL DEFAULT 0,
  sections    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orgs_district_idx ON orgs(district_id);

CREATE TABLE classes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('class','group')),
  teacher_id  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classes_org_idx ON classes(org_id);

CREATE TABLE pupils (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pupils_class_idx ON pupils(class_id);

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text NOT NULL,
  role        text NOT NULL CHECK (role IN ('operator','region','observer','district','head','editor','author','teacher','personnel','parent','student')),
  iin         text UNIQUE,
  phone       text,
  org_id      text REFERENCES orgs(id) ON DELETE CASCADE,
  district_id text REFERENCES districts(id),
  pupil_id    uuid REFERENCES pupils(id) ON DELETE CASCADE,
  note        text NOT NULL DEFAULT '',
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_org_idx ON users(org_id);
CREATE INDEX users_phone_idx ON users(phone);
ALTER TABLE classes ADD CONSTRAINT classes_teacher_fk FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE parent_children (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pupil_id  uuid NOT NULL REFERENCES pupils(id) ON DELETE CASCADE,
  relation  text NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, pupil_id)
);

CREATE TABLE posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title         text NOT NULL,
  body          text NOT NULL,
  tag           text NOT NULL DEFAULT 'Новости',
  status        text NOT NULL CHECK (status IN ('draft','review','returned','published')),
  comment       text NOT NULL DEFAULT '',
  author_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name   text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);
CREATE INDEX posts_org_status_idx ON posts(org_id, status);

CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type         text NOT NULL,
  section      text NOT NULL,
  title        text NOT NULL,
  valid_until  date,
  file_key     text,
  file_name    text,
  mime         text,
  size         integer,
  uploaded_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  uploader     text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_org_idx ON documents(org_id);

CREATE TABLE remarks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  section     text NOT NULL,
  text        text NOT NULL,
  due         date NOT NULL,
  status      text NOT NULL CHECK (status IN ('open','fixed','closed')),
  reply       text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  author      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  fixed_at    timestamptz,
  closed_at   timestamptz
);
CREATE INDEX remarks_org_idx ON remarks(org_id, status);

CREATE TABLE appeals (
  id           text PRIMARY KEY,
  org_id       text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name         text NOT NULL,
  contact      text NOT NULL,
  text         text NOT NULL,
  status       text NOT NULL CHECK (status IN ('new','work','answered')),
  answer       text NOT NULL DEFAULT '',
  is_public    boolean NOT NULL DEFAULT false,
  answered_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  answered_at  timestamptz
);
CREATE INDEX appeals_org_idx ON appeals(org_id, status);

CREATE TABLE announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL,            -- 'region' или id района
  text        text NOT NULL,
  until       date,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  author      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feed (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL,            -- 'region' или id района
  title       text NOT NULL,
  body        text NOT NULL,
  tag         text NOT NULL DEFAULT 'Официально',
  audience    text NOT NULL CHECK (audience IN ('all','families','staff')),
  until       date,
  link        text NOT NULL DEFAULT '',
  pinned      boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  author      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE class_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('homework','announce')),
  subject     text NOT NULL DEFAULT '',
  due         date,
  text        text NOT NULL,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  author      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX class_posts_class_idx ON class_posts(class_id);

CREATE TABLE homework_done (
  pupil_id       uuid NOT NULL REFERENCES pupils(id) ON DELETE CASCADE,
  class_post_id  uuid NOT NULL REFERENCES class_posts(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pupil_id, class_post_id)
);

CREATE TABLE messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pupil_id         uuid NOT NULL REFERENCES pupils(id) ON DELETE CASCADE,
  sender_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  sender_name      text NOT NULL,
  sender_side      text NOT NULL CHECK (sender_side IN ('family','teacher')),
  text             text NOT NULL,
  read_by_teacher  boolean NOT NULL DEFAULT false,
  read_by_family   boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_pupil_idx ON messages(pupil_id, created_at);

CREATE TABLE tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  assignee_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  due          date,
  status       text NOT NULL CHECK (status IN ('open','done')),
  report       text NOT NULL DEFAULT '',
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  author       text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  done_at      timestamptz
);
CREATE INDEX tasks_assignee_idx ON tasks(assignee_id, status);

CREATE TABLE inner_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  text        text NOT NULL,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  author      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE config (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);

CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  user_id      uuid,
  user_name    text NOT NULL,
  role         text NOT NULL,
  action       text NOT NULL,
  org_id       text,
  district_id  text
);
CREATE INDEX audit_at_idx ON audit_log(at DESC);
CREATE INDEX audit_org_idx ON audit_log(org_id, at DESC);
CREATE INDEX audit_district_idx ON audit_log(district_id, at DESC);

CREATE TABLE otp_codes (
  phone       text PRIMARY KEY,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0
);

CREATE TABLE auth_challenges (
  nonce       text PRIMARY KEY,
  expires_at  timestamptz NOT NULL
);
` },
];
