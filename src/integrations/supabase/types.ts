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
          datum: string
          dienst: Database["public"]["Enums"]["dienst"]
          eingegangen_am: string
          einrichtung_id: string
          id: string
          notiz: string | null
          qualifikation: Database["public"]["Enums"]["qualifikation"]
          quelle: string
          status: Database["public"]["Enums"]["bedarf_status"]
        }
        Insert: {
          anzahl?: number
          datum: string
          dienst: Database["public"]["Enums"]["dienst"]
          eingegangen_am?: string
          einrichtung_id: string
          id?: string
          notiz?: string | null
          qualifikation?: Database["public"]["Enums"]["qualifikation"]
          quelle?: string
          status?: Database["public"]["Enums"]["bedarf_status"]
        }
        Update: {
          anzahl?: number
          datum?: string
          dienst?: Database["public"]["Enums"]["dienst"]
          eingegangen_am?: string
          einrichtung_id?: string
          id?: string
          notiz?: string | null
          qualifikation?: Database["public"]["Enums"]["qualifikation"]
          quelle?: string
          status?: Database["public"]["Enums"]["bedarf_status"]
        }
        Relationships: [
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
          id: string
          kontakt_email: string | null
          kontakt_name: string | null
          kontakt_telefon: string | null
          kunde_angelegt: boolean
          name: string
          notiz: string | null
          ort: string | null
          portal_token: string | null
          traeger_id: string | null
          vs_satz_pfk: number | null
          vs_satz_phk: number | null
          wohnbereich: string | null
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          id?: string
          kontakt_email?: string | null
          kontakt_name?: string | null
          kontakt_telefon?: string | null
          kunde_angelegt?: boolean
          name: string
          notiz?: string | null
          ort?: string | null
          portal_token?: string | null
          traeger_id?: string | null
          vs_satz_pfk?: number | null
          vs_satz_phk?: number | null
          wohnbereich?: string | null
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          id?: string
          kontakt_email?: string | null
          kontakt_name?: string | null
          kontakt_telefon?: string | null
          kunde_angelegt?: boolean
          name?: string
          notiz?: string | null
          ort?: string | null
          portal_token?: string | null
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
            foreignKeyName: "einsaetze_einrichtung_fk"
            columns: ["einrichtung_id"]
            isOneToOne: false
            referencedRelation: "einrichtungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einsaetze_einrichtung_id_fkey"
            columns: ["einrichtung_id"]
            isOneToOne: false
            referencedRelation: "einrichtungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einsaetze_mitarbeiter_fk"
            columns: ["mitarbeiter_id"]
            isOneToOne: false
            referencedRelation: "mitarbeiter"
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
      mitarbeiter: {
        Row: {
          aktiv: boolean
          anstellung: Database["public"]["Enums"]["anstellung"]
          austritt_datum: string | null
          created_at: string
          dienste_moeglich: Database["public"]["Enums"]["dienst"][]
          email: string | null
          id: string
          kuerzel: string
          max_einsaetze: number
          nachname: string
          notiz: string | null
          qualifikation: Database["public"]["Enums"]["qualifikation"]
          status: Database["public"]["Enums"]["ma_status"]
          telefon: string | null
          vorname: string
          wohnort: string | null
        }
        Insert: {
          aktiv?: boolean
          anstellung?: Database["public"]["Enums"]["anstellung"]
          austritt_datum?: string | null
          created_at?: string
          dienste_moeglich?: Database["public"]["Enums"]["dienst"][]
          email?: string | null
          id?: string
          kuerzel: string
          max_einsaetze?: number
          nachname: string
          notiz?: string | null
          qualifikation?: Database["public"]["Enums"]["qualifikation"]
          status?: Database["public"]["Enums"]["ma_status"]
          telefon?: string | null
          vorname: string
          wohnort?: string | null
        }
        Update: {
          aktiv?: boolean
          anstellung?: Database["public"]["Enums"]["anstellung"]
          austritt_datum?: string | null
          created_at?: string
          dienste_moeglich?: Database["public"]["Enums"]["dienst"][]
          email?: string | null
          id?: string
          kuerzel?: string
          max_einsaetze?: number
          nachname?: string
          notiz?: string | null
          qualifikation?: Database["public"]["Enums"]["qualifikation"]
          status?: Database["public"]["Enums"]["ma_status"]
          telefon?: string | null
          vorname?: string
          wohnort?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_dispo: { Args: { _user_id: string }; Returns: boolean }
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
      einsatz_status:
        | "GEPLANT"
        | "INTERN"
        | "ZUR_UEBERPRUEFUNG"
        | "BESTAETIGT"
        | "AUSGEPLANT"
        | "ABGESAGT"
      empfaenger_typ: "mitarbeiter" | "einrichtung"
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
      einsatz_status: [
        "GEPLANT",
        "INTERN",
        "ZUR_UEBERPRUEFUNG",
        "BESTAETIGT",
        "AUSGEPLANT",
        "ABGESAGT",
      ],
      empfaenger_typ: ["mitarbeiter", "einrichtung"],
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
    },
  },
} as const
