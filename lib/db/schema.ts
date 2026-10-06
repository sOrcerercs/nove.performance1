import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', ['admin', 'executive', 'staff'])
export const confidenceEnum = pgEnum('confidence', ['high', 'mid', 'low'])
export const rollupEnum = pgEnum('rollup', ['sum', 'avg', 'last'])
export const periodStateEnum = pgEnum('period_state', ['active', 'closed', 'planned'])
export const periodKindEnum = pgEnum('period_kind', ['quarter', 'month', 'year'])
// No invite flow: an admin creates the account with its password, so a user is
// either active or deactivated.
export const userStateEnum = pgEnum('user_state', ['active', 'passive'])

export const helpCategoryEnum = pgEnum('help_category', [
  'basics',
  'okr',
  'checkin',
  'periods',
  'admin',
  'account',
  'other',
])

export const departments = pgTable('departments', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  emoji: text('emoji').notNull(),
  nameTr: text('name_tr').notNull(),
  nameEn: text('name_en').notNull(),
  /**
   * Set after users exist, so this is deliberately not a foreign key: seeding
   * departments and users in one pass would otherwise be circular.
   */
  leadUserId: text('lead_user_id'),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    /**
     * Null until someone types it in: the HR list has no email column, and a
     * person without one simply cannot sign in. The unique index still holds —
     * Postgres allows any number of NULLs under it.
     */
    email: text('email'),
    name: text('name').notNull(),
    // Null for `staff`: they are personnel records, not accounts.
    passwordHash: text('password_hash'),
    role: roleEnum('role').notNull().default('staff'),
    departmentId: text('department_id').references(() => departments.id),
    /** Who this person reports to — the organisation chart, one edge per person. */
    managerId: text('manager_id').references((): AnyPgColumn => users.id),
    /** Job title from the HR list. Display only. */
    title: text('title'),
    /**
     * Set when an admin issues a temporary password. The person cannot use the
     * app until they choose their own (see lib/auth/session.ts).
     */
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    state: userStateEnum('state').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
)

export const periods = pgTable('periods', {
  id: text('id').primaryKey(),
  /** `2026-Q3` for quarters, `2026-08` for months. */
  code: text('code').notNull().unique(),
  kind: periodKindEnum('kind').notNull().default('quarter'),
  state: periodStateEnum('state').notNull().default('planned'),
  startsOn: text('starts_on').notNull(),
  endsOn: text('ends_on').notNull(),
})

export const objectives = pgTable('objectives', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  departmentId: text('department_id')
    .notNull()
    .references(() => departments.id, { onDelete: 'cascade' }),
  periodId: text('period_id')
    .notNull()
    .references(() => periods.id),
  titleTr: text('title_tr').notNull(),
  titleEn: text('title_en').notNull(),
  ownerUserId: text('owner_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const keyResults = pgTable('key_results', {
  id: text('id').primaryKey(),
  objectiveId: text('objective_id')
    .notNull()
    .references(() => objectives.id, { onDelete: 'cascade' }),
  titleTr: text('title_tr').notNull(),
  titleEn: text('title_en').notNull(),
  // double precision, not numeric: the seed carries fractional measurements
  // (5.2%, 1.0%) and every percentage is rounded downstream anyway.
  start: doublePrecision('start').notNull(),
  current: doublePrecision('current').notNull(),
  target: doublePrecision('target').notNull(),
  unit: text('unit').notNull().default(''),
  confidence: confidenceEnum('confidence').notNull().default('mid'),
  /**
   * How this key result's monthly values collapse into a period figure. Written
   * now, read by the monthly breakdown — see the Faz 2 design.
   */
  rollup: rollupEnum('rollup').notNull().default('last'),
  /**
   * Share of the objective's progress, in percent (0 < w ≤ 100). Either every
   * key result of an objective has one and they add up to 100, or none does
   * and the objective averages its key results equally (see weights.ts).
   */
  weight: doublePrecision('weight'),
  ownerUserId: text('owner_user_id').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Audit trail for weekly check-ins. The prototype only kept "updated N days
 * ago" on the key result; persisting each change gives the activity feed real
 * history and makes progress auditable.
 */
export const checkins = pgTable('checkins', {
  id: text('id').primaryKey(),
  keyResultId: text('key_result_id')
    .notNull()
    .references(() => keyResults.id, { onDelete: 'cascade' }),
  authorUserId: text('author_user_id')
    .notNull()
    .references(() => users.id),
  previousValue: doublePrecision('previous_value').notNull(),
  newValue: doublePrecision('new_value').notNull(),
  confidence: confidenceEnum('confidence').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /**
   * Which month this check-in was recording. Null for rows written before
   * monthly entry existed. Without it, correcting an old month would look like
   * it happened today.
   */
  month: text('month'),
})

/**
 * A key result's measured value for one month. This is the source of truth for
 * progress; `key_results.current` is a derived summary of these rows.
 *
 * One row per key result per month — a correction overwrites rather than
 * appends, and the audit trail of who changed what lives in `checkins`.
 */
export const krMonthlyValues = pgTable(
  'kr_monthly_values',
  {
    id: text('id').primaryKey(),
    keyResultId: text('key_result_id')
      .notNull()
      .references(() => keyResults.id, { onDelete: 'cascade' }),
    /** `2026-08`. */
    month: text('month').notNull(),
    value: doublePrecision('value').notNull(),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => users.id),
    note: text('note'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('kr_monthly_values_kr_month_unique').on(t.keyResultId, t.month)],
)

/**
 * Failed sign-in throttling.
 *
 * Kept in the database rather than in memory because Vercel runs several
 * instances: an in-process counter would reset on every cold start and could
 * be sidestepped by spreading attempts across instances.
 *
 * Keyed by the submitted email, whether or not it belongs to a real account —
 * throttling only known accounts would turn the lockout into an oracle for
 * which addresses exist.
 */
export const loginAttempts = pgTable('login_attempts', {
  /** Normalised email address that was submitted. */
  key: text('key').primaryKey(),
  failedCount: integer('failed_count').notNull().default(0),
  firstFailedAt: timestamp('first_failed_at', { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
})

/**
 * Question-and-answer entries the admin adds on top of the built-in guide.
 *
 * The core guide lives in `lib/help/content.ts` under version control; this
 * table is for the questions a team discovers in daily use, so capturing them
 * does not need a deploy.
 */
export const helpArticles = pgTable('help_articles', {
  id: text('id').primaryKey(),
  category: helpCategoryEnum('category').notNull().default('other'),
  question: text('question').notNull(),
  /** Plain text. `**kalın**`, `` `kod` `` and blank-line paragraphs are rendered. */
  answer: text('answer').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  authorUserId: text('author_user_id').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Application-wide settings as key/value rows.
 *
 * Key/value rather than a column per setting: the app has exactly one setting
 * today (the default range start), and a typed column per future setting would
 * mean a migration each time. Values are stored as text and validated by the
 * action that writes them and again by the reader — a hand-edited row must not
 * be able to break a render.
 */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export type DepartmentRow = typeof departments.$inferSelect
export type UserRow = typeof users.$inferSelect
export type PeriodRow = typeof periods.$inferSelect
export type ObjectiveRow = typeof objectives.$inferSelect
export type KeyResultRow = typeof keyResults.$inferSelect
export type CheckinRow = typeof checkins.$inferSelect
export type KrMonthlyValueRow = typeof krMonthlyValues.$inferSelect
export type HelpArticleRow = typeof helpArticles.$inferSelect
export type AppSettingRow = typeof appSettings.$inferSelect
