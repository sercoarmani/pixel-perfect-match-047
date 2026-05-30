#!/usr/bin/env bun
/**
 * CI-Stressrunner für die parallelen Supabase-Integrationstests.
 *
 * Führt scripts/scenario-bestaetigung-dedupe.integration.test.ts N-mal
 * hintereinander aus und legt zwischen den Läufen einen zufälligen
 * Delay (Default 200–1500 ms) ein, damit Race-Konstellationen mit
 * unterschiedlichem Timing getroffen werden.
 *
 * Retry-Logik:
 *   Schlägt ein Lauf an einer als *transient* klassifizierten Fehlerklasse
 *   fehl (z. B. Netzwerk-Reset, DNS, 5xx, Timeout), wird er mit
 *   exponentiellem Backoff (base * 2^attempt + Jitter) erneut versucht.
 *   Echte Test-Assertions / 4xx / Logikfehler werden NICHT wiederholt.
 *
 * ENV / CLI:
 *   STRESS_RUNS             (default 20)   – Anzahl Iterationen
 *   STRESS_DELAY_MIN_MS     (default 200)
 *   STRESS_DELAY_MAX_MS     (default 1500)
 *   STRESS_SEED             (optional)     – deterministische Reihenfolge
 *   STRESS_FAIL_FAST        (default "1")  – bei erstem permanenten Fehler abbrechen
 *   STRESS_MAX_RETRIES      (default 3)    – max. Wiederholungen pro Lauf
 *   STRESS_RETRY_BASE_MS    (default 500)  – Basiswert für Backoff
 *   STRESS_RETRY_CAP_MS     (default 15000)– Obergrenze pro Wartezeit
 *
 *   bun scripts/stress-run-integration.ts [runs]
 *
 * Exit-Code: 0 wenn alle Läufe (ggf. nach Retry) grün, sonst 1.
 */
import { spawn } from "node:child_process";

const RUNS = Number(process.argv[2] ?? process.env.STRESS_RUNS ?? 20);
const MIN = Number(process.env.STRESS_DELAY_MIN_MS ?? 200);
const MAX = Number(process.env.STRESS_DELAY_MAX_MS ?? 1500);
const FAIL_FAST = (process.env.STRESS_FAIL_FAST ?? "1") !== "0";
const SEED = process.env.STRESS_SEED ? Number(process.env.STRESS_SEED) : null;
const MAX_RETRIES = Number(process.env.STRESS_MAX_RETRIES ?? 3);
const RETRY_BASE = Number(process.env.STRESS_RETRY_BASE_MS ?? 500);
const RETRY_CAP = Number(process.env.STRESS_RETRY_CAP_MS ?? 15000);

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

/**
 * Klassifiziert die Output-Tail eines fehlgeschlagenen Laufs.
 *
 * "transient" = darf retry'd werden. Wir matchen bewusst eng und nur auf
 * bekannte Infrastruktur-/Netzwerk-Signale, damit echte Logikfehler
 * (assertion failed, 23505-Erwartungen, etc.) sofort sichtbar bleiben.
 */
const TRANSIENT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bECONNRESET\b/i, label: "ECONNRESET" },
  { re: /\bECONNREFUSED\b/i, label: "ECONNREFUSED" },
  { re: /\bETIMEDOUT\b/i, label: "ETIMEDOUT" },
  { re: /\bEAI_AGAIN\b/i, label: "EAI_AGAIN" },
  { re: /\bENOTFOUND\b/i, label: "ENOTFOUND" },
  { re: /\bEPIPE\b/i, label: "EPIPE" },
  { re: /\bsocket hang up\b/i, label: "socket hang up" },
  { re: /\bnetwork (error|request failed)\b/i, label: "network error" },
  { re: /\bfetch failed\b/i, label: "fetch failed" },
  { re: /\b(request|connection) timed? ?out\b/i, label: "timeout" },
  { re: /\bTLS .*(handshake|reset)\b/i, label: "tls" },
  // HTTP 5xx von Supabase/PostgREST: 502/503/504/522/524 …
  { re: /\bHTTP\/?\s*(502|503|504|522|524)\b/i, label: "http 5xx" },
  { re: /\b(status|code)[:\s=]+\s*(502|503|504|522|524)\b/i, label: "http 5xx" },
  { re: /\b(Bad Gateway|Service Unavailable|Gateway Timeout)\b/i, label: "http 5xx" },
  // Postgres serialization/deadlock (40001/40P01) – kurzlebig, retry sinnvoll
  { re: /\b40001\b/, label: "pg serialization_failure" },
  { re: /\b40P01\b/, label: "pg deadlock_detected" },
];

function classify(tail: string): { transient: boolean; reason: string } {
  for (const { re, label } of TRANSIENT_PATTERNS) {
    if (re.test(tail)) return { transient: true, reason: label };
  }
  return { transient: false, reason: "permanent" };
}

function backoffDelay(attempt: number): number {
  // attempt: 1 = nach 1. Fehlversuch
  const exp = Math.min(RETRY_CAP, RETRY_BASE * 2 ** (attempt - 1));
  const jitter = Math.floor(rand() * (exp / 2)); // 0..50% jitter
  return Math.min(RETRY_CAP, exp + jitter);
}

function runOnce(): Promise<{ code: number; ms: number; tail: string }> {
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
      const tail = out.trim().split("\n").slice(-20).join("\n");
      resolve({ code: code ?? 1, ms: Date.now() - start, tail });
    });
  });
}

async function runWithRetry(idx: number): Promise<{
  code: number;
  ms: number;
  tail: string;
  attempts: number;
  retried: string[];
}> {
  let attempt = 0;
  const retried: string[] = [];
  let last: Awaited<ReturnType<typeof runOnce>>;
  let totalMs = 0;

  while (true) {
    attempt++;
    last = await runOnce();
    totalMs += last.ms;
    if (last.code === 0) {
      return { ...last, ms: totalMs, attempts: attempt, retried };
    }
    const { transient, reason } = classify(last.tail);
    if (!transient || attempt > MAX_RETRIES) {
      return { ...last, ms: totalMs, attempts: attempt, retried };
    }
    const wait = backoffDelay(attempt);
    retried.push(reason);
    console.warn(
      `[stress] ${pad(idx)} retry ${attempt}/${MAX_RETRIES} after ${reason} – backoff ${wait}ms`,
    );
    await sleep(wait);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pad(n: number, w = 3) {
  return String(n).padStart(w, " ");
}

async function main() {
  console.log(
    `[stress] runs=${RUNS} delay=${MIN}-${MAX}ms fail_fast=${FAIL_FAST} seed=${SEED ?? "random"} ` +
      `retries=${MAX_RETRIES} backoff_base=${RETRY_BASE}ms cap=${RETRY_CAP}ms`,
  );
  const results: Array<{ idx: number; code: number; ms: number; attempts: number }> = [];
  let failures = 0;
  let totalRetries = 0;

  for (let i = 1; i <= RUNS; i++) {
    const { code, ms, tail, attempts, retried } = await runWithRetry(i);
    results.push({ idx: i, code, ms, attempts });
    totalRetries += retried.length;
    const status = code === 0 ? (attempts > 1 ? "PASS*" : "PASS") : "FAIL";
    const suffix = retried.length ? `  retried=[${retried.join(",")}]` : "";
    console.log(`[stress] ${pad(i)}/${RUNS}  ${status}  ${pad(ms, 5)}ms  attempts=${attempts}${suffix}`);
    if (code !== 0) {
      failures++;
      const { transient, reason } = classify(tail);
      console.error(
        `---- run ${i} FINAL FAIL (${transient ? "transient-exhausted" : "permanent"}: ${reason}) ----\n` +
          `${tail}\n--------------------------------`,
      );
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
  console.log(
    `[stress] summary: ${passed}/${total} passed, ${failures} failed, ${totalRetries} transient retries`,
  );
  console.log(
    `[stress] timing  : min=${times[0] ?? 0}ms  avg=${Math.round(avg)}ms  p50=${p(0.5)}ms  p95=${p(0.95)}ms  max=${times.at(-1) ?? 0}ms`,
  );

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[stress] runner crashed", e);
  process.exit(2);
});
