-- Verhindert parallele Duplikat-Entwürfe für dieselbe (MA, Einrichtung, Bedarf)-Kombination.
-- Bedarf ist optional → COALESCE auf Null-UUID, damit auch der NULL-Fall eindeutig ist.
CREATE UNIQUE INDEX IF NOT EXISTS kunden_bestaetigungen_unique_active
ON public.kunden_bestaetigungen (
  mitarbeiter_id,
  einrichtung_id,
  COALESCE(bedarf_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE status IN ('entwurf', 'gesendet');