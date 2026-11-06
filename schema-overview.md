# Overloader Database Schema

PostgreSQL database: `overloaderdb`  
Schema: `public`

Before writing SQL, SQLAlchemy models, Alembic migrations, FastAPI queries, or database-related code, read this document.

Do not invent tables or columns. Use only the tables and columns listed here.

## Conventions

- Table and column names use `snake_case`.
- Most tables use `id` as the primary key.
- `users.id` is the owner key for user-scoped data.
- Fitness log tables use `date` for the log date and `created_at` for insertion time.
- Legacy fitness tables mostly use `timestamp without time zone`.
- Overminder-related tables mostly use `timestamp with time zone`.
- `workout_logs` stores one row per set.
- Filter user-scoped queries by `user_id`.

## Relationships

```text
users 1—0..1 password_credentials
users 1—N social_accounts
users 1—N workout_logs
users 1—N body_logs
users 1—N cardio_logs
users 1—N meal_logs
users 1—N meal_templates
users 1—N meal_template_names
users 1—N routines
users 1—N spaces
users 1—N items
users 1—N reminders
users 1—N inbox_events

spaces 1—N items
items 1—N item_attachments
items 1—N reminders
items 1—N inbox_events
```

## users

| column | type | nullable | default |
|---|---|---|---|
| id | integer | NO | `nextval('users_id_seq')` |
| telegram_id | text | YES | NULL |
| name | text | YES | NULL |
| created_at | timestamp without time zone | YES | `now()` |
| google_id | text | YES | NULL |
| email | text | YES | NULL |
| email_verified | boolean | YES | `false` |
| profile_img | text | YES | NULL |
| telegram_bot_token | text | YES | NULL |
| telegram_chat_id | text | YES | NULL |
| discord_webhook_url | text | YES | NULL |
| link_code | text | YES | NULL |
| link_code_expires | timestamp without time zone | YES | NULL |
| goal_weight | numeric | YES | NULL |
| goal_body_fat | numeric | YES | NULL |
| goal_muscle | numeric | YES | NULL |
| ai_memo | text | YES | NULL |
| ai_last_result | text | YES | NULL |
| ai_last_updated | timestamp without time zone | YES | NULL |
| show_last_workout | boolean | YES | `true` |
| updated_at | timestamp without time zone | YES | `now()` |

Notes:

- There is no `username` or `display_name` column.
- Use `name` for the user display name.
- `email_verified` tracks verification of the optional contact email, distinct from social provider authentication.
- `google_id` is retained during auth migration for backwards compatibility and fallback.

## password_credentials

| column | type | nullable | default |
|---|---|---|---|
| user_id | integer | NO | NULL |
| username | character varying(50) | NO | NULL |
| password_hash | character varying(255) | NO | NULL |
| created_at | timestamp without time zone | YES | `now()` |
| updated_at | timestamp without time zone | YES | `now()` |

Notes:

- `user_id` is the primary key and foreign key referencing `users.id` with `ON DELETE CASCADE`.
- The 1:0..1 relationship with `users` is enforced because `user_id` is the primary key (at most one row per user).
- `username` has a unique constraint (`uq_password_credentials_username`).

## social_accounts

| column | type | nullable | default |
|---|---|---|---|
| id | integer | NO | `nextval('social_accounts_id_seq')` |
| user_id | integer | NO | NULL |
| provider | character varying(20) | NO | NULL |
| provider_user_id | character varying(255) | NO | NULL |
| email | character varying(255) | YES | NULL |
| created_at | timestamp without time zone | YES | `now()` |
| updated_at | timestamp without time zone | YES | `now()` |

Notes:

- `user_id` references `users.id` with `ON DELETE CASCADE`.
- `provider` is constrained to `'google'` or `'naver'` via check constraint `chk_social_accounts_provider`.
- Unique constraint `uq_social_accounts_provider_uid` on `(provider, provider_user_id)`.
- Unique constraint `uq_social_accounts_user_provider` on `(user_id, provider)`.
- Indexed by `user_id` (`idx_social_accounts_user_id`).

## workout_logs

| column | type | nullable | default |
|---|---|---|---|
| id | integer | NO | `nextval('workout_logs_id_seq')` |
| user_id | integer | YES | NULL |
| date | date | NO | NULL |
| workout_name | text | NO | NULL |
| weight_kg | double precision | NO | NULL |
| reps | integer | NO | NULL |
| unit | text | YES | `'kg'` |
| created_at | timestamp without time zone | YES | `now()` |
| memo | text | YES | NULL |
| duration_sec | integer | YES | NULL |
| set_type | text | YES | `'normal'` |
| set_group | uuid | YES | NULL |
| rest_time_sec | integer | YES | NULL |
| set_group_id | character varying | YES | NULL |
| set_group_type | character varying | YES | `'single'` |
| set_group_order | integer | YES | `1` |

Notes:

- One row represents one set.
- `set_group` is UUID; `set_group_id` is varchar. They are separate fields.
- Use `set_group`, `set_group_type`, and `set_group_order` when grouping sets.

## body_logs

| column | type | nullable | default |
|---|---|---|---|
| id | integer | NO | `nextval('body_logs_id_seq')` |
| user_id | integer | YES | NULL |
| date | date | NO | NULL |
| weight_kg | numeric | YES | NULL |
| body_fat_pct | numeric | YES | NULL |
| muscle_kg | numeric | YES | NULL |
| memo | text | YES | NULL |
| created_at | timestamp without time zone | YES | `now()` |

## cardio_logs

| column | type | nullable | default |
|---|---|---|---|
| id | integer | NO | `nextval('cardio_logs_id_seq')` |
| user_id | integer | NO | NULL |
| date | date | NO | `CURRENT_DATE` |
| cardio_name | character varying | NO | `'런닝머신'` |
| duration_min | numeric | YES | NULL |
| distance_km | numeric | YES | NULL |
| pace | character varying | YES | NULL |
| incline | numeric | YES | NULL |
| kcal | integer | YES | NULL |
| memo | character varying | YES | NULL |
| created_at | timestamp with time zone | YES | `now()` |

## meal_logs

| column | type | nullable | default |
|---|---|---|---|
| id | integer | NO | `nextval('meal_logs_id_seq')` |
| user_id | integer | YES | NULL |
| date | date | NO | NULL |
| meal_type | text | YES | NULL |
| food_name | text | NO | NULL |
| kcal | integer | YES | NULL |
| protein | numeric | YES | NULL |
| carb | numeric | YES | NULL |
| fat | numeric | YES | NULL |
| memo | text | YES | NULL |
| created_at | timestamp without time zone | YES | `now()` |

## meal_template_names

| column | type | nullable | default |
|---|---|---|---|
| id | integer | NO | `nextval('meal_template_names_id_seq')` |
| user_id | integer | NO | NULL |
| name | character varying | NO | NULL |
| sort_order | integer | YES | `0` |
| created_at | timestamp without time zone | YES | `now()` |

## meal_templates

| column | type | nullable | default |
|---|---|---|---|
| id | integer | NO | `nextval('meal_templates_id_seq')` |
| user_id | integer | NO | NULL |
| template_name | character varying | NO | NULL |
| meal_type | character varying | NO | NULL |
| food_name | character varying | NO | NULL |
| kcal | double precision | YES | NULL |
| protein | double precision | YES | NULL |
| carb | double precision | YES | NULL |
| fat | double precision | YES | NULL |
| memo | character varying | YES | NULL |
| sort_order | integer | YES | `0` |
| created_at | timestamp without time zone | YES | `now()` |
| serving_unit | character varying | YES | `'total'` |
| serving_size | numeric | YES | NULL |

## routines

| column | type | nullable | default |
|---|---|---|---|
| id | integer | NO | `nextval('routines_id_seq')` |
| user_id | integer | YES | NULL |
| name | text | NO | NULL |
| exercises | jsonb | YES | NULL |
| created_at | timestamp without time zone | YES | `now()` |
| sort_order | integer | YES | `0` |

## spaces

| column | type | nullable | default |
|---|---|---|---|
| id | bigint | NO | `nextval('spaces_id_seq')` |
| user_id | bigint | NO | NULL |
| name | text | NO | NULL |
| slug | text | NO | NULL |
| kind | text | NO | `'custom'` |
| color | text | YES | NULL |
| icon | text | YES | NULL |
| position | integer | NO | `0` |
| is_favorite | boolean | NO | `false` |
| created_at | timestamp with time zone | NO | `now()` |
| updated_at | timestamp with time zone | NO | `now()` |

## items

| column | type | nullable | default |
|---|---|---|---|
| id | bigint | NO | `nextval('items_id_seq')` |
| user_id | bigint | NO | NULL |
| space_id | bigint | YES | NULL |
| type | text | NO | NULL |
| source | text | NO | NULL |
| title | text | YES | NULL |
| content | text | YES | NULL |
| url | text | YES | NULL |
| preview_image_url | text | YES | NULL |
| para_type | text | NO | `'inbox'` |
| status | text | NO | `'active'` |
| priority | smallint | NO | `3` |
| ai_summary | text | YES | NULL |
| ai_tags | text[] | NO | `'{}'` |
| ai_action_points | text[] | NO | `'{}'` |
| ai_confidence | numeric | YES | NULL |
| is_favorite | boolean | NO | `false` |
| is_pinned | boolean | NO | `false` |
| remind_at | timestamp with time zone | YES | NULL |
| due_at | timestamp with time zone | YES | NULL |
| last_reviewed_at | timestamp with time zone | YES | NULL |
| created_at | timestamp with time zone | NO | `now()` |
| updated_at | timestamp with time zone | NO | `now()` |
| topic | text | YES | NULL |
| suggested_para | text | YES | NULL |
| content_type | text | YES | NULL |
| inbox_status | text | YES | `'new'` |

Notes:

- `ai_tags` and `ai_action_points` are PostgreSQL text arrays.
- `para_type`, `status`, and `inbox_status` are separate fields.

## reminders

| column | type | nullable | default |
|---|---|---|---|
| id | bigint | NO | `nextval('reminders_id_seq')` |
| user_id | bigint | NO | NULL |
| item_id | bigint | YES | NULL |
| channel | text | NO | NULL |
| remind_at | timestamp with time zone | NO | NULL |
| recurrence_rule | text | YES | NULL |
| status | text | NO | `'scheduled'` |
| sent_at | timestamp with time zone | YES | NULL |
| created_at | timestamp with time zone | NO | `now()` |

## inbox_events

| column | type | nullable | default |
|---|---|---|---|
| id | bigint | NO | `nextval('inbox_events_id_seq')` |
| user_id | bigint | NO | NULL |
| item_id | bigint | YES | NULL |
| source | text | NO | NULL |
| raw_text | text | YES | NULL |
| raw_payload | jsonb | NO | `'{}'` |
| processed | boolean | NO | `false` |
| created_at | timestamp with time zone | NO | `now()` |

## item_attachments

| column | type | nullable | default |
|---|---|---|---|
| id | bigint | NO | `nextval('item_attachments_id_seq')` |
| item_id | bigint | NO | NULL |
| kind | text | NO | NULL |
| file_url | text | NO | NULL |
| mime_type | text | YES | NULL |
| size_bytes | bigint | YES | NULL |
| created_at | timestamp with time zone | NO | `now()` |

## Foreign keys

| child table | child column | parent table | parent column |
|---|---|---|---|
| body_logs | user_id | users | id |
| cardio_logs | user_id | users | id |
| inbox_events | user_id | users | id |
| inbox_events | item_id | items | id |
| item_attachments | item_id | items | id |
| items | user_id | users | id |
| items | space_id | spaces | id |
| meal_logs | user_id | users | id |
| meal_template_names | user_id | users | id |
| meal_templates | user_id | users | id |
| password_credentials | user_id | users | id |
| social_accounts | user_id | users | id |
| reminders | user_id | users | id |
| reminders | item_id | items | id |
| routines | user_id | users | id |
| spaces | user_id | users | id |
| workout_logs | user_id | users | id |

## Nullable user_id caution

These tables currently allow `user_id` to be NULL:

- `body_logs.user_id`
- `meal_logs.user_id`
- `routines.user_id`
- `workout_logs.user_id`

These tables require `user_id`:

- `cardio_logs.user_id`
- `inbox_events.user_id`
- `items.user_id`
- `meal_template_names.user_id`
- `meal_templates.user_id`
- `password_credentials.user_id`
- `social_accounts.user_id`
- `reminders.user_id`
- `spaces.user_id`

When creating new features, do not assume every existing fitness log row has a valid `user_id`.