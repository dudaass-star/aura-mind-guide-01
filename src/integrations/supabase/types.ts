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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cancellation_feedback: {
        Row: {
          action_taken: string
          created_at: string
          id: string
          pause_until: string | null
          phone: string
          reason: string
          reason_detail: string | null
          user_id: string | null
        }
        Insert: {
          action_taken: string
          created_at?: string
          id?: string
          pause_until?: string | null
          phone: string
          reason: string
          reason_detail?: string | null
          user_id?: string | null
        }
        Update: {
          action_taken?: string
          created_at?: string
          id?: string
          pause_until?: string | null
          phone?: string
          reason?: string
          reason_detail?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      checkins: {
        Row: {
          created_at: string | null
          energy: number | null
          id: string
          mood: number | null
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          energy?: number | null
          id?: string
          mood?: number | null
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          energy?: number | null
          id?: string
          mood?: number | null
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      commitments: {
        Row: {
          commitment_status: string | null
          completed: boolean | null
          created_at: string | null
          description: string | null
          due_date: string | null
          follow_up_count: number | null
          id: string
          reminder_sent: boolean | null
          session_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          commitment_status?: string | null
          completed?: boolean | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          follow_up_count?: number | null
          id?: string
          reminder_sent?: boolean | null
          session_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          commitment_status?: string | null
          completed?: boolean | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          follow_up_count?: number | null
          id?: string
          reminder_sent?: boolean | null
          session_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      conversation_followups: {
        Row: {
          conversation_context: string | null
          created_at: string
          followup_count: number
          id: string
          last_followup_at: string | null
          last_user_message_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_context?: string | null
          created_at?: string
          followup_count?: number
          id?: string
          last_followup_at?: string | null
          last_user_message_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_context?: string | null
          created_at?: string
          followup_count?: number
          id?: string
          last_followup_at?: string | null
          last_user_message_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      plan_configs: {
        Row: {
          created_at: string
          daily_message_target: number
          id: string
          name: string
          plan_id: string
          price_monthly_cents: number
          session_duration_minutes: number
          sessions_per_month: number
          stripe_price_id: string
        }
        Insert: {
          created_at?: string
          daily_message_target?: number
          id?: string
          name: string
          plan_id: string
          price_monthly_cents: number
          session_duration_minutes?: number
          sessions_per_month?: number
          stripe_price_id: string
        }
        Update: {
          created_at?: string
          daily_message_target?: number
          id?: string
          name?: string
          plan_id?: string
          price_monthly_cents?: number
          session_duration_minutes?: number
          sessions_per_month?: number
          stripe_price_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          current_session_id: string | null
          expectations: string | null
          id: string
          last_message_date: string | null
          last_reactivation_sent: string | null
          main_challenges: string[] | null
          messages_today: number | null
          name: string | null
          needs_schedule_setup: boolean | null
          onboarding_completed: boolean | null
          phone: string | null
          plan: string | null
          preferred_session_time: string | null
          preferred_support_style: string | null
          sessions_reset_date: string | null
          sessions_used_this_month: number | null
          status: string | null
          therapy_experience: string | null
          trial_conversations_count: number
          trial_started_at: string | null
          updated_at: string | null
          upgrade_suggested_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_session_id?: string | null
          expectations?: string | null
          id?: string
          last_message_date?: string | null
          last_reactivation_sent?: string | null
          main_challenges?: string[] | null
          messages_today?: number | null
          name?: string | null
          needs_schedule_setup?: boolean | null
          onboarding_completed?: boolean | null
          phone?: string | null
          plan?: string | null
          preferred_session_time?: string | null
          preferred_support_style?: string | null
          sessions_reset_date?: string | null
          sessions_used_this_month?: number | null
          status?: string | null
          therapy_experience?: string | null
          trial_conversations_count?: number
          trial_started_at?: string | null
          updated_at?: string | null
          upgrade_suggested_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_session_id?: string | null
          expectations?: string | null
          id?: string
          last_message_date?: string | null
          last_reactivation_sent?: string | null
          main_challenges?: string[] | null
          messages_today?: number | null
          name?: string | null
          needs_schedule_setup?: boolean | null
          onboarding_completed?: boolean | null
          phone?: string | null
          plan?: string | null
          preferred_session_time?: string | null
          preferred_support_style?: string | null
          sessions_reset_date?: string | null
          sessions_used_this_month?: number | null
          status?: string | null
          therapy_experience?: string | null
          trial_conversations_count?: number
          trial_started_at?: string | null
          updated_at?: string | null
          upgrade_suggested_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_session_id_fkey"
            columns: ["current_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_ratings: {
        Row: {
          created_at: string
          id: string
          rating: number
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_ratings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_themes: {
        Row: {
          created_at: string
          first_mentioned_at: string
          id: string
          last_mentioned_at: string
          resolution_notes: string | null
          session_count: number
          status: string
          theme_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_mentioned_at?: string
          id?: string
          last_mentioned_at?: string
          resolution_notes?: string | null
          session_count?: number
          status?: string
          theme_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_mentioned_at?: string
          id?: string
          last_mentioned_at?: string
          resolution_notes?: string | null
          session_count?: number
          status?: string
          theme_name?: string
          user_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          audio_sent_count: number | null
          commitments: Json | null
          confirmation_requested: boolean | null
          created_at: string
          duration_minutes: number
          ended_at: string | null
          focus_topic: string | null
          id: string
          key_insights: Json | null
          post_session_sent: boolean | null
          rating_requested: boolean | null
          reminder_15m_sent: boolean | null
          reminder_1h_sent: boolean | null
          reminder_24h_sent: boolean | null
          scheduled_at: string
          session_start_notified: boolean | null
          session_summary: string | null
          session_type: Database["public"]["Enums"]["session_type"]
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          user_confirmed: boolean | null
          user_id: string
          waiting_for_scheduled_time: boolean | null
        }
        Insert: {
          audio_sent_count?: number | null
          commitments?: Json | null
          confirmation_requested?: boolean | null
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          focus_topic?: string | null
          id?: string
          key_insights?: Json | null
          post_session_sent?: boolean | null
          rating_requested?: boolean | null
          reminder_15m_sent?: boolean | null
          reminder_1h_sent?: boolean | null
          reminder_24h_sent?: boolean | null
          scheduled_at: string
          session_start_notified?: boolean | null
          session_summary?: string | null
          session_type?: Database["public"]["Enums"]["session_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          user_confirmed?: boolean | null
          user_id: string
          waiting_for_scheduled_time?: boolean | null
        }
        Update: {
          audio_sent_count?: number | null
          commitments?: Json | null
          confirmation_requested?: boolean | null
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          focus_topic?: string | null
          id?: string
          key_insights?: Json | null
          post_session_sent?: boolean | null
          rating_requested?: boolean | null
          reminder_15m_sent?: boolean | null
          reminder_1h_sent?: boolean | null
          reminder_24h_sent?: boolean | null
          scheduled_at?: string
          session_start_notified?: boolean | null
          session_summary?: string | null
          session_type?: Database["public"]["Enums"]["session_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          user_confirmed?: boolean | null
          user_id?: string
          waiting_for_scheduled_time?: boolean | null
        }
        Relationships: []
      }
      short_links: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string | null
          id: string
          phone: string | null
          url: string
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          phone?: string | null
          url: string
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          phone?: string | null
          url?: string
        }
        Relationships: []
      }
      user_insights: {
        Row: {
          category: string
          created_at: string | null
          id: string
          importance: number | null
          key: string
          last_mentioned_at: string | null
          mentioned_count: number | null
          user_id: string
          value: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          importance?: number | null
          key: string
          last_mentioned_at?: string | null
          mentioned_count?: number | null
          user_id: string
          value: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          importance?: number | null
          key?: string
          last_mentioned_at?: string | null
          mentioned_count?: number | null
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      weekly_plans: {
        Row: {
          created_at: string | null
          goals: Json | null
          id: string
          reflections: string | null
          updated_at: string | null
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string | null
          goals?: Json | null
          id?: string
          reflections?: string | null
          updated_at?: string | null
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string | null
          goals?: Json | null
          id?: string
          reflections?: string | null
          updated_at?: string | null
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      zapi_message_dedup: {
        Row: {
          created_at: string
          message_id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          message_id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          message_id?: string
          phone?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      session_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      session_type: "clareza" | "padroes" | "proposito" | "livre"
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
      session_status: [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      session_type: ["clareza", "padroes", "proposito", "livre"],
    },
  },
} as const
