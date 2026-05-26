
-- ===== ENUMS =====
CREATE TYPE public.app_role AS ENUM ('admin', 'disponent');
CREATE TYPE public.dienst AS ENUM ('F', 'S', 'N');
CREATE TYPE public.qualifikation AS ENUM ('PFK', 'PHK', 'GuK', 'PFA', 'PFM', 'PFF', 'Azubi', 'Berufserfahrung', 'LG1_LG2', 'Krankenschwester');
CREATE TYPE public.anstellung AS ENUM ('Vollzeit', 'Teilzeit', 'Minijob');
CREATE TYPE public.ma_status AS ENUM ('aktiv', 'austritt', 'schwanger', 'gesperrt', 'inaktiv');
CREATE TYPE public.einsatz_status AS ENUM ('GEPLANT', 'INTERN', 'ZUR_UEBERPRUEFUNG', 'BESTAETIGT', 'AUSGEPLANT', 'ABGESAGT');
CREATE TYPE public.abwesenheit_art AS ENUM ('Urlaub', 'unbezahlter_Urlaub', 'krank_mit_AU', 'krank_ohne_AU', 'Wunschfrei');
CREATE TYPE public.bedarf_status AS ENUM ('offen', 'in_bearbeitung', 'besetzt', 'abgesagt');
CREATE TYPE public.anfrage_typ AS ENUM ('verfuegbarkeit', 'bedarf');
CREATE TYPE public.anfrage_status AS ENUM ('offen', 'beantwortet', 'abgelaufen');
CREATE TYPE public.empfaenger_typ AS ENUM ('mitarbeiter', 'einrichtung');

-- ===== USER ROLES =====
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_dispo(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','disponent'))
$$;

-- Auto-assign disponent role to first user; subsequent users get disponent too
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN (SELECT COUNT(*) FROM public.user_roles) = 0 THEN 'admin'::public.app_role ELSE 'disponent'::public.app_role END
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== TRAEGER =====
CREATE TABLE public.traeger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  aktiv BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traeger TO authenticated;
GRANT ALL ON public.traeger TO service_role;
ALTER TABLE public.traeger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispo all traeger" ON public.traeger FOR ALL TO authenticated USING (public.is_dispo(auth.uid())) WITH CHECK (public.is_dispo(auth.uid()));

-- ===== EINRICHTUNGEN =====
CREATE TABLE public.einrichtungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traeger_id UUID REFERENCES public.traeger(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  ort TEXT,
  vs_satz_pfk NUMERIC,
  vs_satz_phk NUMERIC,
  wohnbereich TEXT,
  kontakt_name TEXT,
  kontakt_telefon TEXT,
  kontakt_email TEXT,
  kunde_angelegt BOOLEAN NOT NULL DEFAULT FALSE,
  notiz TEXT,
  aktiv BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.einrichtungen TO authenticated;
GRANT ALL ON public.einrichtungen TO service_role;
ALTER TABLE public.einrichtungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispo all einrichtungen" ON public.einrichtungen FOR ALL TO authenticated USING (public.is_dispo(auth.uid())) WITH CHECK (public.is_dispo(auth.uid()));

-- ===== MITARBEITER =====
CREATE TABLE public.mitarbeiter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nachname TEXT NOT NULL,
  vorname TEXT NOT NULL,
  kuerzel TEXT NOT NULL UNIQUE,
  wohnort TEXT,
  telefon TEXT,
  email TEXT,
  qualifikation public.qualifikation NOT NULL DEFAULT 'PFK',
  anstellung public.anstellung NOT NULL DEFAULT 'Vollzeit',
  dienste_moeglich public.dienst[] NOT NULL DEFAULT ARRAY['F','S','N']::public.dienst[],
  max_einsaetze INT NOT NULL DEFAULT 20,
  status public.ma_status NOT NULL DEFAULT 'aktiv',
  austritt_datum DATE,
  notiz TEXT,
  aktiv BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mitarbeiter TO authenticated;
GRANT ALL ON public.mitarbeiter TO service_role;
ALTER TABLE public.mitarbeiter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispo all mitarbeiter" ON public.mitarbeiter FOR ALL TO authenticated USING (public.is_dispo(auth.uid())) WITH CHECK (public.is_dispo(auth.uid()));

-- ===== EINSAETZE =====
CREATE TABLE public.einsaetze (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id UUID NOT NULL REFERENCES public.mitarbeiter(id) ON DELETE CASCADE,
  einrichtung_id UUID NOT NULL REFERENCES public.einrichtungen(id) ON DELETE CASCADE,
  datum DATE NOT NULL,
  dienst public.dienst NOT NULL,
  status public.einsatz_status NOT NULL DEFAULT 'GEPLANT',
  ist_ersatz BOOLEAN NOT NULL DEFAULT FALSE,
  ersatz_fuer_kuerzel TEXT,
  notiz TEXT,
  quelle TEXT NOT NULL DEFAULT 'manuell',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX einsaetze_datum_idx ON public.einsaetze(datum);
CREATE INDEX einsaetze_einrichtung_datum_idx ON public.einsaetze(einrichtung_id, datum);
CREATE INDEX einsaetze_mitarbeiter_datum_idx ON public.einsaetze(mitarbeiter_id, datum);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.einsaetze TO authenticated;
GRANT ALL ON public.einsaetze TO service_role;
ALTER TABLE public.einsaetze ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispo all einsaetze" ON public.einsaetze FOR ALL TO authenticated USING (public.is_dispo(auth.uid())) WITH CHECK (public.is_dispo(auth.uid()));

-- ===== ABWESENHEITEN =====
CREATE TABLE public.abwesenheiten (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id UUID NOT NULL REFERENCES public.mitarbeiter(id) ON DELETE CASCADE,
  datum DATE NOT NULL,
  art public.abwesenheit_art NOT NULL,
  notiz TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX abwesenheiten_ma_datum_idx ON public.abwesenheiten(mitarbeiter_id, datum);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abwesenheiten TO authenticated;
GRANT ALL ON public.abwesenheiten TO service_role;
ALTER TABLE public.abwesenheiten ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispo all abwesenheiten" ON public.abwesenheiten FOR ALL TO authenticated USING (public.is_dispo(auth.uid())) WITH CHECK (public.is_dispo(auth.uid()));

-- ===== VERFUEGBARKEITEN =====
CREATE TABLE public.verfuegbarkeiten (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id UUID NOT NULL REFERENCES public.mitarbeiter(id) ON DELETE CASCADE,
  datum DATE NOT NULL,
  dienst public.dienst NOT NULL,
  verfuegbar BOOLEAN NOT NULL,
  eingegangen_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  quelle TEXT NOT NULL DEFAULT 'manuell',
  notiz TEXT,
  UNIQUE (mitarbeiter_id, datum, dienst)
);
CREATE INDEX verf_ma_datum_idx ON public.verfuegbarkeiten(mitarbeiter_id, datum);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.verfuegbarkeiten TO authenticated;
GRANT ALL ON public.verfuegbarkeiten TO service_role;
ALTER TABLE public.verfuegbarkeiten ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispo all verf" ON public.verfuegbarkeiten FOR ALL TO authenticated USING (public.is_dispo(auth.uid())) WITH CHECK (public.is_dispo(auth.uid()));

-- ===== BEDARFE =====
CREATE TABLE public.bedarfe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  einrichtung_id UUID NOT NULL REFERENCES public.einrichtungen(id) ON DELETE CASCADE,
  datum DATE NOT NULL,
  dienst public.dienst NOT NULL,
  qualifikation public.qualifikation NOT NULL DEFAULT 'PFK',
  anzahl INT NOT NULL DEFAULT 1,
  status public.bedarf_status NOT NULL DEFAULT 'offen',
  eingegangen_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  quelle TEXT NOT NULL DEFAULT 'manuell',
  notiz TEXT
);
CREATE INDEX bedarfe_einr_datum_idx ON public.bedarfe(einrichtung_id, datum);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bedarfe TO authenticated;
GRANT ALL ON public.bedarfe TO service_role;
ALTER TABLE public.bedarfe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispo all bedarfe" ON public.bedarfe FOR ALL TO authenticated USING (public.is_dispo(auth.uid())) WITH CHECK (public.is_dispo(auth.uid()));

-- ===== ANFRAGEN =====
CREATE TABLE public.anfragen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ public.anfrage_typ NOT NULL,
  empfaenger_typ public.empfaenger_typ NOT NULL,
  empfaenger_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  zeitraum_von DATE NOT NULL,
  zeitraum_bis DATE NOT NULL,
  status public.anfrage_status NOT NULL DEFAULT 'offen',
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  erstellt_von UUID REFERENCES auth.users(id),
  beantwortet_am TIMESTAMPTZ,
  ablauf_datum TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '60 days')
);
CREATE INDEX anfragen_token_idx ON public.anfragen(token);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anfragen TO authenticated;
GRANT ALL ON public.anfragen TO service_role;
ALTER TABLE public.anfragen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispo all anfragen" ON public.anfragen FOR ALL TO authenticated USING (public.is_dispo(auth.uid())) WITH CHECK (public.is_dispo(auth.uid()));

-- ===== AUDIT LOG =====
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objekt_typ TEXT NOT NULL,
  objekt_id UUID,
  alter_status TEXT,
  neuer_status TEXT,
  geaendert_von UUID REFERENCES auth.users(id),
  geaendert_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  detail JSONB
);
CREATE INDEX audit_objekt_idx ON public.audit_log(objekt_typ, objekt_id);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispo read audit" ON public.audit_log FOR SELECT TO authenticated USING (public.is_dispo(auth.uid()));
CREATE POLICY "dispo insert audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.is_dispo(auth.uid()));

-- ===== NACHRICHTEN TEMPLATES =====
CREATE TABLE public.nachrichten_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schluessel TEXT NOT NULL UNIQUE,
  bezeichnung TEXT NOT NULL,
  text TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nachrichten_templates TO authenticated;
GRANT ALL ON public.nachrichten_templates TO service_role;
ALTER TABLE public.nachrichten_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispo all templates" ON public.nachrichten_templates FOR ALL TO authenticated USING (public.is_dispo(auth.uid())) WITH CHECK (public.is_dispo(auth.uid()));

-- Default templates
INSERT INTO public.nachrichten_templates (schluessel, bezeichnung, text) VALUES
('verfuegbarkeit_kurz', 'Verfügbarkeitsabfrage (kurz)',
 'Hallo {{Vorname}}, hier ist die Disposition. Für den Zeitraum {{von}}–{{bis}} bräuchten wir deine Verfügbarkeit. Bitte trag sie kurz hier ein (dauert 1 Minute): {{Link}} Danke dir!'),
('verfuegbarkeit_formell', 'Verfügbarkeitsabfrage (formell)',
 'Guten Tag {{Vorname}}, anbei die Verfügbarkeitsabfrage für {{von}} bis {{bis}}. Bitte gib über folgenden Link an, an welchen Tagen und in welchen Diensten (Früh/Spät/Nacht) du einsetzbar bist: {{Link}} Vielen Dank und viele Grüße, {{Disponent}}'),
('erinnerung', 'Erinnerung Verfügbarkeit',
 'Hallo {{Vorname}}, kurze Erinnerung zur Verfügbarkeit für {{von}}–{{bis}} – falls du noch nicht dazu gekommen bist: {{Link}} Danke!'),
('bedarf_kurz', 'Bedarfsabfrage Kunde (kurz)',
 'Guten Tag, hier ist {{Firmenname}}. Für {{Einrichtung}} können Sie Ihren Personalbedarf für {{von}}–{{bis}} bequem hier melden: {{Link}} Wir kümmern uns dann um die Besetzung.'),
('bedarf_formell', 'Bedarfsabfrage Kunde (formell)',
 'Sehr geehrte Damen und Herren, zur Planung Ihres Personalbedarfs für den Zeitraum {{von}} bis {{bis}} stellen wir Ihnen folgenden Link bereit. Bitte tragen Sie dort Tag, Dienst (Früh/Spät/Nacht), Qualifikation und Anzahl der benötigten Kräfte ein: {{Link}} Mit freundlichen Grüßen, {{Disponent}}, {{Firmenname}}'),
('einsatzbestaetigung', 'Einsatzbestätigung',
 'Hallo {{Vorname}}, deine Einsätze stehen: {{Einsatzliste}}. Den vollständigen Dienstplan findest du hier: {{Link}} Bei Fragen melde dich gern.');

-- ===== SEED DATA =====
DO $$
DECLARE
  t1 UUID; t2 UUID; t3 UUID;
  e1 UUID; e2 UUID; e3 UUID; e4 UUID; e5 UUID;
  m_ids UUID[] := ARRAY[]::UUID[];
  m UUID;
  d DATE;
BEGIN
  INSERT INTO public.traeger(name) VALUES ('Caritas Verbund') RETURNING id INTO t1;
  INSERT INTO public.traeger(name) VALUES ('Diakonie Region') RETURNING id INTO t2;
  INSERT INTO public.traeger(name) VALUES ('Privat Pflege GmbH') RETURNING id INTO t3;

  INSERT INTO public.einrichtungen(traeger_id, name, ort, vs_satz_pfk, vs_satz_phk, kontakt_name, kontakt_telefon, kontakt_email, kunde_angelegt)
  VALUES (t1, 'Seniorenheim St. Marien', 'Köln', 48.50, 39.00, 'Frau Schulz', '0221-1234567', 'schulz@stmarien.de', TRUE) RETURNING id INTO e1;
  INSERT INTO public.einrichtungen(traeger_id, name, ort, vs_satz_pfk, vs_satz_phk, kontakt_name, kontakt_telefon, kunde_angelegt)
  VALUES (t1, 'Haus am Park', 'Bonn', 47.00, 38.50, 'Herr Meier', '0228-2233445', TRUE) RETURNING id INTO e2;
  INSERT INTO public.einrichtungen(traeger_id, name, ort, vs_satz_pfk, vs_satz_phk, kunde_angelegt)
  VALUES (t2, 'Diakonie Zentrum Süd', 'Düsseldorf', 49.00, 40.00, TRUE) RETURNING id INTO e3;
  INSERT INTO public.einrichtungen(traeger_id, name, ort, vs_satz_pfk, vs_satz_phk, kunde_angelegt)
  VALUES (t3, 'Villa Rosenhof', 'Köln', 52.00, 42.00, TRUE) RETURNING id INTO e4;
  INSERT INTO public.einrichtungen(traeger_id, name, ort, vs_satz_pfk, vs_satz_phk, kunde_angelegt)
  VALUES (t3, 'Pflegeresidenz Lindenhof', 'Leverkusen', 50.00, 41.00, TRUE) RETURNING id INTO e5;

  -- 10 Mitarbeiter
  INSERT INTO public.mitarbeiter(nachname, vorname, kuerzel, wohnort, telefon, qualifikation, anstellung, max_einsaetze) VALUES
   ('Müller','Anna','MUA','Köln','+491701111111','PFK','Vollzeit',20) RETURNING id INTO m; m_ids := m_ids || m;
  INSERT INTO public.mitarbeiter(nachname, vorname, kuerzel, wohnort, telefon, qualifikation, anstellung, max_einsaetze) VALUES
   ('Schmidt','Ben','SCB','Bonn','+491702222222','PHK','Teilzeit',12) RETURNING id INTO m; m_ids := m_ids || m;
  INSERT INTO public.mitarbeiter(nachname, vorname, kuerzel, wohnort, telefon, qualifikation, anstellung, max_einsaetze, dienste_moeglich) VALUES
   ('Fischer','Carla','FIC','Köln','+491703333333','PFK','Vollzeit',22, ARRAY['F','S']::public.dienst[]) RETURNING id INTO m; m_ids := m_ids || m;
  INSERT INTO public.mitarbeiter(nachname, vorname, kuerzel, wohnort, telefon, qualifikation, anstellung, max_einsaetze) VALUES
   ('Weber','David','WED','Düsseldorf','+491704444444','PFK','Vollzeit',20) RETURNING id INTO m; m_ids := m_ids || m;
  INSERT INTO public.mitarbeiter(nachname, vorname, kuerzel, wohnort, telefon, qualifikation, anstellung, max_einsaetze, dienste_moeglich) VALUES
   ('Becker','Eva','BEE','Köln','+491705555555','PHK','Minijob',8, ARRAY['F']::public.dienst[]) RETURNING id INTO m; m_ids := m_ids || m;
  INSERT INTO public.mitarbeiter(nachname, vorname, kuerzel, wohnort, telefon, qualifikation, anstellung, max_einsaetze) VALUES
   ('Hoffmann','Felix','HOF','Leverkusen','+491706666666','PFK','Vollzeit',20) RETURNING id INTO m; m_ids := m_ids || m;
  INSERT INTO public.mitarbeiter(nachname, vorname, kuerzel, wohnort, telefon, qualifikation, anstellung, max_einsaetze) VALUES
   ('Schäfer','Greta','SCG','Bonn','+491707777777','PHK','Teilzeit',14) RETURNING id INTO m; m_ids := m_ids || m;
  INSERT INTO public.mitarbeiter(nachname, vorname, kuerzel, wohnort, telefon, qualifikation, anstellung, max_einsaetze, status) VALUES
   ('Koch','Hannah','KOH','Köln','+491708888888','PFK','Vollzeit',20,'schwanger') RETURNING id INTO m; m_ids := m_ids || m;
  INSERT INTO public.mitarbeiter(nachname, vorname, kuerzel, wohnort, telefon, qualifikation, anstellung, max_einsaetze, dienste_moeglich) VALUES
   ('Richter','Ivo','RII','Düsseldorf','+491709999999','PFK','Vollzeit',22, ARRAY['N']::public.dienst[]) RETURNING id INTO m; m_ids := m_ids || m;
  INSERT INTO public.mitarbeiter(nachname, vorname, kuerzel, wohnort, telefon, qualifikation, anstellung, max_einsaetze) VALUES
   ('Bauer','Jana','BAJ','Köln','+491700000001','PFK','Teilzeit',16) RETURNING id INTO m; m_ids := m_ids || m;

  -- Einsätze für aktuellen Monat (Tag 1..15)
  FOR i IN 1..15 LOOP
    d := date_trunc('month', CURRENT_DATE)::date + (i - 1);
    INSERT INTO public.einsaetze(mitarbeiter_id, einrichtung_id, datum, dienst, status)
    VALUES (m_ids[1 + (i % 10)], e1, d, 'F', CASE WHEN i % 3 = 0 THEN 'BESTAETIGT'::public.einsatz_status ELSE 'GEPLANT'::public.einsatz_status END);
    IF i % 2 = 0 THEN
      INSERT INTO public.einsaetze(mitarbeiter_id, einrichtung_id, datum, dienst, status)
      VALUES (m_ids[1 + ((i+3) % 10)], e2, d, 'S', 'INTERN');
    END IF;
    IF i % 4 = 0 THEN
      INSERT INTO public.einsaetze(mitarbeiter_id, einrichtung_id, datum, dienst, status)
      VALUES (m_ids[1 + ((i+5) % 10)], e3, d, 'N', 'GEPLANT');
    END IF;
  END LOOP;

  -- Absichtlicher Konflikt: gleicher MA am gleichen Tag/Dienst zweimal
  INSERT INTO public.einsaetze(mitarbeiter_id, einrichtung_id, datum, dienst, status)
  VALUES (m_ids[1], e4, date_trunc('month', CURRENT_DATE)::date + 2, 'F', 'GEPLANT');

  -- Ein paar Verfügbarkeiten
  INSERT INTO public.verfuegbarkeiten(mitarbeiter_id, datum, dienst, verfuegbar, quelle)
  VALUES
    (m_ids[1], date_trunc('month', CURRENT_DATE)::date + 16, 'F', TRUE, 'link'),
    (m_ids[1], date_trunc('month', CURRENT_DATE)::date + 17, 'S', TRUE, 'link'),
    (m_ids[2], date_trunc('month', CURRENT_DATE)::date + 16, 'F', FALSE, 'link'),
    (m_ids[3], date_trunc('month', CURRENT_DATE)::date + 18, 'F', TRUE, 'link');

  -- Offene Bedarfe
  INSERT INTO public.bedarfe(einrichtung_id, datum, dienst, qualifikation, anzahl, status, quelle)
  VALUES
    (e1, date_trunc('month', CURRENT_DATE)::date + 16, 'F', 'PFK', 1, 'offen', 'link'),
    (e3, date_trunc('month', CURRENT_DATE)::date + 18, 'S', 'PHK', 2, 'offen', 'link'),
    (e5, date_trunc('month', CURRENT_DATE)::date + 20, 'N', 'PFK', 1, 'offen', 'telefon');

  -- Eine Abwesenheit
  INSERT INTO public.abwesenheiten(mitarbeiter_id, datum, art)
  VALUES (m_ids[4], date_trunc('month', CURRENT_DATE)::date + 5, 'Urlaub');
END $$;
