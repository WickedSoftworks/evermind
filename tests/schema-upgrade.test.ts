import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `supabase/upgrade/2_14_5_to_3_0_0.sql` says the same things as
 * `supabase/migrations/`, and this checks that it still does.
 *
 * The upgrade script exists because a hand-built 2.x database cannot be brought
 * forward by the CLI, so it restates every migration in one transaction. That
 * duplication is the point and also the hazard: change a bound in a migration,
 * forget the upgrade script, and two deployments of "3.0.0" end up with
 * different schemas. Nothing would fail — the app would work on both — until
 * one of them refused a write the other accepted.
 *
 * There is no Postgres in this project's test environment, so this cannot run
 * either file. What it can do is read them and insist that every rule one
 * declares, the other declares too. The expectations are *derived* from the
 * migrations rather than written out here, so a new migration is covered the
 * day it lands rather than the day somebody remembers this file.
 */

const ROOT = join(import.meta.dir, "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const UPGRADE = join(ROOT, "supabase", "upgrade", "2_14_5_to_3_0_0.sql");

/** Comments stripped and whitespace flattened, so formatting cannot fail this. */
function normalise(sql: string): string {
  return sql
    .replace(/^\s*--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

const migrationFiles = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const migrations = normalise(migrationFiles.map((name) => readFileSync(join(MIGRATIONS, name), "utf8")).join("\n"));
const upgrade = normalise(readFileSync(UPGRADE, "utf8"));

function matchesIn(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

describe("the upgrade script and the migrations agree", () => {
  test("there are migrations to compare against", () => {
    // Guards against a rename turning this whole suite into a tautology.
    expect(migrationFiles.length).toBeGreaterThanOrEqual(5);
  });

  test("every named CHECK constraint is added in both", () => {
    // Catches a bound being widened or narrowed in one place only — the failure
    // this file mostly exists for.
    const declared = matchesIn(migrations, /ADD CONSTRAINT \w+ CHECK \([^;]+\)/g);

    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((constraint) => !upgrade.includes(constraint))).toEqual([]);
  });

  test("every table the migrations create is accounted for in the upgrade", () => {
    const tables = new Set(
      matchesIn(migrations, /CREATE TABLE IF NOT EXISTS (\w+)/g).map((match) =>
        match.replace("CREATE TABLE IF NOT EXISTS ", ""),
      ),
    );

    expect(tables).toEqual(new Set(["assignments", "classes", "retention_settings"]));

    // Two of the three are created. `assignments` is the exception and has to
    // be: the upgrade script's starting point is a database that already holds
    // somebody's coursework, so a `CREATE TABLE IF NOT EXISTS` there would
    // quietly succeed against an empty project and migrate nothing. It demands
    // the table instead, and says so.
    for (const table of ["classes", "retention_settings"]) {
      expect(`${table}: ${upgrade.includes(`CREATE TABLE IF NOT EXISTS ${table}`)}`).toBe(`${table}: true`);
    }

    expect(upgrade).not.toContain("CREATE TABLE IF NOT EXISTS assignments");
    expect(upgrade).toContain("to_regclass('public.assignments') IS NULL");
  });

  test("every policy is created in both", () => {
    // A policy present in one and missing in the other is the difference
    // between a table a user can write to and one they cannot.
    const policies = new Set(matchesIn(migrations, /CREATE POLICY "[^"]+" ON \w+ FOR \w+/g));

    expect(policies.size).toBe(9);
    expect([...policies].filter((policy) => !upgrade.includes(policy))).toEqual([]);
  });

  test("the grants withheld from retention_settings are withheld in both", () => {
    // The one place in the schema where a missing REVOKE would let a signed-in
    // user rewrite their own retention from the SQL console.
    const grants = matchesIn(migrations, /(?:REVOKE|GRANT) [A-Z, ]+ ON retention_settings (?:FROM|TO) \w+/g);

    expect(grants.length).toBe(3);
    expect(grants.filter((grant) => !upgrade.includes(grant))).toEqual([]);
  });

  test("the completion trigger is defined identically", () => {
    // Compared as a whole body rather than by name: a trigger that exists in
    // both but stamps a different column, or clears it on a different
    // condition, is the case a name check would wave through.
    const body = /CREATE OR REPLACE FUNCTION public\.stamp_completed_at\(\).*?END; \$\$;/;

    const inMigrations = migrations.match(body)?.[0];
    const inUpgrade = upgrade.match(body)?.[0];

    expect(inMigrations).toBeDefined();
    expect(inUpgrade).toBe(inMigrations as string);
  });

  test("both attach that trigger the same way", () => {
    const attachment = "CREATE TRIGGER handle_completed_at BEFORE INSERT OR UPDATE ON assignments";

    expect(migrations).toContain(attachment);
    expect(upgrade).toContain(attachment);
  });

  test("neither reintroduces the superseded class name limit", () => {
    // `classes_name_check` is the inline 100 from `scripts/002`. The upgrade
    // script must not create a `classes` table carrying it, and the migrations
    // must keep dropping it — otherwise the effective limit silently returns to
    // 100 while `classes_name_length` claims 200.
    expect(upgrade).not.toContain("CHECK (char_length(name) <= 100)");
    expect(migrations).toContain("ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_name_check");
    expect(upgrade).toContain("ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_name_check");
  });
});

describe("the upgrade script is safe to run", () => {
  test("it is a single transaction", () => {
    // Its whole advantage over running the migrations by hand. Counted on the
    // raw text, because `BEGIN` also opens every plpgsql block.
    const raw = readFileSync(UPGRADE, "utf8");

    expect(raw.match(/^BEGIN;$/gm)?.length).toBe(1);
    expect(raw.match(/^COMMIT;$/gm)?.length).toBe(1);
  });

  test("it refuses to run against a database that is not Evermind", () => {
    expect(upgrade).toContain("to_regclass('public.assignments') IS NULL");
    expect(upgrade).toContain("RAISE EXCEPTION");
  });

  test("it starts the retention clock at upgrade time, not at the last edit", () => {
    // The single most destructive thing this script could get wrong: backfilling
    // `completed_at` from `updated_at` would make the first sweep delete an
    // account's whole history on the next dashboard load.
    expect(upgrade).toContain("SET completed_at = NOW() WHERE status = 'completed' AND completed_at IS NULL");
    expect(upgrade).not.toContain("completed_at = updated_at");
  });

  test("it is not somewhere `supabase db push` would find it", () => {
    // A sixth file in `supabase/migrations/` would be applied as a migration in
    // its own right, out of order and on top of the five it duplicates.
    expect(readdirSync(MIGRATIONS)).not.toContain("2_14_5_to_3_0_0.sql");
    expect(UPGRADE).toBe(join(ROOT, "supabase", "upgrade", "2_14_5_to_3_0_0.sql"));
  });
});
