export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abwesenheiten: {
        Row: {
          art: Database["public"]["Enums"]["abwesenheit_art"]
          created_at: string
          datum: string
          id: string
          mitarbeiter_id: string
          notiz: string | null
        }
        Insert: {
          art: Database["public"]["Enums"]["abwesenheit_art"]
          created_at?: string
          datum: string
          id?: string
          mitarbeiter_id: string
          notiz?: string | null
        }
        Update: {
          art?: Database["public"]["Enums"]["abwesenheit_art"]
          created_at?: string
          datum?: string
          id?: string
          mitarbeiter_id?: string
          notiz?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abwesenheiten_mitarbeiter_fk"
            columns: ["mitarbeiter_id"]
            isOneToOne: false
            referencedRelation: "mitarbeiter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abwesenheiten_mitarbeiter_id_fkey"
            columns: ["mitarbeiter_id"]
            isOneToOne: false
            referencedRelation: "mitarbeiter"
            referencedColumns: ["id"]
          },
        ]
      }
      anfragen: {
        Row: {
          ablauf_datum: string
          beantwortet_am: string | null
          besetzt_durch: string | null
          empfaenger_id: string
          empfaenger_typ: Database["public"]["Enums"]["empfaenger_typ"]
          erstellt_am: string
          erstellt_von: string | null
          id: string
          status: Database["public"]["Enums"]["anfrage_status"]
          token: string
          typ: Database["public"]["Enums"]["anfrage_typ"]
          zeitraum_bis: string
          zeitraum_von: string
        }
        Insert: {
          ablauf_datum?: string
          beantwortet_am?: string | null
          besetzt_durch?: string | null
          empfaenger_id: string
          empfaenger_typ: Database["public"]["Enums"]["empfaenger_typ"]
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          status?: Database["public"]["Enums"]["anfrage_status"]
          token: string
          typ: Database["public"]["Enums"]["anfrage_typ"]
          zeitraum_bis: string
          zeitraum_von: string
        }
        Update: {
          ablauf_datum?: string
          beantwortet_am?: string | null
          besetzt_durch?: string | null
          empfaenger_id?: string
          empfaenger_typ?: Database["public"]["Enums"]["empfaenger_typ"]
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          status?: Database["public"]["Enums"]["anfrage_status"]
          token?: string
          typ?: Database["public"]["Enums"]["anfrage_typ"]
          zeitraum_bis?: string
          zeitraum_von?: string
        }
        Relationships: [
          {
            foreignKeyName: "anfragen_besetzt_durch_fk"
            columns: ["besetzt_durch"]
            isOneToOne: false
            referencedRelation: "mitarbeiter"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          alter_status: string | null
          detail: Json | null
          geaendert_am: string
          geaendert_von: string | null
          id: string
          neuer_status: string | null
          objekt_id: string | null
          objekt_typ: string
        }
        Insert: {
          alter_status?: string | null
          detail?: Json | null
          geaendert_am?: string
          geaendert_von?: string | null
          id?: string
          neuer_status?: string | null
          objekt_id?: string | null
          objekt_typ: string
        }
        Update: {
          alter_status?: string | null
          detail?: Json | null
          geaendert_am?: string
          geaendert_von?: string | null
          id?: string
          neuer_status?: string | null
          objekt_id?: string | null
          objekt_typ?: string
        }
        Relationships: []
      }
      bedarfe: {
        Row: {
          anzahl: number
          besetzt_durch: string | null
          datum: string
          dienst: Database["public"]["Enums"]["dienst"]
          eingegangen_am: string
          einrichtung_id: string
          ergebnis: string
          id: string
          notiz: string | null
          qualifikation: Database["public"]["Enums"]["qualifikation"]
          quelle: string
          status: Database["public"]["Enums"]["bedarf_status"]
        }
        Insert: {
          anzahl?: number
          besetzt_durch?: string | null
          datum: string
          dienst: Database["public"]["Enums"]["dienst"]
          eingegangen_am?: string
          einrichtung_id: string
          ergebnis?: string
          id?: string
          notiz?: string | null
          qualifikation?: Database["public"]["Enums"]["qualifikation"]
          quelle?: string
          status?: Database["public"]["Enums"]["bedarf_status"]
        }
        Update: {
          anzahl?: number
          besetzt_durch?: string | null
          datum?: string
          dienst?: Database["public"]["Enums"]["dienst"]
          eingegangen_am?: string
          einrichtung_id?: string
          ergebnis?: string
          id?: string
          notiz?: string | null
          qualifikation?: Database["public"]["Enums"]["qualifikation"]
          quelle?: string
          status?: Database["public"]["Enums"]["bedarf_status"]
        }
        Relationships: [
          {
            foreignKeyName: "bedarfe_besetzt_durch_fk"
            columns: ["besetzt_durch"]
            isOneToOne: false
            referencedRelation: "mitarbeiter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bedarfe_einrichtung_fk"
            columns: ["einrichtung_id"]
            isOneToOne: false
            referencedRelation: "einrichtungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bedarfe_einrichtung_id_fkey"
            columns: ["einrichtung_id"]
            isOneToOne: false
            referencedRelation: "einrichtungen"
            referencedColumns: ["id"]
          },
        ]
      }
      einrichtungen: {
        Row: {
          aktiv: boolean
          created_at: string
          geocode_fehler: string | null
          geocode_status: string
          geocodiert_am: string | null
          id: string
          kontakt_email: string | null
          kontakt_name: string | null
          kontakt_telefon: string | null
          kunde_angelegt: boolean
          lat: number | null
          lng: number | null
          name: string
          notiz: string | null
          ort: string | null
          plz: string | null
          portal_token: string | null
          strasse: string | null
          traeger_id: string | null
          vs_satz_pfk: number | null
          vs_satz_phk: number | null
          wohnbereich: string | null
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          geocode_fehler?: string | null
          geocode_status?: string
          geocodiert_am?: string | null
          id?: string
          kontakt_email?: string | null
          kontakt_name?: string | null
          kontakt_telefon?: string | null
          kunde_angelegt?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          notiz?: string | null
          ort?: string | null
          plz?: string | null
          portal_token?: string | null
          strasse?: string | null
          traeger_id?: string | null
          vs_satz_pfk?: number | null
          vs_satz_phk?: number | null
          wohnbereich?: string | null
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          geocode_fehler?: string | null
          geocode_status?: string
          geocodiert_am?: string | null
          id?: string
          kontakt_email?: string | null
          kontakt_name?: string | null
          kontakt_telefon?: string | null
          kunde_angelegt?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          notiz?: string | null
          ort?: string | null
          plz?: string | null
          portal_token?: string | null
          strasse?: string | null
          traeger_id?: string | null
          vs_satz_pfk?: number | null
          vs_satz_phk?: number | null
          wohnbereich?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "einrichtungen_traeger_fk"
            columns: ["traeger_id"]
            isOneToOne: false
            referencedRelation: "traeger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einrichtungen_traeger_id_fkey"
            columns: ["traeger_id"]
            isOneToOne: false
            referencedRelation: "traeger"
            referencedColumns: ["id"]
          },
        ]
      }
      einsaetze: {
        Row: {
          created_at: string
          datum: string
          dienst: Database["public"]["Enums"]["dienst"]
          einrichtung_id: string
          ersatz_fuer_kuerzel: string | null
          id: string
          ist_ersatz: boolean
          mitarbeiter_id: string
          notiz: string | null
          quelle: string
          status: Database["public"]["Enums"]["einsatz_status"]
        }
        Insert: {
          created_at?: string
          datum: string
          dienst: Database["public"]["Enums"]["dienst"]
          einrichtung_id: string
          ersatz_fuer_kuerzel?: string | null
          id?: string
          ist_ersatz?: boolean
          mitarbeiter_id: string
          notiz?: string | null
          quelle?: string
          status?: Database["public"]["Enums"]["einsatz_status"]
        }
        Update: {
          created_at?: string
          datum?: string
          dienst?: Database["public"]["Enums"]["dienst"]
          einrichtung_id?: string
          ersatz_fuer_kuerzel?: string | null
          id?: string
          ist_ersatz?: boolean
          mitarbeiter_id?: string
          notiz?: string | null
          quelle?: string
          status?: Database["public"]["Enums"]["einsatz_status"]
        }
        Relationships: [
          {
            foreignKeyName: "einsaetze_einrichtung_id_fkey"
            columns: ["einrichtung_id"]
            isOneToOne: false
            referencedRelation: "einrichtungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einsaetze_mitarbeiter_id_fkey"
            columns: ["mitarbeiter_id"]
            isOneToOne: false
            referencedRelation: "mitarbeiter"
            referencedColumns: ["id"]
          },
        ]
      }
      email_inbox: {
        Row: {
          ai_extrakt: Json | null
          ai_kategorie: string | null
          ai_zusammenfassung: string | null
          an_email: string | null
          anhaenge: Json
          bearbeitet_am: string | null
          bearbeitet_von: string | null
          betreff: string | null
          body_html: string | null
          body_text: string | null
          created_at: string
          empfangen_am: string
          id: string
          in_reply_to: string | null
          message_id: string | null
          notiz: string | null
          raw: Json | null
          status: Database["public"]["Enums"]["email_inbox_status"]
          tags: string[]
          updated_at: string
          von_email: string
          von_name: string | null
          zugeordnet_einrichtung_id: string | null
          zugeordnet_mitarbeiter_id: string | null
          zuordnung_confidence: number | null
          zuordnung_quelle: string | null
        }
        Insert: {
          ai_extrakt?: Json | null
          ai_kategorie?: string | null
          ai_zusammenfassung?: string | null
          an_email?: string | null
          anhaenge?: Json
          bearbeitet_am?: string | null
          bearbeitet_von?: string | null
          betreff?: string | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          empfangen_am?: string
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          notiz?: string | null
          raw?: Json | null
          status?: Database["public"]["Enums"]["email_inbox_status"]
          tags?: string[]
          updated_at?: string
          von_email: string
          von_name?: string | null
          zugeordnet_einrichtung_id?: string | null
          zugeordnet_mitarbeiter_id?: string | null
          zuordnung_confidence?: number | null
          zuordnung_quelle?: string | null
        }
        Update: {
          ai_extrakt?: Json | null
          ai_kategorie?: string | null
          ai_zusammenfassung?: string | null
          an_email?: string | null
          anhaenge?: Json
          bearbeitet_am?: string | null
          bearbeitet_von?: string | null
          betreff?: string | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          empfangen_am?: string
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          notiz?: string | null
          raw?: Json | null
          status?: Database["public"]["Enums"]["email_inbox_status"]
          tags?: string[]
          updated_at?: string
          von_email?: string
          von_name?: string | null
          zugeordnet_einrichtung_id?: string | null
          zugeordnet_mitarbeiter_id?: string | null
          zuordnung_confidence?: number | null
          zuordnung_quelle?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      kunden_bestaetigungen: {
        Row: {
          bedarf_id: string | null
          betreff: string
          body_text: string
          created_at: string
          created_by: string | null
          dokument_ids: string[]
          einrichtung_id: string
          einsatz_id: string | null
          empfaenger_email: string | null
          empfaenger_name: string | null
          fehler: string | null
          gesendet_am: string | null
          id: string
          ma_unterlagen_fehler: string | null
          ma_unterlagen_status: string
          mitarbeiter_id: string
          status: Database["public"]["Enums"]["kundenbestaetigung_status"]
          updated_at: string
        }
        Insert: {
          bedarf_id?: string | null
          betreff?: string
          body_text?: string
          created_at?: string
          created_by?: string | null
          dokument_ids?: string[]
          einrichtung_id: string
          einsatz_id?: string | null
          empfaenger_email?: string | null
          empfaenger_name?: string | null
          fehler?: string | null
          gesendet_am?: string | null
          id?: string
          ma_unterlagen_fehler?: string | null
          ma_unterlagen_status?: string
          mitarbeiter_id: string
          status?: Database["public"]["Enums"]["kundenbestaetigung_status"]
          updated_at?: string
        }
        Update: {
          bedarf_id?: string | null
          betreff?: string
          body_text?: string
          created_at?: string
          created_by?: string | null
          dokument_ids?: string[]
          einrichtung_id?: string
          einsatz_id?: string | null
          empfaenger_email?: string | null
          empfaenger_name?: string | null
          fehler?: string | null
          gesendet_am?: string | null
          id?: string
          ma_unterlagen_fehler?: string | null
          ma_unterlagen_status?: string
          mitarbeiter_id?: string
          status?: Database["public"]["Enums"]["kundenbestaetigung_status"]
          updated_at?: string
        }
        Relationships: []
      }
      mitarbeiter: {
        Row: {
          aktiv: boolean
          anstellung: Database["public"]["Enums"]["anstellung"]
          austritt_datum: string | null
          created_at: string
          dienste_moeglich: Database["public"]["Enums"]["dienst"][]
          einmal_code: string | null
          einmal_code_verbraucht_am: string | null
          email: string | null
          fuehrerschein: boolean
          geocode_fehler: string | null
          geocode_status: string
          geocodiert_am: string | null
          id: string
          kuerzel: string
          lat: number | null
          lng: number | null
          max_einsaetze: number
          max_radius_km: number | null
          nachname: string
          notiz: string | null
          ort: string | null
          plz: string | null
          profil_text: string | null
          qualifikation: Database["public"]["Enums"]["qualifikation"]
          status: Database["public"]["Enums"]["ma_status"]
          strasse: string | null
          telefon: string | null
          telegram_chat_id: number | null
          telegram_username: string | null
          umkreis_km: number | null
          vorname: string
          wohnort: string | null
          zugangs_token: string
        }
        Insert: {
          aktiv?: boolean
          anstellung?: Database["public"]["Enums"]["anstellung"]
          austritt_datum?: string | null
          created_at?: string
          dienste_moeglich?: Database["public"]["Enums"]["dienst"][]
          einmal_code?: string | null
          einmal_code_verbraucht_am?: string | null
          email?: string | null
          fuehrerschein?: boolean
          geocode_fehler?: string | null
          geocode_status?: string
          geocodiert_am?: string | null
          id?: string
          kuerzel: string
          lat?: number | null
          lng?: number | null
          max_einsaetze?: number
          max_radius_km?: number | null
          nachname: string
          notiz?: string | null
          ort?: string | null
          plz?: string | null
          profil_text?: string | null
          qualifikation?: Database["public"]["Enums"]["qualifikation"]
          status?: Database["public"]["Enums"]["ma_status"]
          strasse?: string | null
          telefon?: string | null
          telegram_chat_id?: number | null
          telegram_username?: string | null
          umkreis_km?: number | null
          vorname: string
          wohnort?: string | null
          zugangs_token?: string
        }
        Update: {
          aktiv?: boolean
          anstellung?: Database["public"]["Enums"]["anstellung"]
          austritt_datum?: string | null
          created_at?: string
          dienste_moeglich?: Database["public"]["Enums"]["dienst"][]
          einmal_code?: string | null
          einmal_code_verbraucht_am?: string | null
          email?: string | null
          fuehrerschein?: boolean
          geocode_fehler?: string | null
          geocode_status?: string
          geocodiert_am?: string | null
          id?: string
          kuerzel?: string
          lat?: number | null
          lng?: number | null
          max_einsaetze?: number
          max_radius_km?: number | null
          nachname?: string
          notiz?: string | null
          ort?: string | null
          plz?: string | null
          profil_text?: string | null
          qualifikation?: Database["public"]["Enums"]["qualifikation"]
          status?: Database["public"]["Enums"]["ma_status"]
          strasse?: string | null
          telefon?: string | null
          telegram_chat_id?: number | null
          telegram_username?: string | null
          umkreis_km?: number | null
          vorname?: string
          wohnort?: string | null
          zugangs_token?: string
        }
        Relationships: []
      }
      mitarbeiter_dokumente: {
        Row: {
          ablaufdatum: string | null
          ausstellungsdatum: string | null
          created_at: string
          datei_path: string
          dateiname: string
          erkannt_fehler: string | null
          erkannt_geprueft: boolean
          erkannt_json: Json | null
          erkannt_status: string
          groesse_bytes: number | null
          hochgeladen_von: string | null
          id: string
          mime_type: string | null
          mitarbeiter_id: string
          notiz: string | null
          typ: Database["public"]["Enums"]["dokument_typ"]
          updated_at: string
          weitergabe_erlaubt: boolean
        }
        Insert: {
          ablaufdatum?: string | null
          ausstellungsdatum?: string | null
          created_at?: string
          datei_path: string
          dateiname: string
          erkannt_fehler?: string | null
          erkannt_geprueft?: boolean
          erkannt_json?: Json | null
          erkannt_status?: string
          groesse_bytes?: number | null
          hochgeladen_von?: string | null
          id?: string
          mime_type?: string | null
          mitarbeiter_id: string
          notiz?: string | null
          typ?: Database["public"]["Enums"]["dokument_typ"]
          updated_at?: string
          weitergabe_erlaubt?: boolean
        }
        Update: {
          ablaufdatum?: string | null
          ausstellungsdatum?: string | null
          created_at?: string
          datei_path?: string
          dateiname?: string
          erkannt_fehler?: string | null
          erkannt_geprueft?: boolean
          erkannt_json?: Json | null
          erkannt_status?: string
          groesse_bytes?: number | null
          hochgeladen_von?: string | null
          id?: string
          mime_type?: string | null
          mitarbeiter_id?: string
          notiz?: string | null
          typ?: Database["public"]["Enums"]["dokument_typ"]
          updated_at?: string
          weitergabe_erlaubt?: boolean
        }
        Relationships: []
      }
      nachrichten_templates: {
        Row: {
          bezeichnung: string
          id: string
          schluessel: string
          text: string
          updated_at: string
        }
        Insert: {
          bezeichnung: string
          id?: string
          schluessel: string
          text: string
          updated_at?: string
        }
        Update: {
          bezeichnung?: string
          id?: string
          schluessel?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      telegram_updates: {
        Row: {
          chat_id: number | null
          created_at: string
          mitarbeiter_id: string | null
          raw: Json
          text: string | null
          update_id: number
        }
        Insert: {
          chat_id?: number | null
          created_at?: string
          mitarbeiter_id?: string | null
          raw: Json
          text?: string | null
          update_id: number
        }
        Update: {
          chat_id?: number | null
          created_at?: string
          mitarbeiter_id?: string | null
          raw?: Json
          text?: string | null
          update_id?: number
        }
        Relationships: []
      }
      traeger: {
        Row: {
          aktiv: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verfuegbarkeiten: {
        Row: {
          datum: string
          dienst: Database["public"]["Enums"]["dienst"]
          eingegangen_am: string
          id: string
          mitarbeiter_id: string
          notiz: string | null
          quelle: string
          status: string
          verfuegbar: boolean
        }
        Insert: {
          datum: string
          dienst: Database["public"]["Enums"]["dienst"]
          eingegangen_am?: string
          id?: string
          mitarbeiter_id: string
          notiz?: string | null
          quelle?: string
          status?: string
          verfuegbar: boolean
        }
        Update: {
          datum?: string
          dienst?: Database["public"]["Enums"]["dienst"]
          eingegangen_am?: string
          id?: string
          mitarbeiter_id?: string
          notiz?: string | null
          quelle?: string
          status?: string
          verfuegbar?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "verfuegbarkeiten_mitarbeiter_fk"
            columns: ["mitarbeiter_id"]
            isOneToOne: false
            referencedRelation: "mitarbeiter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verfuegbarkeiten_mitarbeiter_id_fkey"
            columns: ["mitarbeiter_id"]
            isOneToOne: false
            referencedRelation: "mitarbeiter"
            referencedColumns: ["id"]
          },
        ]
      }
      versand_log: {
        Row: {
          absender: string | null
          anfrage_id: string | null
          ausgeloest_von: string | null
          bedarf_id: string | null
          betreff: string | null
          created_at: string
          einrichtung_id: string | null
          empfaenger: string | null
          fehler: string | null
          id: string
          inhalt: string | null
          kanal: Database["public"]["Enums"]["versand_kanal"]
          metadata: Json
          mitarbeiter_id: string | null
          referenz_id: string | null
          referenz_typ: string | null
          richtung: Database["public"]["Enums"]["versand_richtung"]
          status: Database["public"]["Enums"]["versand_status"]
        }
        Insert: {
          absender?: string | null
          anfrage_id?: string | null
          ausgeloest_von?: string | null
          bedarf_id?: string | null
          betreff?: string | null
          created_at?: string
          einrichtung_id?: string | null
          empfaenger?: string | null
          fehler?: string | null
          id?: string
          inhalt?: string | null
          kanal: Database["public"]["Enums"]["versand_kanal"]
          metadata?: Json
          mitarbeiter_id?: string | null
          referenz_id?: string | null
          referenz_typ?: string | null
          richtung?: Database["public"]["Enums"]["versand_richtung"]
          status?: Database["public"]["Enums"]["versand_status"]
        }
        Update: {
          absender?: string | null
          anfrage_id?: string | null
          ausgeloest_von?: string | null
          bedarf_id?: string | null
          betreff?: string | null
          created_at?: string
          einrichtung_id?: string | null
          empfaenger?: string | null
          fehler?: string | null
          id?: string
          inhalt?: string | null
          kanal?: Database["public"]["Enums"]["versand_kanal"]
          metadata?: Json
          mitarbeiter_id?: string | null
          referenz_id?: string | null
          referenz_typ?: string | null
          richtung?: Database["public"]["Enums"]["versand_richtung"]
          status?: Database["public"]["Enums"]["versand_status"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_einmal_code: { Args: { _vorname: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_dispo: { Args: { _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      abwesenheit_art:
        | "Urlaub"
        | "unbezahlter_Urlaub"
        | "krank_mit_AU"
        | "krank_ohne_AU"
        | "Wunschfrei"
      anfrage_status: "offen" | "beantwortet" | "abgelaufen"
      anfrage_typ: "verfuegbarkeit" | "bedarf"
      anstellung: "Vollzeit" | "Teilzeit" | "Minijob"
      app_role: "admin" | "disponent"
      bedarf_status: "offen" | "in_bearbeitung" | "besetzt" | "abgesagt"
      dienst: "F" | "S" | "N"
      dokument_typ: "zertifikat" | "fuehrungszeugnis" | "profil" | "sonstiges"
      einsatz_status:
        | "GEPLANT"
        | "INTERN"
        | "ZUR_UEBERPRUEFUNG"
        | "BESTAETIGT"
        | "AUSGEPLANT"
        | "ABGESAGT"
      email_inbox_status:
        | "neu"
        | "zugeordnet"
        | "bedarf_angelegt"
        | "beantwortet"
        | "archiviert"
        | "fehler"
      empfaenger_typ: "mitarbeiter" | "einrichtung"
      kundenbestaetigung_status: "entwurf" | "gesendet" | "fehler"
      ma_status: "aktiv" | "austritt" | "schwanger" | "gesperrt" | "inaktiv"
      qualifikation:
        | "PFK"
        | "PHK"
        | "GuK"
        | "PFA"
        | "PFM"
        | "PFF"
        | "Azubi"
        | "Berufserfahrung"
        | "LG1_LG2"
        | "Krankenschwester"
      versand_kanal: "telegram" | "email" | "whatsapp" | "intern" | "sonstiges"
      versand_richtung: "out" | "in"
      versand_status: "queued" | "sent" | "delivered" | "failed" | "received"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      abwesenheit_art: [
        "Urlaub",
        "unbezahlter_Urlaub",
        "krank_mit_AU",
        "krank_ohne_AU",
        "Wunschfrei",
      ],
      anfrage_status: ["offen", "beantwortet", "abgelaufen"],
      anfrage_typ: ["verfuegbarkeit", "bedarf"],
      anstellung: ["Vollzeit", "Teilzeit", "Minijob"],
      app_role: ["admin", "disponent"],
      bedarf_status: ["offen", "in_bearbeitung", "besetzt", "abgesagt"],
      dienst: ["F", "S", "N"],
      dokument_typ: ["zertifikat", "fuehrungszeugnis", "profil", "sonstiges"],
      einsatz_status: [
        "GEPLANT",
        "INTERN",
        "ZUR_UEBERPRUEFUNG",
        "BESTAETIGT",
        "AUSGEPLANT",
        "ABGESAGT",
      ],
      email_inbox_status: [
        "neu",
        "zugeordnet",
        "bedarf_angelegt",
        "beantwortet",
        "archiviert",
        "fehler",
      ],
      empfaenger_typ: ["mitarbeiter", "einrichtung"],
      kundenbestaetigung_status: ["entwurf", "gesendet", "fehler"],
      ma_status: ["aktiv", "austritt", "schwanger", "gesperrt", "inaktiv"],
      qualifikation: [
        "PFK",
        "PHK",
        "GuK",
        "PFA",
        "PFM",
        "PFF",
        "Azubi",
        "Berufserfahrung",
        "LG1_LG2",
        "Krankenschwester",
      ],
      versand_kanal: ["telegram", "email", "whatsapp", "intern", "sonstiges"],
      versand_richtung: ["out", "in"],
      versand_status: ["queued", "sent", "delivered", "failed", "received"],
    },
  },
} as const
