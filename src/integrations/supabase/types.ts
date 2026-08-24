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
      admin_metrics_snapshots: {
        Row: {
          compute_ms: number | null
          computed_at: string
          date_from: string
          date_to: string
          payload: Json
          window_key: string
        }
        Insert: {
          compute_ms?: number | null
          computed_at?: string
          date_from: string
          date_to: string
          payload: Json
          window_key: string
        }
        Update: {
          compute_ms?: number | null
          computed_at?: string
          date_from?: string
          date_to?: string
          payload?: Json
          window_key?: string
        }
        Relationships: []
      }
      asaas_payments: {
        Row: {
          amount_cents: number
          asaas_customer_id: string
          asaas_payment_id: string
          asaas_subscription_id: string | null
          billing_period: string
          created_at: string
          customer_cpf: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          fbc: string | null
          fbp: string | null
          ga_client_id: string | null
          id: string
          invoice_url: string | null
          is_trial: boolean
          paid_at: string | null
          payment_method: string
          pix_copy_paste: string | null
          pix_expires_at: string | null
          pix_qr_code: string | null
          plan: string
          raw_payload: Json | null
          status: string
          updated_at: string
          user_id: string | null
          whatsapp_recovery_15min_sent_at: string | null
          whatsapp_recovery_24h_sent_at: string | null
          whatsapp_recovery_last_error: string | null
        }
        Insert: {
          amount_cents: number
          asaas_customer_id: string
          asaas_payment_id: string
          asaas_subscription_id?: string | null
          billing_period: string
          created_at?: string
          customer_cpf: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          fbc?: string | null
          fbp?: string | null
          ga_client_id?: string | null
          id?: string
          invoice_url?: string | null
          is_trial?: boolean
          paid_at?: string | null
          payment_method?: string
          pix_copy_paste?: string | null
          pix_expires_at?: string | null
          pix_qr_code?: string | null
          plan: string
          raw_payload?: Json | null
          status?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_recovery_15min_sent_at?: string | null
          whatsapp_recovery_24h_sent_at?: string | null
          whatsapp_recovery_last_error?: string | null
        }
        Update: {
          amount_cents?: number
          asaas_customer_id?: string
          asaas_payment_id?: string
          asaas_subscription_id?: string | null
          billing_period?: string
          created_at?: string
          customer_cpf?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          fbc?: string | null
          fbp?: string | null
          ga_client_id?: string | null
          id?: string
          invoice_url?: string | null
          is_trial?: boolean
          paid_at?: string | null
          payment_method?: string
          pix_copy_paste?: string | null
          pix_expires_at?: string | null
          pix_qr_code?: string | null
          plan?: string
          raw_payload?: Json | null
          status?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_recovery_15min_sent_at?: string | null
          whatsapp_recovery_24h_sent_at?: string | null
          whatsapp_recovery_last_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asaas_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_pix_authorizations: {
        Row: {
          activated_at: string | null
          asaas_authorization_id: string
          asaas_customer_id: string
          asaas_subscription_id: string | null
          autodebit_alert_sent_at: string | null
          billing_period: string
          cancellation_reason: string | null
          cancelled_at: string | null
          contract_id: string
          created_at: string
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          fbc: string | null
          fbp: string | null
          finish_date: string | null
          frequency: string
          ga_client_id: string | null
          id: string
          is_trial: boolean
          last_synced_at: string | null
          plan: string
          qr_encoded_image: string | null
          qr_expires_at: string | null
          qr_payload: string | null
          raw_payload: Json | null
          reauth_link_sent_at: string | null
          reauth_notified_at: string | null
          recovery_email_2_sent_at: string | null
          recovery_email_sent_at: string | null
          replaced_by_authorization_id: string | null
          start_date: string
          status: string
          trial_value_cents: number | null
          updated_at: string
          user_id: string | null
          value_cents: number
        }
        Insert: {
          activated_at?: string | null
          asaas_authorization_id: string
          asaas_customer_id: string
          asaas_subscription_id?: string | null
          autodebit_alert_sent_at?: string | null
          billing_period: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          contract_id: string
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          fbc?: string | null
          fbp?: string | null
          finish_date?: string | null
          frequency: string
          ga_client_id?: string | null
          id?: string
          is_trial?: boolean
          last_synced_at?: string | null
          plan: string
          qr_encoded_image?: string | null
          qr_expires_at?: string | null
          qr_payload?: string | null
          raw_payload?: Json | null
          reauth_link_sent_at?: string | null
          reauth_notified_at?: string | null
          recovery_email_2_sent_at?: string | null
          recovery_email_sent_at?: string | null
          replaced_by_authorization_id?: string | null
          start_date: string
          status?: string
          trial_value_cents?: number | null
          updated_at?: string
          user_id?: string | null
          value_cents: number
        }
        Update: {
          activated_at?: string | null
          asaas_authorization_id?: string
          asaas_customer_id?: string
          asaas_subscription_id?: string | null
          autodebit_alert_sent_at?: string | null
          billing_period?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          contract_id?: string
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          fbc?: string | null
          fbp?: string | null
          finish_date?: string | null
          frequency?: string
          ga_client_id?: string | null
          id?: string
          is_trial?: boolean
          last_synced_at?: string | null
          plan?: string
          qr_encoded_image?: string | null
          qr_expires_at?: string | null
          qr_payload?: string | null
          raw_payload?: Json | null
          reauth_link_sent_at?: string | null
          reauth_notified_at?: string | null
          recovery_email_2_sent_at?: string | null
          recovery_email_sent_at?: string | null
          replaced_by_authorization_id?: string | null
          start_date?: string
          status?: string
          trial_value_cents?: number | null
          updated_at?: string
          user_id?: string | null
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "asaas_pix_authorizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aura_response_state: {
        Row: {
          is_responding: boolean | null
          last_user_context: Json | null
          last_user_message_id: string | null
          pending_content: string | null
          pending_context: string | null
          response_started_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          is_responding?: boolean | null
          last_user_context?: Json | null
          last_user_message_id?: string | null
          pending_content?: string | null
          pending_context?: string | null
          response_started_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          is_responding?: boolean | null
          last_user_context?: Json | null
          last_user_message_id?: string | null
          pending_content?: string | null
          pending_context?: string | null
          response_started_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      blog_clusters: {
        Row: {
          created_at: string
          cta_copy: string
          description: string | null
          display_order: number
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          cta_copy: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          cta_copy?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          cluster_id: string | null
          content_md: string
          cover_alt: string | null
          cover_url: string | null
          created_at: string
          excerpt: string
          faq: Json
          id: string
          is_pillar: boolean
          json_ld: Json
          meta_description: string
          meta_title: string
          published_at: string | null
          reading_minutes: number
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          word_count: number
        }
        Insert: {
          cluster_id?: string | null
          content_md: string
          cover_alt?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt: string
          faq?: Json
          id?: string
          is_pillar?: boolean
          json_ld?: Json
          meta_description: string
          meta_title: string
          published_at?: string | null
          reading_minutes?: number
          slug: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          word_count?: number
        }
        Update: {
          cluster_id?: string | null
          content_md?: string
          cover_alt?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string
          faq?: Json
          id?: string
          is_pillar?: boolean
          json_ld?: Json
          meta_description?: string
          meta_title?: string
          published_at?: string | null
          reading_minutes?: number
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "blog_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_feedback: {
        Row: {
          action_taken: string
          created_at: string
          gateway: string | null
          id: string
          pause_until: string | null
          phone: string
          reason: string
          reason_detail: string | null
          save_offer_accepted: boolean | null
          save_tier: string | null
          user_id: string | null
        }
        Insert: {
          action_taken: string
          created_at?: string
          gateway?: string | null
          id?: string
          pause_until?: string | null
          phone: string
          reason: string
          reason_detail?: string | null
          save_offer_accepted?: boolean | null
          save_tier?: string | null
          user_id?: string | null
        }
        Update: {
          action_taken?: string
          created_at?: string
          gateway?: string | null
          id?: string
          pause_until?: string | null
          phone?: string
          reason?: string
          reason_detail?: string | null
          save_offer_accepted?: boolean | null
          save_tier?: string | null
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
      checkout_funnel_events: {
        Row: {
          anon_session_id: string | null
          billing: string | null
          created_at: string
          detail: string | null
          id: string
          meta: Json | null
          payment_method: string | null
          plan: string | null
          step: string
        }
        Insert: {
          anon_session_id?: string | null
          billing?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          meta?: Json | null
          payment_method?: string | null
          plan?: string | null
          step: string
        }
        Update: {
          anon_session_id?: string | null
          billing?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          meta?: Json | null
          payment_method?: string | null
          plan?: string | null
          step?: string
        }
        Relationships: []
      }
      checkout_recovery_attempts: {
        Row: {
          checkout_session_id: string
          created_at: string
          error_message: string | null
          id: string
          phone_normalized: string | null
          phone_raw: string | null
          provider_response: Json | null
          status: string
        }
        Insert: {
          checkout_session_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          phone_normalized?: string | null
          phone_raw?: string | null
          provider_response?: Json | null
          status?: string
        }
        Update: {
          checkout_session_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          phone_normalized?: string | null
          phone_raw?: string | null
          provider_response?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_recovery_attempts_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_sessions: {
        Row: {
          billing: string | null
          completed_at: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          payment_method: string | null
          phone: string
          plan: string | null
          recovery_attempts_count: number
          recovery_last_error: string | null
          recovery_sent: boolean
          recovery_sent_at: string | null
          recovery_stage: number
          recovery_stage1_sent_at: string | null
          recovery_stage2_sent_at: string | null
          recovery_stage3_sent_at: string | null
          status: string
          stripe_session_id: string | null
          whatsapp_recovery_15min_sent_at: string | null
          whatsapp_recovery_24h_sent_at: string | null
          whatsapp_recovery_last_error: string | null
        }
        Insert: {
          billing?: string | null
          completed_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          payment_method?: string | null
          phone: string
          plan?: string | null
          recovery_attempts_count?: number
          recovery_last_error?: string | null
          recovery_sent?: boolean
          recovery_sent_at?: string | null
          recovery_stage?: number
          recovery_stage1_sent_at?: string | null
          recovery_stage2_sent_at?: string | null
          recovery_stage3_sent_at?: string | null
          status?: string
          stripe_session_id?: string | null
          whatsapp_recovery_15min_sent_at?: string | null
          whatsapp_recovery_24h_sent_at?: string | null
          whatsapp_recovery_last_error?: string | null
        }
        Update: {
          billing?: string | null
          completed_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          payment_method?: string | null
          phone?: string
          plan?: string | null
          recovery_attempts_count?: number
          recovery_last_error?: string | null
          recovery_sent?: boolean
          recovery_sent_at?: string | null
          recovery_stage?: number
          recovery_stage1_sent_at?: string | null
          recovery_stage2_sent_at?: string | null
          recovery_stage3_sent_at?: string | null
          status?: string
          stripe_session_id?: string | null
          whatsapp_recovery_15min_sent_at?: string | null
          whatsapp_recovery_24h_sent_at?: string | null
          whatsapp_recovery_last_error?: string | null
        }
        Relationships: []
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
      content_journeys: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          next_journey_id: string | null
          title: string
          topic: string
          total_episodes: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id: string
          is_active?: boolean | null
          next_journey_id?: string | null
          title: string
          topic: string
          total_episodes?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          next_journey_id?: string | null
          title?: string
          topic?: string
          total_episodes?: number
        }
        Relationships: []
      }
      conversation_followups: {
        Row: {
          conversation_context: string | null
          created_at: string
          followup_count: number
          id: string
          last_followup_at: string | null
          last_reengagement_at: string | null
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
          last_reengagement_at?: string | null
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
          last_reengagement_at?: string | null
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
      dunning_attempts: {
        Row: {
          attempt_number: number | null
          channel: string | null
          created_at: string
          customer_id: string | null
          days_past_due: number | null
          error_message: string | null
          error_stage: string | null
          event_id: string
          id: string
          invoice_id: string | null
          link_generated: boolean
          message_sid: string | null
          offer_accepted: boolean | null
          offer_tier: string | null
          offer_token_code: string | null
          payment_id: string | null
          phone_raw: string | null
          phone_resolved: string | null
          profile_found: boolean
          profile_user_id: string | null
          provider: string | null
          subscription_id: string | null
          template_sid: string | null
          whatsapp_sent: boolean
        }
        Insert: {
          attempt_number?: number | null
          channel?: string | null
          created_at?: string
          customer_id?: string | null
          days_past_due?: number | null
          error_message?: string | null
          error_stage?: string | null
          event_id: string
          id?: string
          invoice_id?: string | null
          link_generated?: boolean
          message_sid?: string | null
          offer_accepted?: boolean | null
          offer_tier?: string | null
          offer_token_code?: string | null
          payment_id?: string | null
          phone_raw?: string | null
          phone_resolved?: string | null
          profile_found?: boolean
          profile_user_id?: string | null
          provider?: string | null
          subscription_id?: string | null
          template_sid?: string | null
          whatsapp_sent?: boolean
        }
        Update: {
          attempt_number?: number | null
          channel?: string | null
          created_at?: string
          customer_id?: string | null
          days_past_due?: number | null
          error_message?: string | null
          error_stage?: string | null
          event_id?: string
          id?: string
          invoice_id?: string | null
          link_generated?: boolean
          message_sid?: string | null
          offer_accepted?: boolean | null
          offer_tier?: string | null
          offer_token_code?: string | null
          payment_id?: string | null
          phone_raw?: string | null
          phone_resolved?: string | null
          profile_found?: boolean
          profile_user_id?: string | null
          provider?: string | null
          subscription_id?: string | null
          template_sid?: string | null
          whatsapp_sent?: boolean
        }
        Relationships: []
      }
      editorial_calendar: {
        Row: {
          attempts: number
          blog_post_id: string | null
          briefing: string
          cluster_id: string
          created_at: string
          error_message: string | null
          id: string
          is_pillar: boolean
          keyword: string
          proposed_title: string
          requires_manual_review: boolean
          scheduled_for: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          blog_post_id?: string | null
          briefing: string
          cluster_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          is_pillar?: boolean
          keyword: string
          proposed_title: string
          requires_manual_review?: boolean
          scheduled_for: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          blog_post_id?: string | null
          briefing?: string
          cluster_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          is_pillar?: boolean
          keyword?: string
          proposed_title?: string
          requires_manual_review?: boolean
          scheduled_for?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "editorial_calendar_blog_post_id_fkey"
            columns: ["blog_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_calendar_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "blog_clusters"
            referencedColumns: ["id"]
          },
        ]
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
      failed_message_log: {
        Row: {
          content: string
          created_at: string
          error: string | null
          function_name: string
          id: string
          phone: string | null
          resolved: boolean
          retry_count: number
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          error?: string | null
          function_name?: string
          id?: string
          phone?: string | null
          resolved?: boolean
          retry_count?: number
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          error?: string | null
          function_name?: string
          id?: string
          phone?: string | null
          resolved?: boolean
          retry_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      gemini_cache: {
        Row: {
          cache_name: string
          created_at: string | null
          expires_at: string
          id: string
          model: string
          prompt_hash: string
        }
        Insert: {
          cache_name: string
          created_at?: string | null
          expires_at: string
          id?: string
          model: string
          prompt_hash: string
        }
        Update: {
          cache_name?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          model?: string
          prompt_hash?: string
        }
        Relationships: []
      }
      instagram_config: {
        Row: {
          comment_keywords: string[] | null
          comment_response_enabled: boolean
          daily_count: number
          dm_response_enabled: boolean
          id: number
          ig_account_id: string | null
          last_reset_date: string
          max_daily_responses: number
          meta_access_token: string | null
          page_id: string | null
          response_enabled: boolean
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          comment_keywords?: string[] | null
          comment_response_enabled?: boolean
          daily_count?: number
          dm_response_enabled?: boolean
          id?: number
          ig_account_id?: string | null
          last_reset_date?: string
          max_daily_responses?: number
          meta_access_token?: string | null
          page_id?: string | null
          response_enabled?: boolean
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          comment_keywords?: string[] | null
          comment_response_enabled?: boolean
          daily_count?: number
          dm_response_enabled?: boolean
          id?: number
          ig_account_id?: string | null
          last_reset_date?: string
          max_daily_responses?: number
          meta_access_token?: string | null
          page_id?: string | null
          response_enabled?: boolean
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      instagram_interactions: {
        Row: {
          comment_id: string | null
          created_at: string
          error_message: string | null
          id: string
          ig_user_id: string
          ig_username: string | null
          interaction_type: string
          original_text: string
          post_id: string | null
          responded: boolean
          response_text: string | null
          sentiment: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ig_user_id: string
          ig_username?: string | null
          interaction_type: string
          original_text: string
          post_id?: string | null
          responded?: boolean
          response_text?: string | null
          sentiment?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ig_user_id?: string
          ig_username?: string | null
          interaction_type?: string
          original_text?: string
          post_id?: string | null
          responded?: boolean
          response_text?: string | null
          sentiment?: string | null
        }
        Relationships: []
      }
      instance_health_logs: {
        Row: {
          alert_sent: boolean
          checked_at: string
          error_message: string | null
          id: string
          instance_id: string
          is_connected: boolean
          response_raw: Json | null
          smartphone_connected: boolean
        }
        Insert: {
          alert_sent?: boolean
          checked_at?: string
          error_message?: string | null
          id?: string
          instance_id: string
          is_connected?: boolean
          response_raw?: Json | null
          smartphone_connected?: boolean
        }
        Update: {
          alert_sent?: boolean
          checked_at?: string
          error_message?: string | null
          id?: string
          instance_id?: string
          is_connected?: boolean
          response_raw?: Json | null
          smartphone_connected?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "instance_health_logs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_pix_charges: {
        Row: {
          access_activated_at: string | null
          created_at: string
          cycle_index: number | null
          due_date: string
          e2e_id: string | null
          id: string
          id_rec: string
          last_error: string | null
          paid_at: string | null
          raw_payload: Json | null
          retry_count: number
          status: string
          txid: string
          updated_at: string
          user_id: string | null
          value_cents: number
        }
        Insert: {
          access_activated_at?: string | null
          created_at?: string
          cycle_index?: number | null
          due_date: string
          e2e_id?: string | null
          id?: string
          id_rec: string
          last_error?: string | null
          paid_at?: string | null
          raw_payload?: Json | null
          retry_count?: number
          status?: string
          txid: string
          updated_at?: string
          user_id?: string | null
          value_cents: number
        }
        Update: {
          access_activated_at?: string | null
          created_at?: string
          cycle_index?: number | null
          due_date?: string
          e2e_id?: string | null
          id?: string
          id_rec?: string
          last_error?: string | null
          paid_at?: string | null
          raw_payload?: Json | null
          retry_count?: number
          status?: string
          txid?: string
          updated_at?: string
          user_id?: string | null
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "inter_pix_charges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_pix_recurrences: {
        Row: {
          access_granted_at: string | null
          authorization_url: string | null
          billing_period: string
          contract_id: string | null
          created_at: string
          creation_status: string
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          fbc: string | null
          fbp: string | null
          finish_date: string | null
          ga_client_id: string | null
          id: string
          id_rec: string | null
          id_solic_rec: string | null
          is_trial: boolean
          last_error: string | null
          next_charge_date: string | null
          periodicidade: string
          plan: string
          qr_encoded_image: string | null
          qr_expires_at: string | null
          qr_payload: string | null
          raw_payload: Json | null
          replaced_by_id_rec: string | null
          request_key: string | null
          start_date: string | null
          status: string
          trial_value_cents: number | null
          updated_at: string
          user_id: string | null
          value_cents: number
        }
        Insert: {
          access_granted_at?: string | null
          authorization_url?: string | null
          billing_period: string
          contract_id?: string | null
          created_at?: string
          creation_status?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          fbc?: string | null
          fbp?: string | null
          finish_date?: string | null
          ga_client_id?: string | null
          id?: string
          id_rec?: string | null
          id_solic_rec?: string | null
          is_trial?: boolean
          last_error?: string | null
          next_charge_date?: string | null
          periodicidade: string
          plan: string
          qr_encoded_image?: string | null
          qr_expires_at?: string | null
          qr_payload?: string | null
          raw_payload?: Json | null
          replaced_by_id_rec?: string | null
          request_key?: string | null
          start_date?: string | null
          status?: string
          trial_value_cents?: number | null
          updated_at?: string
          user_id?: string | null
          value_cents: number
        }
        Update: {
          access_granted_at?: string | null
          authorization_url?: string | null
          billing_period?: string
          contract_id?: string | null
          created_at?: string
          creation_status?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          fbc?: string | null
          fbp?: string | null
          finish_date?: string | null
          ga_client_id?: string | null
          id?: string
          id_rec?: string | null
          id_solic_rec?: string | null
          is_trial?: boolean
          last_error?: string | null
          next_charge_date?: string | null
          periodicidade?: string
          plan?: string
          qr_encoded_image?: string | null
          qr_expires_at?: string | null
          qr_payload?: string | null
          raw_payload?: Json | null
          replaced_by_id_rec?: string | null
          request_key?: string | null
          start_date?: string | null
          status?: string
          trial_value_cents?: number | null
          updated_at?: string
          user_id?: string | null
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "inter_pix_recurrences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_webhook_events: {
        Row: {
          attempts: number
          created_at: string
          event_key: string
          id: string
          kind: string
          last_error: string | null
          payload: Json | null
          processed_at: string | null
          processing_started_at: string
          processing_status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_key: string
          id?: string
          kind: string
          last_error?: string | null
          payload?: Json | null
          processed_at?: string | null
          processing_started_at?: string
          processing_status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_key?: string
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json | null
          processed_at?: string | null
          processing_started_at?: string
          processing_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      journey_episodes: {
        Row: {
          content_prompt: string
          context_prompt: string | null
          core_truth: string | null
          created_at: string | null
          episode_number: number
          essay_content: string | null
          hook_text: string
          hook_to_next: string | null
          id: string
          journey_id: string | null
          manifesto_lines: string[] | null
          progression_theme: string | null
          stage_title: string | null
          title: string
          tool_description: string | null
          tool_prompt: string | null
        }
        Insert: {
          content_prompt: string
          context_prompt?: string | null
          core_truth?: string | null
          created_at?: string | null
          episode_number: number
          essay_content?: string | null
          hook_text: string
          hook_to_next?: string | null
          id?: string
          journey_id?: string | null
          manifesto_lines?: string[] | null
          progression_theme?: string | null
          stage_title?: string | null
          title: string
          tool_description?: string | null
          tool_prompt?: string | null
        }
        Update: {
          content_prompt?: string
          context_prompt?: string | null
          core_truth?: string | null
          created_at?: string | null
          episode_number?: number
          essay_content?: string | null
          hook_text?: string
          hook_to_next?: string | null
          id?: string
          journey_id?: string | null
          manifesto_lines?: string[] | null
          progression_theme?: string | null
          stage_title?: string | null
          title?: string
          tool_description?: string | null
          tool_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journey_episodes_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "content_journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      meditation_audio_chunks: {
        Row: {
          chunk_index: number
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          meditation_id: string
          status: string | null
          storage_path: string | null
          total_chunks: number
        }
        Insert: {
          chunk_index: number
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          meditation_id: string
          status?: string | null
          storage_path?: string | null
          total_chunks: number
        }
        Update: {
          chunk_index?: number
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          meditation_id?: string
          status?: string | null
          storage_path?: string | null
          total_chunks?: number
        }
        Relationships: []
      }
      meditation_audios: {
        Row: {
          duration_seconds: number | null
          generated_at: string | null
          id: string
          meditation_id: string
          public_url: string
          storage_path: string
        }
        Insert: {
          duration_seconds?: number | null
          generated_at?: string | null
          id?: string
          meditation_id: string
          public_url: string
          storage_path: string
        }
        Update: {
          duration_seconds?: number | null
          generated_at?: string | null
          id?: string
          meditation_id?: string
          public_url?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "meditation_audios_meditation_id_fkey"
            columns: ["meditation_id"]
            isOneToOne: false
            referencedRelation: "meditations"
            referencedColumns: ["id"]
          },
        ]
      }
      meditations: {
        Row: {
          best_for: string | null
          category: string
          created_at: string | null
          description: string | null
          duration_seconds: number
          id: string
          is_active: boolean | null
          script: string
          title: string
          triggers: string[] | null
        }
        Insert: {
          best_for?: string | null
          category: string
          created_at?: string | null
          description?: string | null
          duration_seconds?: number
          id: string
          is_active?: boolean | null
          script: string
          title: string
          triggers?: string[] | null
        }
        Update: {
          best_for?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          duration_seconds?: number
          id?: string
          is_active?: boolean | null
          script?: string
          title?: string
          triggers?: string[] | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_audio: boolean
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_audio?: boolean
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_audio?: boolean
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
      meta_capi_log: {
        Row: {
          created_at: string
          email_present: boolean | null
          event_id: string | null
          event_name: string
          external_id_present: boolean | null
          fbc_present: boolean | null
          fbp_present: boolean | null
          id: string
          is_first_purchase: boolean | null
          meta_error: string | null
          meta_fbtrace_id: string | null
          meta_status: number | null
          phone_present: boolean | null
          raw_response: Json | null
          request_value: number | null
          source: string | null
        }
        Insert: {
          created_at?: string
          email_present?: boolean | null
          event_id?: string | null
          event_name: string
          external_id_present?: boolean | null
          fbc_present?: boolean | null
          fbp_present?: boolean | null
          id?: string
          is_first_purchase?: boolean | null
          meta_error?: string | null
          meta_fbtrace_id?: string | null
          meta_status?: number | null
          phone_present?: boolean | null
          raw_response?: Json | null
          request_value?: number | null
          source?: string | null
        }
        Update: {
          created_at?: string
          email_present?: boolean | null
          event_id?: string | null
          event_name?: string
          external_id_present?: boolean | null
          fbc_present?: boolean | null
          fbp_present?: boolean | null
          id?: string
          is_first_purchase?: boolean | null
          meta_error?: string | null
          meta_fbtrace_id?: string | null
          meta_status?: number | null
          phone_present?: boolean | null
          raw_response?: Json | null
          request_value?: number | null
          source?: string | null
        }
        Relationships: []
      }
      meta_identity_cache: {
        Row: {
          created_at: string
          email: string | null
          external_id: string | null
          fbc: string | null
          fbp: string | null
          id: string
          last_source: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          external_id?: string | null
          fbc?: string | null
          fbp?: string | null
          id?: string
          last_source?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          external_id?: string | null
          fbc?: string | null
          fbp?: string | null
          id?: string
          last_source?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      monthly_letters: {
        Row: {
          created_at: string
          delivered_at: string | null
          id: string
          letter_month: string
          letter_text: string
          preview_text: string
          sent_at: string | null
          trigger_message_sid: string | null
          trigger_sent_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          letter_month: string
          letter_text: string
          preview_text: string
          sent_at?: string | null
          trigger_message_sid?: string | null
          trigger_sent_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          letter_month?: string
          letter_text?: string
          preview_text?: string
          sent_at?: string | null
          trigger_message_sid?: string | null
          trigger_sent_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      monthly_reports: {
        Row: {
          analysis_text: string | null
          created_at: string
          id: string
          metrics_json: Json | null
          report_html: string | null
          report_month: string
          user_id: string
        }
        Insert: {
          analysis_text?: string | null
          created_at?: string
          id?: string
          metrics_json?: Json | null
          report_html?: string | null
          report_month: string
          user_id: string
        }
        Update: {
          analysis_text?: string | null
          created_at?: string
          id?: string
          metrics_json?: Json | null
          report_html?: string | null
          report_month?: string
          user_id?: string
        }
        Relationships: []
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
          asaas_customer_id: string | null
          audio_mirror_enabled: boolean
          audio_reset_date: string | null
          audio_seconds_used_this_month: number | null
          awaiting_time_capsule: string | null
          billing_cycle: string | null
          canceled_at: string | null
          capsule_prompt_count: number
          capsule_state_set_at: string | null
          card_gateway: string | null
          converted_at: string | null
          created_at: string | null
          current_episode: number | null
          current_journey_id: string | null
          current_session_id: string | null
          do_not_disturb_until: string | null
          email: string | null
          expectations: string | null
          extractor_pending: boolean
          extractor_pending_at: string | null
          first_session_invite_attempts: number
          id: string
          journeys_completed: number | null
          last_checkin_sent_at: string | null
          last_content_sent_at: string | null
          last_interaction_closure_at: string | null
          last_interaction_closure_state: string | null
          last_message_date: string | null
          last_proactive_insight_at: string | null
          last_reactivation_sent: string | null
          last_user_message_at: string | null
          last_winback_reactive_sent_at: string | null
          main_challenges: string[] | null
          messages_reset_month: string | null
          messages_today: number | null
          messages_used_this_month: number
          name: string | null
          needs_schedule_setup: boolean | null
          onboarding_completed: boolean | null
          payment_failed_at: string | null
          pending_capsule_audio_url: string | null
          pending_first_session_invite: boolean
          pending_insight: string | null
          phone: string | null
          pix_consent_lost_at: string | null
          plan: string | null
          plan_expires_at: string | null
          plan_tier: string | null
          preferred_session_time: string | null
          preferred_support_style: string | null
          primary_topic: string | null
          schedule_reminder_first_sent_at: string | null
          schedule_reminder_urgent_sent_at: string | null
          sessions_paused_until: string | null
          sessions_reset_date: string | null
          sessions_used_this_month: number | null
          status: string | null
          therapy_experience: string | null
          tier_limit_notified_month: string | null
          trial_aha_at_count: number | null
          trial_conversations_count: number
          trial_insight_sent_at: string | null
          trial_nudge_active: boolean | null
          trial_phase: string | null
          trial_started_at: string | null
          twilio_redirect_notice_sent_at: string | null
          updated_at: string | null
          upgrade_refusal_count: number
          upgrade_refusal_type: string | null
          upgrade_suggested_at: string | null
          user_id: string
          voice_mode: string
          voice_mode_set_at: string | null
          welcome_sent_at: string | null
          whatsapp_instance_id: string | null
          whatsapp_provider: string | null
          winback_d14_sent_at: string | null
          winback_d3_sent_at: string | null
          winback_d30_sent_at: string | null
        }
        Insert: {
          asaas_customer_id?: string | null
          audio_mirror_enabled?: boolean
          audio_reset_date?: string | null
          audio_seconds_used_this_month?: number | null
          awaiting_time_capsule?: string | null
          billing_cycle?: string | null
          canceled_at?: string | null
          capsule_prompt_count?: number
          capsule_state_set_at?: string | null
          card_gateway?: string | null
          converted_at?: string | null
          created_at?: string | null
          current_episode?: number | null
          current_journey_id?: string | null
          current_session_id?: string | null
          do_not_disturb_until?: string | null
          email?: string | null
          expectations?: string | null
          extractor_pending?: boolean
          extractor_pending_at?: string | null
          first_session_invite_attempts?: number
          id?: string
          journeys_completed?: number | null
          last_checkin_sent_at?: string | null
          last_content_sent_at?: string | null
          last_interaction_closure_at?: string | null
          last_interaction_closure_state?: string | null
          last_message_date?: string | null
          last_proactive_insight_at?: string | null
          last_reactivation_sent?: string | null
          last_user_message_at?: string | null
          last_winback_reactive_sent_at?: string | null
          main_challenges?: string[] | null
          messages_reset_month?: string | null
          messages_today?: number | null
          messages_used_this_month?: number
          name?: string | null
          needs_schedule_setup?: boolean | null
          onboarding_completed?: boolean | null
          payment_failed_at?: string | null
          pending_capsule_audio_url?: string | null
          pending_first_session_invite?: boolean
          pending_insight?: string | null
          phone?: string | null
          pix_consent_lost_at?: string | null
          plan?: string | null
          plan_expires_at?: string | null
          plan_tier?: string | null
          preferred_session_time?: string | null
          preferred_support_style?: string | null
          primary_topic?: string | null
          schedule_reminder_first_sent_at?: string | null
          schedule_reminder_urgent_sent_at?: string | null
          sessions_paused_until?: string | null
          sessions_reset_date?: string | null
          sessions_used_this_month?: number | null
          status?: string | null
          therapy_experience?: string | null
          tier_limit_notified_month?: string | null
          trial_aha_at_count?: number | null
          trial_conversations_count?: number
          trial_insight_sent_at?: string | null
          trial_nudge_active?: boolean | null
          trial_phase?: string | null
          trial_started_at?: string | null
          twilio_redirect_notice_sent_at?: string | null
          updated_at?: string | null
          upgrade_refusal_count?: number
          upgrade_refusal_type?: string | null
          upgrade_suggested_at?: string | null
          user_id: string
          voice_mode?: string
          voice_mode_set_at?: string | null
          welcome_sent_at?: string | null
          whatsapp_instance_id?: string | null
          whatsapp_provider?: string | null
          winback_d14_sent_at?: string | null
          winback_d3_sent_at?: string | null
          winback_d30_sent_at?: string | null
        }
        Update: {
          asaas_customer_id?: string | null
          audio_mirror_enabled?: boolean
          audio_reset_date?: string | null
          audio_seconds_used_this_month?: number | null
          awaiting_time_capsule?: string | null
          billing_cycle?: string | null
          canceled_at?: string | null
          capsule_prompt_count?: number
          capsule_state_set_at?: string | null
          card_gateway?: string | null
          converted_at?: string | null
          created_at?: string | null
          current_episode?: number | null
          current_journey_id?: string | null
          current_session_id?: string | null
          do_not_disturb_until?: string | null
          email?: string | null
          expectations?: string | null
          extractor_pending?: boolean
          extractor_pending_at?: string | null
          first_session_invite_attempts?: number
          id?: string
          journeys_completed?: number | null
          last_checkin_sent_at?: string | null
          last_content_sent_at?: string | null
          last_interaction_closure_at?: string | null
          last_interaction_closure_state?: string | null
          last_message_date?: string | null
          last_proactive_insight_at?: string | null
          last_reactivation_sent?: string | null
          last_user_message_at?: string | null
          last_winback_reactive_sent_at?: string | null
          main_challenges?: string[] | null
          messages_reset_month?: string | null
          messages_today?: number | null
          messages_used_this_month?: number
          name?: string | null
          needs_schedule_setup?: boolean | null
          onboarding_completed?: boolean | null
          payment_failed_at?: string | null
          pending_capsule_audio_url?: string | null
          pending_first_session_invite?: boolean
          pending_insight?: string | null
          phone?: string | null
          pix_consent_lost_at?: string | null
          plan?: string | null
          plan_expires_at?: string | null
          plan_tier?: string | null
          preferred_session_time?: string | null
          preferred_support_style?: string | null
          primary_topic?: string | null
          schedule_reminder_first_sent_at?: string | null
          schedule_reminder_urgent_sent_at?: string | null
          sessions_paused_until?: string | null
          sessions_reset_date?: string | null
          sessions_used_this_month?: number | null
          status?: string | null
          therapy_experience?: string | null
          tier_limit_notified_month?: string | null
          trial_aha_at_count?: number | null
          trial_conversations_count?: number
          trial_insight_sent_at?: string | null
          trial_nudge_active?: boolean | null
          trial_phase?: string | null
          trial_started_at?: string | null
          twilio_redirect_notice_sent_at?: string | null
          updated_at?: string | null
          upgrade_refusal_count?: number
          upgrade_refusal_type?: string | null
          upgrade_suggested_at?: string | null
          user_id?: string
          voice_mode?: string
          voice_mode_set_at?: string | null
          welcome_sent_at?: string | null
          whatsapp_instance_id?: string | null
          whatsapp_provider?: string | null
          winback_d14_sent_at?: string | null
          winback_d3_sent_at?: string | null
          winback_d30_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_journey_id_fkey"
            columns: ["current_journey_id"]
            isOneToOne: false
            referencedRelation: "content_journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_current_session_id_fkey"
            columns: ["current_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_agent_config: {
        Row: {
          created_at: string
          enabled: boolean
          id: number
          max_auto_replies: number
          model: string
          silent_hours_end: number
          silent_hours_start: number
          system_prompt: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: number
          max_auto_replies?: number
          model?: string
          silent_hours_end?: number
          silent_hours_start?: number
          system_prompt?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: number
          max_auto_replies?: number
          model?: string
          silent_hours_end?: number
          silent_hours_start?: number
          system_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      recovery_conversations: {
        Row: {
          auto_paused_reason: string | null
          auto_reply_count: number
          checkout_session_id: string | null
          created_at: string
          last_admin_read_at: string | null
          last_bot_reply_at: string | null
          last_inbound_at: string | null
          last_message_preview: string | null
          last_outbound_at: string | null
          name: string | null
          needs_human: boolean
          phone: string
          updated_at: string
        }
        Insert: {
          auto_paused_reason?: string | null
          auto_reply_count?: number
          checkout_session_id?: string | null
          created_at?: string
          last_admin_read_at?: string | null
          last_bot_reply_at?: string | null
          last_inbound_at?: string | null
          last_message_preview?: string | null
          last_outbound_at?: string | null
          name?: string | null
          needs_human?: boolean
          phone: string
          updated_at?: string
        }
        Update: {
          auto_paused_reason?: string | null
          auto_reply_count?: number
          checkout_session_id?: string | null
          created_at?: string
          last_admin_read_at?: string | null
          last_bot_reply_at?: string | null
          last_inbound_at?: string | null
          last_message_preview?: string | null
          last_outbound_at?: string | null
          name?: string | null
          needs_human?: boolean
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      recovery_knowledge_base: {
        Row: {
          answer: string
          approved_count: number
          category: string
          created_at: string
          id: string
          is_active: boolean
          keywords: string[]
          priority: number
          question: string
          rejected_count: number
          updated_at: string
          usage_count: number
        }
        Insert: {
          answer: string
          approved_count?: number
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          priority?: number
          question: string
          rejected_count?: number
          updated_at?: string
          usage_count?: number
        }
        Update: {
          answer?: string
          approved_count?: number
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          priority?: number
          question?: string
          rejected_count?: number
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      recovery_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          id: string
          media_url: string | null
          message_sid: string | null
          metadata: Json | null
          phone: string
          sent_by_admin: boolean
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction: string
          id?: string
          media_url?: string | null
          message_sid?: string | null
          metadata?: Json | null
          phone: string
          sent_by_admin?: boolean
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          message_sid?: string | null
          metadata?: Json | null
          phone?: string
          sent_by_admin?: boolean
        }
        Relationships: []
      }
      retention_events: {
        Row: {
          action: string
          amount_cents: number | null
          channel: string | null
          created_at: string
          gateway: string | null
          id: string
          metadata: Json
          origin: string
          phone: string | null
          tier: string
          user_id: string | null
        }
        Insert: {
          action: string
          amount_cents?: number | null
          channel?: string | null
          created_at?: string
          gateway?: string | null
          id?: string
          metadata?: Json
          origin: string
          phone?: string | null
          tier: string
          user_id?: string | null
        }
        Update: {
          action?: string
          amount_cents?: number | null
          channel?: string | null
          created_at?: string
          gateway?: string | null
          id?: string
          metadata?: Json
          origin?: string
          phone?: string | null
          tier?: string
          user_id?: string | null
        }
        Relationships: []
      }
      retention_tokens: {
        Row: {
          channel: string
          code: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          gateway: string
          id: string
          payload: Json
          tier: string
          user_id: string
        }
        Insert: {
          channel: string
          code: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          gateway: string
          id?: string
          payload?: Json
          tier: string
          user_id: string
        }
        Update: {
          channel?: string
          code?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          gateway?: string
          id?: string
          payload?: Json
          tier?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_tasks: {
        Row: {
          created_at: string
          execute_at: string
          executed_at: string | null
          id: string
          payload: Json
          status: string
          task_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          execute_at: string
          executed_at?: string | null
          id?: string
          payload?: Json
          status?: string
          task_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          execute_at?: string
          executed_at?: string | null
          id?: string
          payload?: Json
          status?: string
          task_type?: string
          user_id?: string
        }
        Relationships: []
      }
      session_coverage_analyses: {
        Row: {
          analyzed_at: string
          coverage: Json
          diagnosis: string | null
          id: string
          model: string
          overall_score: number | null
          red_flags: string[]
          session_id: string
        }
        Insert: {
          analyzed_at?: string
          coverage: Json
          diagnosis?: string | null
          id?: string
          model: string
          overall_score?: number | null
          red_flags?: string[]
          session_id: string
        }
        Update: {
          analyzed_at?: string
          coverage?: Json
          diagnosis?: string | null
          id?: string
          model?: string
          overall_score?: number | null
          red_flags?: string[]
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_coverage_analyses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
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
          closure_mode: string | null
          closure_text: string | null
          closure_type: string | null
          commitment_confirmed: boolean | null
          commitments: Json | null
          confirmation_requested: boolean | null
          created_at: string
          created_by: string
          duration_minutes: number
          ended_at: string | null
          focus_topic: string | null
          had_dated_bridge: boolean | null
          id: string
          key_insights: Json | null
          last_user_emotional_state: string | null
          post_session_sent: boolean | null
          rating_requested: boolean | null
          reframe_text: string | null
          reminder_15m_sent: boolean | null
          reminder_1h_sent: boolean | null
          reminder_24h_sent: boolean | null
          reminder_5m_sent: boolean | null
          resumption_count: number
          scheduled_at: string
          session_start_notified: boolean | null
          session_summary: string | null
          session_type: Database["public"]["Enums"]["session_type"]
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          theme_label: string | null
          user_confirmed: boolean | null
          user_id: string
          waiting_for_scheduled_time: boolean | null
        }
        Insert: {
          audio_sent_count?: number | null
          closure_mode?: string | null
          closure_text?: string | null
          closure_type?: string | null
          commitment_confirmed?: boolean | null
          commitments?: Json | null
          confirmation_requested?: boolean | null
          created_at?: string
          created_by?: string
          duration_minutes?: number
          ended_at?: string | null
          focus_topic?: string | null
          had_dated_bridge?: boolean | null
          id?: string
          key_insights?: Json | null
          last_user_emotional_state?: string | null
          post_session_sent?: boolean | null
          rating_requested?: boolean | null
          reframe_text?: string | null
          reminder_15m_sent?: boolean | null
          reminder_1h_sent?: boolean | null
          reminder_24h_sent?: boolean | null
          reminder_5m_sent?: boolean | null
          resumption_count?: number
          scheduled_at: string
          session_start_notified?: boolean | null
          session_summary?: string | null
          session_type?: Database["public"]["Enums"]["session_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          theme_label?: string | null
          user_confirmed?: boolean | null
          user_id: string
          waiting_for_scheduled_time?: boolean | null
        }
        Update: {
          audio_sent_count?: number | null
          closure_mode?: string | null
          closure_text?: string | null
          closure_type?: string | null
          commitment_confirmed?: boolean | null
          commitments?: Json | null
          confirmation_requested?: boolean | null
          created_at?: string
          created_by?: string
          duration_minutes?: number
          ended_at?: string | null
          focus_topic?: string | null
          had_dated_bridge?: boolean | null
          id?: string
          key_insights?: Json | null
          last_user_emotional_state?: string | null
          post_session_sent?: boolean | null
          rating_requested?: boolean | null
          reframe_text?: string | null
          reminder_15m_sent?: boolean | null
          reminder_1h_sent?: boolean | null
          reminder_24h_sent?: boolean | null
          reminder_5m_sent?: boolean | null
          resumption_count?: number
          scheduled_at?: string
          session_start_notified?: boolean | null
          session_summary?: string | null
          session_type?: Database["public"]["Enums"]["session_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          theme_label?: string | null
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
      stripe_webhook_events: {
        Row: {
          amount: number | null
          event_type: string
          id: string
          processed_at: string
        }
        Insert: {
          amount?: number | null
          event_type: string
          id: string
          processed_at?: string
        }
        Update: {
          amount?: number | null
          event_type?: string
          id?: string
          processed_at?: string
        }
        Relationships: []
      }
      support_kb_gaps: {
        Row: {
          best_kb_score: number | null
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          occurrence_count: number
          question_text: string
          resolved_at: string | null
          resolved_by: string | null
          resolved_kb_id: string | null
          source_ticket_id: string | null
          status: string
          ticket_subject: string | null
        }
        Insert: {
          best_kb_score?: number | null
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrence_count?: number
          question_text: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_kb_id?: string | null
          source_ticket_id?: string | null
          status?: string
          ticket_subject?: string | null
        }
        Update: {
          best_kb_score?: number | null
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrence_count?: number
          question_text?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_kb_id?: string | null
          source_ticket_id?: string | null
          status?: string
          ticket_subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_kb_gaps_resolved_kb_id_fkey"
            columns: ["resolved_kb_id"]
            isOneToOne: false
            referencedRelation: "support_knowledge_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_kb_gaps_source_ticket_id_fkey"
            columns: ["source_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_knowledge_base: {
        Row: {
          answer: string
          approved_count: number
          category: string
          created_at: string
          created_by: string | null
          edited_count: number
          embedding: string | null
          id: string
          is_active: boolean
          keywords: string[]
          question: string
          rejected_count: number
          title: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          answer: string
          approved_count?: number
          category: string
          created_at?: string
          created_by?: string | null
          edited_count?: number
          embedding?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          question: string
          rejected_count?: number
          title: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          answer?: string
          approved_count?: number
          category?: string
          created_at?: string
          created_by?: string | null
          edited_count?: number
          embedding?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          question?: string
          rejected_count?: number
          title?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      support_ticket_actions: {
        Row: {
          action_type: string
          error_message: string | null
          executed_at: string
          executed_by: string | null
          id: string
          payload: Json | null
          stripe_response: Json | null
          success: boolean
          ticket_id: string
        }
        Insert: {
          action_type: string
          error_message?: string | null
          executed_at?: string
          executed_by?: string | null
          id?: string
          payload?: Json | null
          stripe_response?: Json | null
          success?: boolean
          ticket_id: string
        }
        Update: {
          action_type?: string
          error_message?: string | null
          executed_at?: string
          executed_by?: string | null
          id?: string
          payload?: Json | null
          stripe_response?: Json | null
          success?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_actions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_drafts: {
        Row: {
          ai_model: string
          auto_eligible: boolean
          context_snapshot: Json | null
          draft_body: string
          edit_distance: number | null
          feedback_at: string | null
          feedback_status: string
          final_body: string | null
          generated_at: string
          hint: string | null
          id: string
          is_current: boolean
          kb_top_score: number | null
          suggested_action: Json | null
          suggested_actions: Json | null
          ticket_id: string
        }
        Insert: {
          ai_model: string
          auto_eligible?: boolean
          context_snapshot?: Json | null
          draft_body: string
          edit_distance?: number | null
          feedback_at?: string | null
          feedback_status?: string
          final_body?: string | null
          generated_at?: string
          hint?: string | null
          id?: string
          is_current?: boolean
          kb_top_score?: number | null
          suggested_action?: Json | null
          suggested_actions?: Json | null
          ticket_id: string
        }
        Update: {
          ai_model?: string
          auto_eligible?: boolean
          context_snapshot?: Json | null
          draft_body?: string
          edit_distance?: number | null
          feedback_at?: string | null
          feedback_status?: string
          final_body?: string | null
          generated_at?: string
          hint?: string | null
          id?: string
          is_current?: boolean
          kb_top_score?: number | null
          suggested_action?: Json | null
          suggested_actions?: Json | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_drafts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          attachments: Json | null
          body_html: string | null
          body_text: string | null
          created_at: string
          direction: string
          from_email: string
          headers: Json | null
          id: string
          in_reply_to: string | null
          message_id_header: string | null
          sent_by: string | null
          subject: string | null
          ticket_id: string
          to_email: string
        }
        Insert: {
          attachments?: Json | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          direction: string
          from_email: string
          headers?: Json | null
          id?: string
          in_reply_to?: string | null
          message_id_header?: string | null
          sent_by?: string | null
          subject?: string | null
          ticket_id: string
          to_email: string
        }
        Update: {
          attachments?: Json | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          direction?: string
          from_email?: string
          headers?: Json | null
          id?: string
          in_reply_to?: string | null
          message_id_header?: string | null
          sent_by?: string | null
          subject?: string | null
          ticket_id?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          auto_reply_attempts: number
          auto_sent: boolean
          auto_sent_at: string | null
          category: string | null
          created_at: string
          customer_email: string
          customer_name: string | null
          email_references: string | null
          id: string
          imap_message_id: string | null
          in_reply_to: string | null
          last_inbound_at: string
          last_outbound_at: string | null
          needs_draft_regen: boolean
          profile_user_id: string | null
          recurring_customer: boolean
          reopened_at: string | null
          severity: string | null
          snooze_until: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          auto_reply_attempts?: number
          auto_sent?: boolean
          auto_sent_at?: string | null
          category?: string | null
          created_at?: string
          customer_email: string
          customer_name?: string | null
          email_references?: string | null
          id?: string
          imap_message_id?: string | null
          in_reply_to?: string | null
          last_inbound_at?: string
          last_outbound_at?: string | null
          needs_draft_regen?: boolean
          profile_user_id?: string | null
          recurring_customer?: boolean
          reopened_at?: string | null
          severity?: string | null
          snooze_until?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          auto_reply_attempts?: number
          auto_sent?: boolean
          auto_sent_at?: string | null
          category?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string | null
          email_references?: string | null
          id?: string
          imap_message_id?: string | null
          in_reply_to?: string | null
          last_inbound_at?: string
          last_outbound_at?: string | null
          needs_draft_regen?: boolean
          profile_user_id?: string | null
          recurring_customer?: boolean
          reopened_at?: string | null
          severity?: string | null
          snooze_until?: string | null
          status?: string
          subject?: string
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
      system_config: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      template_definitions: {
        Row: {
          button_text: string
          content_sid: string
          created_at: string
          delivers_content_type: string
          id: string
          is_active: boolean
          notes: string | null
          template_name: string
          updated_at: string
        }
        Insert: {
          button_text: string
          content_sid: string
          created_at?: string
          delivers_content_type: string
          id?: string
          is_active?: boolean
          notes?: string | null
          template_name: string
          updated_at?: string
        }
        Update: {
          button_text?: string
          content_sid?: string
          created_at?: string
          delivers_content_type?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          template_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      thematic_snapshots: {
        Row: {
          confidence: string
          created_at: string
          evidence_date: string | null
          evidence_message_id: string | null
          evidence_quote: string | null
          id: string
          message_count_in_period: number
          period_end: string
          period_start: string
          snapshot_before: string | null
          snapshot_change: string | null
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence: string
          created_at?: string
          evidence_date?: string | null
          evidence_message_id?: string | null
          evidence_quote?: string | null
          id?: string
          message_count_in_period?: number
          period_end: string
          period_start: string
          snapshot_before?: string | null
          snapshot_change?: string | null
          theme: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: string
          created_at?: string
          evidence_date?: string | null
          evidence_message_id?: string | null
          evidence_quote?: string | null
          id?: string
          message_count_in_period?: number
          period_end?: string
          period_start?: string
          snapshot_before?: string | null
          snapshot_change?: string | null
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thematic_snapshots_evidence_message_id_fkey"
            columns: ["evidence_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      time_capsules: {
        Row: {
          audio_url: string
          context_message: string | null
          created_at: string
          deliver_at: string
          delivered: boolean
          delivered_at: string | null
          id: string
          transcription: string | null
          user_id: string
        }
        Insert: {
          audio_url: string
          context_message?: string | null
          created_at?: string
          deliver_at: string
          delivered?: boolean
          delivered_at?: string | null
          id?: string
          transcription?: string | null
          user_id: string
        }
        Update: {
          audio_url?: string
          context_message?: string | null
          created_at?: string
          deliver_at?: string
          delivered?: boolean
          delivered_at?: string | null
          id?: string
          transcription?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_capsules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      token_usage_logs: {
        Row: {
          cached_tokens: number
          call_type: string
          completion_tokens: number
          created_at: string
          function_name: string
          id: string
          model: string
          prompt_tokens: number
          total_tokens: number
          user_id: string | null
        }
        Insert: {
          cached_tokens?: number
          call_type: string
          completion_tokens?: number
          created_at?: string
          function_name: string
          id?: string
          model: string
          prompt_tokens?: number
          total_tokens?: number
          user_id?: string | null
        }
        Update: {
          cached_tokens?: number
          call_type?: string
          completion_tokens?: number
          created_at?: string
          function_name?: string
          id?: string
          model?: string
          prompt_tokens?: number
          total_tokens?: number
          user_id?: string | null
        }
        Relationships: []
      }
      user_evolution_summary: {
        Row: {
          created_at: string
          generation_count: number
          last_generated_at: string
          messages_count_at_generation: number
          summary_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          generation_count?: number
          last_generated_at?: string
          messages_count_at_generation?: number
          summary_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          generation_count?: number
          last_generated_at?: string
          messages_count_at_generation?: number
          summary_text?: string
          updated_at?: string
          user_id?: string
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
      user_journey_history: {
        Row: {
          completed_at: string
          id: string
          journey_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          journey_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          journey_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_meditation_history: {
        Row: {
          context: string | null
          id: string
          meditation_id: string
          sent_at: string | null
          user_id: string
        }
        Insert: {
          context?: string | null
          id?: string
          meditation_id: string
          sent_at?: string | null
          user_id: string
        }
        Update: {
          context?: string | null
          id?: string
          meditation_id?: string
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_meditation_history_meditation_id_fkey"
            columns: ["meditation_id"]
            isOneToOne: false
            referencedRelation: "meditations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_meditation_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_memory_corrections: {
        Row: {
          confidence: number
          correction_text: string
          created_at: string
          id: string
          last_used_at: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          confidence?: number
          correction_text: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          confidence?: number
          correction_text?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_milestones: {
        Row: {
          context_excerpt: string | null
          created_at: string
          id: string
          milestone_date: string
          milestone_text: string
          source: string
          user_id: string
        }
        Insert: {
          context_excerpt?: string | null
          created_at?: string
          id?: string
          milestone_date?: string
          milestone_text: string
          source?: string
          user_id: string
        }
        Update: {
          context_excerpt?: string | null
          created_at?: string
          id?: string
          milestone_date?: string
          milestone_text?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      user_portal_tokens: {
        Row: {
          created_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      user_portraits: {
        Row: {
          conquistas: Json
          generated_at: string
          insights_version: string | null
          intro: string | null
          o_que_te_move: Json
          padroes: Json
          pessoas: Json
          preferencias: Json
          sensiveis: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          conquistas?: Json
          generated_at?: string
          insights_version?: string | null
          intro?: string | null
          o_que_te_move?: Json
          padroes?: Json
          pessoas?: Json
          preferencias?: Json
          sensiveis?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          conquistas?: Json
          generated_at?: string
          insights_version?: string | null
          intro?: string | null
          o_que_te_move?: Json
          padroes?: Json
          pessoas?: Json
          preferencias?: Json
          sensiveis?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
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
      weekly_questions: {
        Row: {
          created_at: string
          delivered_at: string | null
          id: string
          question_date: string
          question_text: string
          responded_at: string | null
          response_text: string | null
          sent_at: string | null
          trigger_message_sid: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          question_date: string
          question_text: string
          responded_at?: string | null
          response_text?: string | null
          sent_at?: string | null
          trigger_message_sid?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          question_date?: string
          question_text?: string
          responded_at?: string | null
          response_text?: string | null
          sent_at?: string | null
          trigger_message_sid?: string | null
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          current_users: number
          id: string
          last_disconnected_at: string | null
          last_health_check: string | null
          max_users: number
          name: string
          phone_number: string | null
          status: string
          zapi_client_token: string
          zapi_instance_id: string
          zapi_token: string
        }
        Insert: {
          created_at?: string
          current_users?: number
          id?: string
          last_disconnected_at?: string | null
          last_health_check?: string | null
          max_users?: number
          name: string
          phone_number?: string | null
          status?: string
          zapi_client_token: string
          zapi_instance_id: string
          zapi_token: string
        }
        Update: {
          created_at?: string
          current_users?: number
          id?: string
          last_disconnected_at?: string | null
          last_health_check?: string | null
          max_users?: number
          name?: string
          phone_number?: string | null
          status?: string
          zapi_client_token?: string
          zapi_instance_id?: string
          zapi_token?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_active: boolean
          language_code: string
          meta_category: string
          meta_language_code: string
          meta_template_name: string | null
          meta_variable_count: number
          meta_variable_names: string[] | null
          prefix: string
          template_name: string
          twilio_content_sid: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          language_code?: string
          meta_category?: string
          meta_language_code?: string
          meta_template_name?: string | null
          meta_variable_count?: number
          meta_variable_names?: string[] | null
          prefix: string
          template_name: string
          twilio_content_sid?: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          language_code?: string
          meta_category?: string
          meta_language_code?: string
          meta_template_name?: string | null
          meta_variable_count?: number
          meta_variable_names?: string[] | null
          prefix?: string
          template_name?: string
          twilio_content_sid?: string
        }
        Relationships: []
      }
      woovi_charges: {
        Row: {
          access_activated_at: string | null
          cobr_id: string | null
          created_at: string
          cycle_index: number
          due_date: string | null
          id: string
          installment_id: string | null
          kind: string | null
          paid_at: string | null
          payer_bank: string | null
          raw_payload: Json | null
          status: string | null
          subscription_id: string
          updated_at: string
          user_id: string | null
          value_cents: number
        }
        Insert: {
          access_activated_at?: string | null
          cobr_id?: string | null
          created_at?: string
          cycle_index?: number
          due_date?: string | null
          id?: string
          installment_id?: string | null
          kind?: string | null
          paid_at?: string | null
          payer_bank?: string | null
          raw_payload?: Json | null
          status?: string | null
          subscription_id: string
          updated_at?: string
          user_id?: string | null
          value_cents: number
        }
        Update: {
          access_activated_at?: string | null
          cobr_id?: string | null
          created_at?: string
          cycle_index?: number
          due_date?: string | null
          id?: string
          installment_id?: string | null
          kind?: string | null
          paid_at?: string | null
          payer_bank?: string | null
          raw_payload?: Json | null
          status?: string | null
          subscription_id?: string
          updated_at?: string
          user_id?: string | null
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "woovi_charges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      woovi_subscriptions: {
        Row: {
          access_granted_at: string | null
          authorization_url: string | null
          billing_period: string
          correlation_id: string | null
          created_at: string
          creation_mode: string
          creation_status: string
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          entry_charge_correlation_id: string | null
          entry_followup_sent_at: string | null
          entry_paid_at: string | null
          fbc: string | null
          fbp: string | null
          frequency: string
          ga_client_id: string | null
          global_id: string | null
          id: string
          is_trial: boolean
          last_error: string | null
          mandate_approved_at: string | null
          mandate_followup_sent_at: string | null
          mandate_followup2_sent_at: string | null
          next_charge_date: string | null
          payer_bank: string | null
          pix_status: string | null
          plan: string
          qr_encoded_image: string | null
          qr_expires_at: string | null
          qr_payload: string | null
          raw_payload: Json | null
          reauth_notified_at: string | null
          recurrency_id: string | null
          replaced_by_subscription_id: string | null
          request_key: string | null
          start_date: string | null
          status: string
          subscription_id: string | null
          trial_value_cents: number | null
          updated_at: string
          user_id: string | null
          value_cents: number
        }
        Insert: {
          access_granted_at?: string | null
          authorization_url?: string | null
          billing_period: string
          correlation_id?: string | null
          created_at?: string
          creation_mode?: string
          creation_status?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          entry_charge_correlation_id?: string | null
          entry_followup_sent_at?: string | null
          entry_paid_at?: string | null
          fbc?: string | null
          fbp?: string | null
          frequency: string
          ga_client_id?: string | null
          global_id?: string | null
          id?: string
          is_trial?: boolean
          last_error?: string | null
          mandate_approved_at?: string | null
          mandate_followup_sent_at?: string | null
          mandate_followup2_sent_at?: string | null
          next_charge_date?: string | null
          payer_bank?: string | null
          pix_status?: string | null
          plan: string
          qr_encoded_image?: string | null
          qr_expires_at?: string | null
          qr_payload?: string | null
          raw_payload?: Json | null
          reauth_notified_at?: string | null
          recurrency_id?: string | null
          replaced_by_subscription_id?: string | null
          request_key?: string | null
          start_date?: string | null
          status?: string
          subscription_id?: string | null
          trial_value_cents?: number | null
          updated_at?: string
          user_id?: string | null
          value_cents: number
        }
        Update: {
          access_granted_at?: string | null
          authorization_url?: string | null
          billing_period?: string
          correlation_id?: string | null
          created_at?: string
          creation_mode?: string
          creation_status?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          entry_charge_correlation_id?: string | null
          entry_followup_sent_at?: string | null
          entry_paid_at?: string | null
          fbc?: string | null
          fbp?: string | null
          frequency?: string
          ga_client_id?: string | null
          global_id?: string | null
          id?: string
          is_trial?: boolean
          last_error?: string | null
          mandate_approved_at?: string | null
          mandate_followup_sent_at?: string | null
          mandate_followup2_sent_at?: string | null
          next_charge_date?: string | null
          payer_bank?: string | null
          pix_status?: string | null
          plan?: string
          qr_encoded_image?: string | null
          qr_expires_at?: string | null
          qr_payload?: string | null
          raw_payload?: Json | null
          reauth_notified_at?: string | null
          recurrency_id?: string | null
          replaced_by_subscription_id?: string | null
          request_key?: string | null
          start_date?: string | null
          status?: string
          subscription_id?: string | null
          trial_value_cents?: number | null
          updated_at?: string
          user_id?: string | null
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "woovi_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      woovi_webhook_events: {
        Row: {
          attempts: number
          created_at: string
          event_key: string
          id: string
          kind: string | null
          last_error: string | null
          payload: Json | null
          processed_at: string | null
          processing_started_at: string | null
          processing_status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_key: string
          id?: string
          kind?: string | null
          last_error?: string | null
          payload?: Json | null
          processed_at?: string | null
          processing_started_at?: string | null
          processing_status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_key?: string
          id?: string
          kind?: string | null
          last_error?: string | null
          payload?: Json | null
          processed_at?: string | null
          processing_started_at?: string | null
          processing_status?: string
          updated_at?: string
        }
        Relationships: []
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
      allocate_whatsapp_instance: { Args: never; Returns: string }
      claim_pending_tasks: {
        Args: { max_tasks?: number }
        Returns: {
          created_at: string
          execute_at: string
          executed_at: string | null
          id: string
          payload: Json
          status: string
          task_type: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "scheduled_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      count_recent_tickets: {
        Args: { _days?: number; _email: string }
        Returns: number
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_admin_metrics_snapshot_secret: { Args: never; Returns: string }
      get_customer_ticket_history: {
        Args: { _days?: number; _email: string; _limit?: number }
        Returns: {
          category: string
          created_at: string
          id: string
          severity: string
          status: string
          subject: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_kb_usage: { Args: { kb_ids: string[] }; Returns: undefined }
      increment_recovery_kb_usage: {
        Args: { _ids: string[] }
        Returns: undefined
      }
      match_support_kb: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          answer: string
          category: string
          id: string
          keywords: string[]
          question: string
          similarity: number
          title: string
        }[]
      }
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
      record_kb_feedback: {
        Args: { feedback: string; kb_ids: string[] }
        Returns: undefined
      }
      record_kb_gap: {
        Args: {
          _best_score: number
          _question: string
          _subject: string
          _ticket_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
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
