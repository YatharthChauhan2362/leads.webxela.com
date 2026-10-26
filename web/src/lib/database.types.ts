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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity: {
        Row: {
          action: string
          at: string
          detail: string | null
          id: number
          ip: string | null
          member_email: string | null
          member_id: string | null
          path: string | null
          target: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          at?: string
          detail?: string | null
          id?: never
          ip?: string | null
          member_email?: string | null
          member_id?: string | null
          path?: string | null
          target?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          at?: string
          detail?: string | null
          id?: never
          ip?: string | null
          member_email?: string | null
          member_id?: string | null
          path?: string | null
          target?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          domain: string | null
          has_mx: boolean | null
          linkedin_url: string | null
          name: string
          name_key: string
          pattern: string | null
          pattern_examples: number
          updated_at: string
        }
        Insert: {
          domain?: string | null
          has_mx?: boolean | null
          linkedin_url?: string | null
          name: string
          name_key: string
          pattern?: string | null
          pattern_examples?: number
          updated_at?: string
        }
        Update: {
          domain?: string | null
          has_mx?: boolean | null
          linkedin_url?: string | null
          name?: string
          name_key?: string
          pattern?: string | null
          pattern_examples?: number
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          admin_note: string | null
          created_at: string
          details: string
          id: number
          kind: string
          member_id: string | null
          member_name: string | null
          page: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          details?: string
          id?: never
          kind: string
          member_id?: string | null
          member_name?: string | null
          page?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          details?: string
          id?: never
          kind?: string
          member_id?: string | null
          member_name?: string | null
          page?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          at: string
          from_value: string | null
          id: number
          kind: string
          lead_id: number
          member_id: string | null
          member_name: string | null
          to_value: string | null
        }
        Insert: {
          at?: string
          from_value?: string | null
          id?: never
          kind: string
          lead_id: number
          member_id?: string | null
          member_name?: string | null
          to_value?: string | null
        }
        Update: {
          at?: string
          from_value?: string | null
          id?: never
          kind?: string
          lead_id?: number
          member_id?: string | null
          member_name?: string | null
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          alerted: boolean
          assigned_at: string | null
          assigned_to: string | null
          author: string | null
          author_url: string | null
          budget: string | null
          captured_at: string
          captured_by: string | null
          captured_day: string | null
          contact_checked_at: string | null
          contact_note: string | null
          contacted_at: string | null
          deal_currency: string | null
          deal_value: number | null
          emails: string
          follow_up_at: string | null
          headline: string | null
          id: number
          intent: string | null
          is_lead: boolean
          lost_reason: string | null
          matched_search: string | null
          notes: string
          phones: string
          post_key: string
          post_url: string | null
          posted_at: string | null
          reason: string | null
          reply: string | null
          score: number
          skills: string | null
          source: string
          status: string
          text: string
          urgency: string | null
          websites: string
          won_at: string | null
          work_email: string | null
          work_email_confidence: number | null
          work_email_status: string | null
        }
        Insert: {
          alerted?: boolean
          assigned_at?: string | null
          assigned_to?: string | null
          author?: string | null
          author_url?: string | null
          budget?: string | null
          captured_at?: string
          captured_by?: string | null
          captured_day?: string | null
          contact_checked_at?: string | null
          contact_note?: string | null
          contacted_at?: string | null
          deal_currency?: string | null
          deal_value?: number | null
          emails?: string
          follow_up_at?: string | null
          headline?: string | null
          id?: never
          intent?: string | null
          is_lead?: boolean
          lost_reason?: string | null
          matched_search?: string | null
          notes?: string
          phones?: string
          post_key: string
          post_url?: string | null
          posted_at?: string | null
          reason?: string | null
          reply?: string | null
          score?: number
          skills?: string | null
          source: string
          status?: string
          text: string
          urgency?: string | null
          websites?: string
          won_at?: string | null
          work_email?: string | null
          work_email_confidence?: number | null
          work_email_status?: string | null
        }
        Update: {
          alerted?: boolean
          assigned_at?: string | null
          assigned_to?: string | null
          author?: string | null
          author_url?: string | null
          budget?: string | null
          captured_at?: string
          captured_by?: string | null
          captured_day?: string | null
          contact_checked_at?: string | null
          contact_note?: string | null
          contacted_at?: string | null
          deal_currency?: string | null
          deal_value?: number | null
          emails?: string
          follow_up_at?: string | null
          headline?: string | null
          id?: never
          intent?: string | null
          is_lead?: boolean
          lost_reason?: string | null
          matched_search?: string | null
          notes?: string
          phones?: string
          post_key?: string
          post_url?: string | null
          posted_at?: string | null
          reason?: string | null
          reply?: string | null
          score?: number
          skills?: string | null
          source?: string
          status?: string
          text?: string
          urgency?: string | null
          websites?: string
          won_at?: string | null
          work_email?: string | null
          work_email_confidence?: number | null
          work_email_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          api_key: string | null
          auto_access: boolean
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          job: string
          last_login_at: string | null
          last_seen_at: string | null
          login_with: string
          name: string | null
          provider: string | null
          role: string
          searches: string
          status: string
          team_id: string | null
          watched_profiles: string
        }
        Insert: {
          api_key?: string | null
          auto_access?: boolean
          avatar_url?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          job?: string
          last_login_at?: string | null
          last_seen_at?: string | null
          login_with?: string
          name?: string | null
          provider?: string | null
          role?: string
          searches?: string
          status?: string
          team_id?: string | null
          watched_profiles?: string
        }
        Update: {
          api_key?: string | null
          auto_access?: boolean
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          job?: string
          last_login_at?: string | null
          last_seen_at?: string | null
          login_with?: string
          name?: string | null
          provider?: string | null
          role?: string
          searches?: string
          status?: string
          team_id?: string | null
          watched_profiles?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: number
          kind: string
          lead_id: number | null
          member_id: string
          pushed_at: string | null
          read_at: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: never
          kind: string
          lead_id?: number | null
          member_id: string
          pushed_at?: string | null
          read_at?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: never
          kind?: string
          lead_id?: number | null
          member_id?: string
          pushed_at?: string | null
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          captured_by: string | null
          company: string | null
          company_domain: string | null
          email_alternatives: string
          emails: string
          github_url: string | null
          headline: string | null
          location: string | null
          name: string | null
          phones: string
          photo_url: string | null
          updated_at: string
          url: string
          websites: string
          work_email: string | null
          work_email_confidence: number | null
          work_email_status: string | null
        }
        Insert: {
          captured_by?: string | null
          company?: string | null
          company_domain?: string | null
          email_alternatives?: string
          emails?: string
          github_url?: string | null
          headline?: string | null
          location?: string | null
          name?: string | null
          phones?: string
          photo_url?: string | null
          updated_at?: string
          url: string
          websites?: string
          work_email?: string | null
          work_email_confidence?: number | null
          work_email_status?: string | null
        }
        Update: {
          captured_by?: string | null
          company?: string | null
          company_domain?: string | null
          email_alternatives?: string
          emails?: string
          github_url?: string | null
          headline?: string | null
          location?: string | null
          name?: string | null
          phones?: string
          photo_url?: string | null
          updated_at?: string
          url?: string
          websites?: string
          work_email?: string | null
          work_email_confidence?: number | null
          work_email_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          added: number
          at: string
          error: string | null
          found: number
          id: number
          kind: string
        }
        Insert: {
          added: number
          at?: string
          error?: string | null
          found: number
          id?: never
          kind: string
        }
        Update: {
          added?: number
          at?: string
          error?: string | null
          found?: number
          id?: never
          kind?: string
        }
        Relationships: []
      }
      search_engines: {
        Row: {
          active: boolean
          created_at: string
          cx: string
          id: string
          kind: string
          label: string
          last_error: string | null
          used_on: string | null
          used_today: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          cx: string
          id?: string
          kind: string
          label: string
          last_error?: string | null
          used_on?: string | null
          used_today?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          cx?: string
          id?: string
          kind?: string
          label?: string
          last_error?: string | null
          used_on?: string | null
          used_today?: number
        }
        Relationships: []
      }
      search_keys: {
        Row: {
          active: boolean
          api_key: string
          created_at: string
          daily_limit: number
          exhausted_on: string | null
          id: string
          label: string
          last_error: string | null
          used_on: string | null
          used_today: number
        }
        Insert: {
          active?: boolean
          api_key: string
          created_at?: string
          daily_limit?: number
          exhausted_on?: string | null
          id?: string
          label: string
          last_error?: string | null
          used_on?: string | null
          used_today?: number
        }
        Update: {
          active?: boolean
          api_key?: string
          created_at?: string
          daily_limit?: number
          exhausted_on?: string | null
          id?: string
          label?: string
          last_error?: string | null
          used_on?: string | null
          used_today?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      enrich_queue: {
        Args: { p_limit: number; p_min: number }
        Returns: string[]
      }
      lead_stats: { Args: { p_alert: number; p_since: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
