import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const DEFAULT_NOMINATIM = 'https://nominatim.openstreetmap.org';
function resolveNominatimBase(): string {
  const raw = (process.env.NOMINATIM_BASE_URL || '').trim();
  if (!raw) return DEFAULT_NOMINATIM;
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    const host = u.hostname;
    // Hostnamen ohne Punkt (z.B. "benli") sind im Internet nicht auflösbar
    // -> auf Default zurückfallen, statt ENOTFOUND zu produzieren.
    const isLocal = host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
    if (!isLocal && !host.includes('.')) {
      console.warn(`[geocode] NOMINATIM_BASE_URL host "${host}" sieht ungültig aus, nutze Default.`);
      return DEFAULT_NOMINATIM;
    }
    return u.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_NOMINATIM;
  }
}
const NOMINATIM_BASE = resolveNominatimBase();

type GeocodeResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; error: string };

async function geocodeAddress(params: {
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  userAgent: string;
}): Promise<GeocodeResult> {
  const { strasse, plz, ort, userAgent } = params;
  const parts = [strasse, [plz, ort].filter(Boolean).join(' ')].filter(Boolean);
  const q = parts.join(', ').trim();
  if (!q) return { ok: false, error: 'Keine Adresse vorhanden' };

  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'de');
  url.searchParams.set('addressdetails', '0');

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
        'Accept-Language': 'de',
      },
    });
    if (!res.ok) {
      return { ok: false, error: `Nominatim HTTP ${res.status}` };
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || data.length === 0) {
      return { ok: false, error: 'Adresse nicht gefunden' };
    }
    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, error: 'Ungültige Koordinaten' };
    }
    return { ok: true, lat, lng };
  } catch (e) {
    const cause = (e as { cause?: unknown })?.cause;
    const causeMsg =
      cause instanceof Error
        ? cause.message
        : typeof cause === 'string'
          ? cause
          : cause
            ? JSON.stringify(cause)
            : '';
    const baseMsg = e instanceof Error ? e.message : 'Fetch fehlgeschlagen';
    console.error('[geocode] fetch failed', {
      url: url.toString(),
      userAgent,
      error: baseMsg,
      cause: causeMsg,
    });
    const isDns = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT/i.test(causeMsg);
    return {
      ok: false,
      error: isDns
        ? 'Geocoding-Dienst nicht erreichbar – bitte Konfiguration prüfen'
        : causeMsg ? `${baseMsg} (${causeMsg})` : baseMsg,
    };
  }
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RunInput = z.object({
  tabelle: z.enum(['mitarbeiter', 'einrichtungen']),
  limit: z.number().int().min(1).max(50).default(10),
  nur_pending: z.boolean().default(true),
});

export const runGeocoding = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userAgent =
      process.env.NOMINATIM_USER_AGENT ||
      'DispoPlan/1.0 (contact: admin@dispoplan.one)';

    let query = supabase
      .from(data.tabelle)
      .select('id, strasse, plz, ort, geocode_status')
      .limit(data.limit);

    if (data.nur_pending) {
      query = query.or('geocode_status.is.null,geocode_status.eq.pending,geocode_status.eq.fehler');
    }

    const { data: rows, error } = await query;
    if (error) {
      return { ok: false as const, error: error.message, processed: 0, success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;
    const results: Array<{ id: string; status: 'ok' | 'fehler'; message?: string }> = [];

    for (let i = 0; i < (rows ?? []).length; i++) {
      const row = rows![i];
      if (i > 0) await sleep(1100); // Nominatim usage policy: max 1 req/s

      const r = await geocodeAddress({
        strasse: row.strasse,
        plz: row.plz,
        ort: row.ort,
        userAgent,
      });

      if (r.ok) {
        const { error: upErr } = await supabase
          .from(data.tabelle)
          .update({
            lat: r.lat,
            lng: r.lng,
            geocode_status: 'ok',
            geocode_fehler: null,
            geocodiert_am: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (upErr) {
          failed++;
          results.push({ id: row.id, status: 'fehler', message: upErr.message });
        } else {
          success++;
          results.push({ id: row.id, status: 'ok' });
        }
      } else {
        failed++;
        await supabase
          .from(data.tabelle)
          .update({
            geocode_status: 'fehler',
            geocode_fehler: r.error,
            geocodiert_am: new Date().toISOString(),
          })
          .eq('id', row.id);
        results.push({ id: row.id, status: 'fehler', message: r.error });
      }
    }

    return {
      ok: true as const,
      processed: rows?.length ?? 0,
      success,
      failed,
      results,
    };
  });

export const geocodeSingle = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tabelle: z.enum(['mitarbeiter', 'einrichtungen']),
        id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userAgent =
      process.env.NOMINATIM_USER_AGENT ||
      'DispoPlan/1.0 (contact: admin@dispoplan.one)';

    const { data: row, error } = await supabase
      .from(data.tabelle)
      .select('id, strasse, plz, ort')
      .eq('id', data.id)
      .maybeSingle();
    if (error || !row) {
      return { ok: false as const, error: error?.message ?? 'Datensatz nicht gefunden' };
    }

    const r = await geocodeAddress({
      strasse: row.strasse,
      plz: row.plz,
      ort: row.ort,
      userAgent,
    });

    if (r.ok) {
      await supabase
        .from(data.tabelle)
        .update({
          lat: r.lat,
          lng: r.lng,
          geocode_status: 'ok',
          geocode_fehler: null,
          geocodiert_am: new Date().toISOString(),
        })
        .eq('id', data.id);
      return { ok: true as const, lat: r.lat, lng: r.lng };
    }

    await supabase
      .from(data.tabelle)
      .update({
        geocode_status: 'fehler',
        geocode_fehler: r.error,
        geocodiert_am: new Date().toISOString(),
      })
      .eq('id', data.id);
    return { ok: false as const, error: r.error };
  });

// ============================================================
// Batch-Trigger: alle pending Datensätze (Mitarbeiter + Einrichtungen)
// Pro Aufruf wird ein Chunk (max ~60 Records) abgearbeitet, damit der
// Worker im Timeout bleibt. Der Client ruft so lange auf, bis remaining=0.
// ============================================================

const RunAllInput = z.object({
  chunk_size: z.number().int().min(1).max(80).default(50),
});

type RowResult = {
  tabelle: 'mitarbeiter' | 'einrichtungen';
  id: string;
  status: 'ok' | 'fehler';
  message?: string;
};

export const getGeocodePending = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const filter = 'geocode_status.is.null,geocode_status.eq.pending,geocode_status.eq.fehler';

    const [ma, ein] = await Promise.all([
      supabase.from('mitarbeiter').select('id', { count: 'exact', head: true }).or(filter),
      supabase.from('einrichtungen').select('id', { count: 'exact', head: true }).or(filter),
    ]);

    return {
      mitarbeiter_pending: ma.count ?? 0,
      einrichtungen_pending: ein.count ?? 0,
      total_pending: (ma.count ?? 0) + (ein.count ?? 0),
    };
  });

export const runGeocodingAllPending = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunAllInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userAgent =
      process.env.NOMINATIM_USER_AGENT ||
      'DispoPlan/1.0 (contact: admin@dispoplan.one)';
    const filter = 'geocode_status.is.null,geocode_status.eq.pending,geocode_status.eq.fehler';

    // Einrichtungen zuerst, danach Mitarbeiter — bis Chunk voll ist.
    const slots = data.chunk_size;
    const tables: Array<'einrichtungen' | 'mitarbeiter'> = ['einrichtungen', 'mitarbeiter'];

    const queue: Array<{ tabelle: 'einrichtungen' | 'mitarbeiter'; id: string; strasse: string | null; plz: string | null; ort: string | null }> = [];

    for (const t of tables) {
      if (queue.length >= slots) break;
      const remaining = slots - queue.length;
      const { data: rows, error } = await supabase
        .from(t)
        .select('id, strasse, plz, ort')
        .or(filter)
        .limit(remaining);
      if (error) {
        return {
          ok: false as const,
          error: `${t}: ${error.message}`,
          processed: 0,
          success: 0,
          failed: 0,
          remaining: -1,
          results: [] as RowResult[],
        };
      }
      for (const r of rows ?? []) queue.push({ tabelle: t, ...r });
    }

    let success = 0;
    let failed = 0;
    const results: RowResult[] = [];

    for (let i = 0; i < queue.length; i++) {
      const row = queue[i];
      if (i > 0) await sleep(1100); // Nominatim usage policy: max 1 req/s

      const r = await geocodeAddress({
        strasse: row.strasse,
        plz: row.plz,
        ort: row.ort,
        userAgent,
      });

      if (r.ok) {
        const { error: upErr } = await supabase
          .from(row.tabelle)
          .update({
            lat: r.lat,
            lng: r.lng,
            geocode_status: 'ok',
            geocode_fehler: null,
            geocodiert_am: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (upErr) {
          failed++;
          results.push({ tabelle: row.tabelle, id: row.id, status: 'fehler', message: upErr.message });
        } else {
          success++;
          results.push({ tabelle: row.tabelle, id: row.id, status: 'ok' });
        }
      } else {
        failed++;
        await supabase
          .from(row.tabelle)
          .update({
            geocode_status: 'fehler',
            geocode_fehler: r.error,
            geocodiert_am: new Date().toISOString(),
          })
          .eq('id', row.id);
        results.push({ tabelle: row.tabelle, id: row.id, status: 'fehler', message: r.error });
      }
    }

    // Verbleibende offene Datensätze nach diesem Chunk neu zählen
    const [maCnt, einCnt] = await Promise.all([
      supabase.from('mitarbeiter').select('id', { count: 'exact', head: true }).or(filter),
      supabase.from('einrichtungen').select('id', { count: 'exact', head: true }).or(filter),
    ]);
    const remaining = (maCnt.count ?? 0) + (einCnt.count ?? 0);

    return {
      ok: true as const,
      processed: queue.length,
      success,
      failed,
      remaining,
      mitarbeiter_pending: maCnt.count ?? 0,
      einrichtungen_pending: einCnt.count ?? 0,
      results,
    };
  });
