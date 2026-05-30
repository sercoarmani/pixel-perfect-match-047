import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const NOMINATIM_BASE =
  process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';

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
    return { ok: false, error: e instanceof Error ? e.message : 'Fetch fehlgeschlagen' };
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
