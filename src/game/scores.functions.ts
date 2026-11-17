import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";

export type BoardRow = {
  rank: number;
  username: string;
  value: number;
  you: boolean;
};

export type ScoreBoard = {
  rows: BoardRow[];
  you: { rank: number; value: number } | null;
};

export type BoardsPayload = {
  username: string;
  fastest: ScoreBoard;
  today: ScoreBoard;
  meltdowns: ScoreBoard;
};

export type RunResult = { ok: true } | { ok: false; error: string };
export type NameResult = { ok: true; username: string } | { ok: false; error: string };

const NAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Kind = "fix" | "chaos";

function asNum(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function isUnique(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  if (code === "23505") return true;
  const message = "message" in err ? String((err as { message: unknown }).message) : "";
  return /duplicate|unique/i.test(message);
}

function seedFromName(name: string, userId: string): string {
  const compact = name.replace(/[^A-Za-z0-9_-]/g, "");
  if (compact.length >= 3) return compact.slice(0, 16);
  const tail = userId.replace(/[^A-Za-z0-9]/g, "").slice(-6).toLowerCase() || "shift";
  const seeded = `op${tail}`.slice(0, 16);
  return seeded.length >= 3 ? seeded : "opshift";
}

async function ensureProfile(sql: Sql, userId: string): Promise<string> {
  const existing = await sql<{ username: string }>`
    select username from profiles where user_id = ${userId} limit 1
  `;
  if (existing[0]?.username) return existing[0].username;

  const named = await sql<{ name: string }>`select name from "user" where id = ${userId} limit 1`;
  const base = seedFromName(named[0]?.name ?? "", userId);

  for (let i = 0; i < 30; i++) {
    const suffix = i === 0 ? "" : String(i);
    const username = `${base.slice(0, 16 - suffix.length)}${suffix}`;
    try {
      await sql`
        insert into profiles (user_id, username, username_key)
        values (${userId}, ${username}, ${username.toLowerCase()})
      `;
      return username;
    } catch (err) {
      const again = await sql<{ username: string }>`
        select username from profiles where user_id = ${userId} limit 1
      `;
      if (again[0]?.username) return again[0].username;
      if (!isUnique(err)) throw err;
    }
  }
  throw new Error("Could not assign a callsign.");
}

function mapRow(row: { username: string; value: unknown; rank: unknown; you: unknown }): BoardRow {
  return {
    rank: asNum(row.rank),
    username: row.username,
    value: asNum(row.value),
    you: asBool(row.you),
  };
}

async function ranked(
  sql: Sql,
  userId: string,
  mode: "fastest" | "today" | "meltdowns",
): Promise<ScoreBoard> {
  const rows =
    mode === "fastest"
      ? await sql<{ username: string; value: unknown; rank: unknown; you: unknown }>`
          select username, value, rank, you from (
            select
              p.username as username,
              min(r.seconds) as value,
              rank() over (order by min(r.seconds) asc) as rank,
              (p.user_id = ${userId}) as you
            from runs r
            inner join profiles p on p.user_id = r.user_id
            where r.kind = 'fix' and r.seconds is not null
            group by p.user_id, p.username
          ) board
          order by rank asc, username asc
          limit 12
        `
      : mode === "today"
        ? await sql<{ username: string; value: unknown; rank: unknown; you: unknown }>`
            select username, value, rank, you from (
              select
                p.username as username,
                count(*)::float8 as value,
                rank() over (order by count(*) desc) as rank,
                (p.user_id = ${userId}) as you
              from runs r
              inner join profiles p on p.user_id = r.user_id
              where r.kind = 'fix'
                and r.created_at >= (date_trunc('day', (now() at time zone 'utc')) at time zone 'utc')
              group by p.user_id, p.username
            ) board
            order by rank asc, username asc
            limit 12
          `
        : await sql<{ username: string; value: unknown; rank: unknown; you: unknown }>`
            select username, value, rank, you from (
              select
                p.username as username,
                count(*)::float8 as value,
                rank() over (order by count(*) desc) as rank,
                (p.user_id = ${userId}) as you
              from runs r
              inner join profiles p on p.user_id = r.user_id
              where r.kind = 'chaos'
              group by p.user_id, p.username
            ) board
            order by rank asc, username asc
            limit 12
          `;

  const mine =
    mode === "fastest"
      ? await sql<{ rank: unknown; value: unknown }>`
          select rank, value from (
            select
              user_id,
              min(seconds) as value,
              rank() over (order by min(seconds) asc) as rank
            from runs
            where kind = 'fix' and seconds is not null
            group by user_id
          ) board
          where user_id = ${userId}
          limit 1
        `
      : mode === "today"
        ? await sql<{ rank: unknown; value: unknown }>`
            select rank, value from (
              select
                user_id,
                count(*)::float8 as value,
                rank() over (order by count(*) desc) as rank
              from runs
              where kind = 'fix'
                and created_at >= (date_trunc('day', (now() at time zone 'utc')) at time zone 'utc')
              group by user_id
            ) board
            where user_id = ${userId}
            limit 1
          `
        : await sql<{ rank: unknown; value: unknown }>`
            select rank, value from (
              select
                user_id,
                count(*)::float8 as value,
                rank() over (order by count(*) desc) as rank
              from runs
              where kind = 'chaos'
              group by user_id
            ) board
            where user_id = ${userId}
            limit 1
          `;

  return {
    rows: rows.map(mapRow),
    you: mine[0] ? { rank: asNum(mine[0].rank), value: asNum(mine[0].value) } : null,
  };
}

export const getBoards = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BoardsPayload> => {
    const sql = await getSql();
    const userId = context.userId;
    const username = await ensureProfile(sql, userId);
    const [fastest, today, meltdowns] = await Promise.all([
      ranked(sql, userId, "fastest"),
      ranked(sql, userId, "today"),
      ranked(sql, userId, "meltdowns"),
    ]);
    return { username, fastest, today, meltdowns };
  });

export const setUsername = createServerFn({ method: "POST" })
  .validator((data: { username?: string }) => ({
    username: typeof data?.username === "string" ? data.username.trim() : "",
  }))
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<NameResult> => {
    if (!NAME_RE.test(data.username)) {
      return { ok: false, error: "Use 3–16 letters, numbers, _ or -." };
    }
    const sql = await getSql();
    const userId = context.userId;
    await ensureProfile(sql, userId);
    const key = data.username.toLowerCase();
    const taken = await sql<{ user_id: string }>`
      select user_id from profiles where username_key = ${key} and user_id <> ${userId} limit 1
    `;
    if (taken.length) return { ok: false, error: "That callsign is taken." };
    await sql`
      update profiles
      set username = ${data.username}, username_key = ${key}, updated_at = now()
      where user_id = ${userId}
    `;
    return { ok: true, username: data.username };
  });

export const recordRun = createServerFn({ method: "POST" })
  .validator((data: { kind?: string; seconds?: number | null; token?: string }) => {
    const raw = data?.kind;
    const kind: Kind | null = raw === "fix" || raw === "fixed" ? "fix" : raw === "chaos" ? "chaos" : null;
    return {
      kind,
      seconds: typeof data?.seconds === "number" ? data.seconds : null,
      token: typeof data?.token === "string" ? data.token : "",
    };
  })
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<RunResult> => {
    if (!data.kind || !TOKEN_RE.test(data.token)) return { ok: false, error: "Bad shift." };
    let seconds: number | null = null;
    if (data.kind === "fix") {
      if (data.seconds === null || !Number.isFinite(data.seconds) || data.seconds < 0.5 || data.seconds > 7200) {
        return { ok: false, error: "That time does not count." };
      }
      seconds = Math.round(data.seconds * 10) / 10;
    }
    const sql = await getSql();
    const userId = context.userId;
    await ensureProfile(sql, userId);

    const prior = await sql<{ token: string; age: unknown }>`
      select client_token as token, extract(epoch from (now() - created_at))::float8 as age
      from runs
      where user_id = ${userId} and kind = ${data.kind}
      order by created_at desc
      limit 1
    `;
    if (prior[0]?.token === data.token) return { ok: true };
    const gap = data.kind === "chaos" ? 20 : 1;
    const age = prior[0] ? asNum(prior[0].age) : Number.POSITIVE_INFINITY;
    if (age < gap) return { ok: false, error: "Shift posted too fast to count." };

    await sql`
      insert into runs (user_id, kind, seconds, client_token)
      values (${userId}, ${data.kind}, ${seconds}, ${data.token})
      on conflict (user_id, client_token) do nothing
    `;
    return { ok: true };
  });
