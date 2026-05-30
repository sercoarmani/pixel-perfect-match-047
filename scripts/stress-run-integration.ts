#!/usr/bin/env bun
/**
 * CI-Stressrunner für die parallelen Supabase-Integrationstests.
 *
 * Führt scripts/scenario-bestaetigung-dedupe.integration.test.ts N-mal
 * hintereinander aus und legt zwischen den Läufen einen zufälligen
 * Delay (Default 200–1500 ms) ein, damit Race-Konstellationen mit
 * unterschiedlichem Timing getroffen werden.
 *
 * ENV / CLI:
 *   STRESS_RUNS         (default 20)   – Anzahl Iterationen
 *   STRESS_DELAY_MIN_MS (default 200)
 *   STRESS_DELAY_MAX_MS (default 1500)
 *   STRESS_SEED         (optional)     – deterministische Reihenfolge
 *   STRESS_FAIL_FAST    (default "1")  – bei erstem Fehler abbrechen
 *
 *   bun scripts/stress-run-integration.ts [runs]
 *
 * Exit-Code: 0 wenn alle Läufe grün, sonst 1.
 */
import { spawn } from "node:child_process";

const RUNS = Number(process.argv[2] ?? process.env.STRESS_RUNS ?? 20);
const MIN = Number(process.env.STRESS_DELAY_MIN_MS ?? 200);
const MAX = Number(process.env.STRESS_DELAY_MAX_MS ?? 1500);
const FAIL_FAST = (process.env.STRESS_FAIL_FAST ?? "1") !== "0";
const SEED = process.env.STRESS_SEED ? Number(process.env.STRESS_SEED) : null;

// Kleiner deterministischer PRNG (mulberry32), falls SEED gesetzt
function makeRand(seed: number | null): () => number {
  if (seed == null) return Math.random;
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRand(SEED);

const TEST_FILE = "scripts/scenario-bestaetigung-dedupe.integration.test.ts";

function runOnce(idx: number): Promise<{ code: number; ms: number; tail: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn("bun", ["test", TEST_FILE], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.stderr.on("data", (b) => (out += b.toString()));
    child.on("close", (code) => {
      const tail = out.trim().split("\n").slice(-6).join("\n");
      resolve({ code: code ?? 1, ms: Date.now() - start, tail });
    });
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pad(n: number, w = 3) {
  return String(n).padStart(w, " ");
}

async function main() {
  console.log(
    `[stress] runs=${RUNS} delay=${MIN}-${MAX}ms fail_fast=${FAIL_FAST} seed=${SEED ?? "random"}`,
  );
  const results: Array<{ idx: number; code: number; ms: number }> = [];
  let failures = 0;

  for (let i = 1; i <= RUNS; i++) {
    const { code, ms, tail } = await runOnce(i);
    results.push({ idx: i, code, ms });
    const status = code === 0 ? "PASS" : "FAIL";
    console.log(`[stress] ${pad(i)}/${RUNS}  ${status}  ${pad(ms, 5)}ms`);
    if (code !== 0) {
      failures++;
      console.error(`---- run ${i} output (tail) ----\n${tail}\n--------------------------------`);
      if (FAIL_FAST) break;
    }
    if (i < RUNS) {
      const delay = Math.floor(MIN + rand() * Math.max(0, MAX - MIN));
      await sleep(delay);
    }
  }

  const passed = results.filter((r) => r.code === 0).length;
  const total = results.length;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))] ?? 0;
  const avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);

  console.log("");
  console.log(`[stress] summary: ${passed}/${total} passed, ${failures} failed`);
  console.log(
    `[stress] timing  : min=${times[0] ?? 0}ms  avg=${Math.round(avg)}ms  p50=${p(0.5)}ms  p95=${p(0.95)}ms  max=${times.at(-1) ?? 0}ms`,
  );

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[stress] runner crashed", e);
  process.exit(2);
});
