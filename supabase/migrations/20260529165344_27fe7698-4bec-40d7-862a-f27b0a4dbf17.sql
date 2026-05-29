WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY mitarbeiter_id, datum
      ORDER BY created_at, id
    ) AS rn
  FROM public.einsaetze
  WHERE status IN ('GEPLANT', 'INTERN', 'ZUR_UEBERPRUEFUNG', 'BESTAETIGT')
)
UPDATE public.einsaetze e
SET
  status = 'AUSGEPLANT',
  notiz = NULLIF(TRIM(COALESCE(e.notiz, '') || ' [auto: Doppelbelegung bereinigt]'), '')
FROM ranked r
WHERE e.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS einsaetze_max_eins_pro_tag_idx
  ON public.einsaetze (mitarbeiter_id, datum)
  WHERE status IN ('GEPLANT', 'INTERN', 'ZUR_UEBERPRUEFUNG', 'BESTAETIGT');

COMMENT ON INDEX public.einsaetze_max_eins_pro_tag_idx IS
  'Verhindert mehr als einen aktiven Einsatz pro Mitarbeiter und Tag (Doppelbelegung).';