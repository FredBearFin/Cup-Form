import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRoasts } from "../src/lib/roast/sort.ts";
import { latestScoreOf } from "../src/lib/scoring/derive.ts";

type Spec = { id: string; date: string; updated?: string; sessions?: { at: string; q?: number; upd?: string }[] };
const mk = ({ id, date, updated, sessions = [] }: Spec) => ({
  id,
  roastDate: new Date(date),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date(updated ?? "2026-01-01"),
  cuppingSessions: sessions.map((s, i) => ({
    id: `${id}-s${i}`,
    cuppedAt: new Date(s.at),
    updatedAt: new Date(s.upd ?? s.at),
    scoringSchemaVersion: "cva-2024-v1",
    scores: s.q === undefined ? [{ attributeKey: "flavor", value: 9 }] : [{ attributeKey: "overall_quality", value: s.q }],
  })),
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join(",");

const a = mk({ id: "a", date: "2026-03-01", sessions: [{ at: "2026-03-10", q: 7 }] });
const b = mk({ id: "b", date: "2026-01-01", sessions: [{ at: "2026-01-10", q: 9 }] });
const c = mk({ id: "c", date: "2026-02-01" }); // never cupped
const d = mk({ id: "d", date: "2026-02-15", sessions: [{ at: "2026-02-20", q: 8 }] });

test("by roast date, both directions", () => {
  assert.equal(ids(sortRoasts([a, b, c, d], "ByRoastDateDesc")), "a,d,c,b");
  assert.equal(ids(sortRoasts([a, b, c, d], "ByRoastDateAsc")), "b,c,d,a");
});

test("by score ranks on overall_quality; unscored roasts go last in both directions", () => {
  assert.equal(ids(sortRoasts([a, b, c, d], "ByScoreDesc")), "b,d,a,c");
  assert.equal(ids(sortRoasts([a, b, c, d], "ByScoreAsc")), "a,d,b,c");
});

test("score is the LATEST cupping that has overall_quality, not the best or first", () => {
  const improving = mk({
    id: "x",
    date: "2026-01-01",
    sessions: [{ at: "2026-01-05", q: 6 }, { at: "2026-01-12", q: 9.5 }, { at: "2026-01-20" /* no quality */ }],
  });
  assert.equal(latestScoreOf(improving.cuppingSessions, "overall_quality"), 9.5);
  const vs = mk({ id: "y", date: "2026-01-01", sessions: [{ at: "2026-01-05", q: 8 }] });
  assert.equal(ids(sortRoasts([vs, improving], "ByScoreDesc")), "x,y");
});

test("recent activity uses the newest of the roast and any session update, descending", () => {
  const edited = mk({ id: "e", date: "2026-01-01", updated: "2026-06-01" });
  const cuppedLater = mk({ id: "f", date: "2026-01-01", updated: "2026-02-01", sessions: [{ at: "2026-07-01", upd: "2026-07-01" }] });
  const quiet = mk({ id: "g", date: "2026-01-01", updated: "2026-03-01" });
  assert.equal(ids(sortRoasts([quiet, edited, cuppedLater], "ByRecentActivity")), "f,e,g");
});

test("ties are broken deterministically and the input is not mutated", () => {
  const t1 = mk({ id: "t1", date: "2026-01-01" });
  const t2 = mk({ id: "t2", date: "2026-01-01" });
  const input = [t2, t1];
  assert.equal(ids(sortRoasts(input, "ByRoastDateDesc")), "t1,t2");
  assert.equal(ids(input), "t2,t1");
});
