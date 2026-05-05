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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      accountant_shares: {
        Row: {
          access_count: number
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          label: string
          last_accessed_at: string | null
          share_expenses: boolean
          share_mileage: boolean
          share_t2125: boolean
          share_transactions: boolean
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_count?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          last_accessed_at?: string | null
          share_expenses?: boolean
          share_mileage?: boolean
          share_t2125?: boolean
          share_transactions?: boolean
          token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_count?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          last_accessed_at?: string | null
          share_expenses?: boolean
          share_mileage?: boolean
          share_t2125?: boolean
          share_transactions?: boolean
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_profiles: {
        Row: {
          agent_split_pct: number
          color_index: number
          created_at: string
          id: string
          is_active: boolean
          monthly_desk_fee: number
          name: string
          notes: string
          role: string
          target_gci: number
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_split_pct?: number
          color_index?: number
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_desk_fee?: number
          name?: string
          notes?: string
          role?: string
          target_gci?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_split_pct?: number
          color_index?: number
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_desk_fee?: number
          name?: string
          notes?: string
          role?: string
          target_gci?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_knowledge_audit_log: {
        Row: {
          audit_date: string
          classifier_coverage: number
          classifier_gaps: Json | null
          created_at: string
          diagnostic_coverage: number
          id: string
          resolution_rate: number
          topic_quality: Json | null
          total_interactions: number
          trending_topics: Json | null
          unresolved_previews: Json | null
        }
        Insert: {
          audit_date: string
          classifier_coverage?: number
          classifier_gaps?: Json | null
          created_at?: string
          diagnostic_coverage?: number
          id?: string
          resolution_rate?: number
          topic_quality?: Json | null
          total_interactions?: number
          trending_topics?: Json | null
          unresolved_previews?: Json | null
        }
        Update: {
          audit_date?: string
          classifier_coverage?: number
          classifier_gaps?: Json | null
          created_at?: string
          diagnostic_coverage?: number
          id?: string
          resolution_rate?: number
          topic_quality?: Json | null
          total_interactions?: number
          trending_topics?: Json | null
          unresolved_previews?: Json | null
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          created_at: string
          currency: string | null
          id: string
          notes: string | null
          province: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          province?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          province?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          all_day: boolean
          created_at: string
          description: string | null
          end_at: string
          google_event_id: string | null
          google_updated: string | null
          id: string
          location: string | null
          outlook_event_id: string | null
          source: string
          source_id: string | null
          source_type: string | null
          start_at: string
          sync_status: string
          synced_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          description?: string | null
          end_at: string
          google_event_id?: string | null
          google_updated?: string | null
          id?: string
          location?: string | null
          outlook_event_id?: string | null
          source: string
          source_id?: string | null
          source_type?: string | null
          start_at: string
          sync_status?: string
          synced_at?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          description?: string | null
          end_at?: string
          google_event_id?: string | null
          google_updated?: string | null
          id?: string
          location?: string | null
          outlook_event_id?: string | null
          source?: string
          source_id?: string | null
          source_type?: string | null
          start_at?: string
          sync_status?: string
          synced_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_analytics: {
        Row: {
          classifier_score: number
          created_at: string
          current_page: string | null
          feedback: string | null
          follow_up_count: number
          had_diagnostics: boolean
          had_playbook: boolean
          id: string
          message_preview: string
          primary_topic: string
          secondary_topic: string | null
          session_message_count: number
          user_id: string
          was_escalation: boolean | null
        }
        Insert: {
          classifier_score?: number
          created_at?: string
          current_page?: string | null
          feedback?: string | null
          follow_up_count?: number
          had_diagnostics?: boolean
          had_playbook?: boolean
          id?: string
          message_preview: string
          primary_topic?: string
          secondary_topic?: string | null
          session_message_count?: number
          user_id: string
          was_escalation?: boolean | null
        }
        Update: {
          classifier_score?: number
          created_at?: string
          current_page?: string | null
          feedback?: string | null
          follow_up_count?: number
          had_diagnostics?: boolean
          had_playbook?: boolean
          id?: string
          message_preview?: string
          primary_topic?: string
          secondary_topic?: string | null
          session_message_count?: number
          user_id?: string
          was_escalation?: boolean | null
        }
        Relationships: []
      }
      client_memory_profiles: {
        Row: {
          client_id: string
          created_at: string
          id: string
          last_computed_at: string | null
          memory_summary: string | null
          stale: boolean
          structured_facts: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          last_computed_at?: string | null
          memory_summary?: string | null
          stale?: boolean
          structured_facts?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          last_computed_at?: string | null
          memory_summary?: string | null
          stale?: boolean
          structured_facts?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_memory_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          client_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_records: {
        Row: {
          address: string | null
          bathrooms: number | null
          bedrooms: number | null
          client_id: string | null
          close_date: string | null
          condition_date: string | null
          condition_status: string | null
          created_at: string
          edited_at: string | null
          garage: boolean | null
          gci: number | null
          id: string
          import_external_id: string | null
          listing_url: string | null
          lot_acres: number | null
          name: string
          notes: string | null
          property_use: string | null
          side: string | null
          source: string | null
          square_feet: number | null
          updated_at: string
          user_id: string
          waterfront: boolean | null
          year: number | null
        }
        Insert: {
          address?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          client_id?: string | null
          close_date?: string | null
          condition_date?: string | null
          condition_status?: string | null
          created_at?: string
          edited_at?: string | null
          garage?: boolean | null
          gci?: number | null
          id?: string
          import_external_id?: string | null
          listing_url?: string | null
          lot_acres?: number | null
          name: string
          notes?: string | null
          property_use?: string | null
          side?: string | null
          source?: string | null
          square_feet?: number | null
          updated_at?: string
          user_id: string
          waterfront?: boolean | null
          year?: number | null
        }
        Update: {
          address?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          client_id?: string | null
          close_date?: string | null
          condition_date?: string | null
          condition_status?: string | null
          created_at?: string
          edited_at?: string | null
          garage?: boolean | null
          gci?: number | null
          id?: string
          import_external_id?: string | null
          listing_url?: string | null
          lot_acres?: number | null
          name?: string
          notes?: string | null
          property_use?: string | null
          side?: string | null
          source?: string | null
          square_feet?: number | null
          updated_at?: string
          user_id?: string
          waterfront?: boolean | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_relationships: {
        Row: {
          client_id_a: string
          client_id_b: string
          created_at: string
          id: string
          relationship_type: string
          user_id: string
        }
        Insert: {
          client_id_a: string
          client_id_b: string
          created_at?: string
          id?: string
          relationship_type?: string
          user_id: string
        }
        Update: {
          client_id_a?: string
          client_id_b?: string
          created_at?: string
          id?: string
          relationship_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_relationships_client_id_a_fkey"
            columns: ["client_id_a"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_relationships_client_id_b_fkey"
            columns: ["client_id_b"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          birthdate: string | null
          buyer_financing_type: string | null
          buyer_pre_approval_amount: number | null
          buyer_pre_approved: boolean | null
          buyer_target_area: string | null
          buyer_target_close_date: string | null
          city: string | null
          communication_tone: string
          country: string
          created_at: string
          email: string | null
          engagement_score: number | null
          engagement_updated_at: string | null
          first_contacted_at: string | null
          first_name: string | null
          id: string
          imported_at: string | null
          last_contact_at: string | null
          last_name: string | null
          lead_source: string | null
          name: string
          name_search: string
          notes: string | null
          phone: string | null
          phone_type: string
          postal_code: string | null
          preferred_contact: string
          property_interest: number | null
          property_interest_type: string
          province_region: string | null
          scheduled_for: string | null
          scheduled_phrase: string | null
          secondary_email: string | null
          secondary_phone: string | null
          secondary_phone_type: string
          status: string
          street_address: string | null
          tags: string[]
          timeframe: string | null
          unit_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          birthdate?: string | null
          buyer_financing_type?: string | null
          buyer_pre_approval_amount?: number | null
          buyer_pre_approved?: boolean | null
          buyer_target_area?: string | null
          buyer_target_close_date?: string | null
          city?: string | null
          communication_tone?: string
          country?: string
          created_at?: string
          email?: string | null
          engagement_score?: number | null
          engagement_updated_at?: string | null
          first_contacted_at?: string | null
          first_name?: string | null
          id?: string
          imported_at?: string | null
          last_contact_at?: string | null
          last_name?: string | null
          lead_source?: string | null
          name: string
          name_search: string
          notes?: string | null
          phone?: string | null
          phone_type?: string
          postal_code?: string | null
          preferred_contact?: string
          property_interest?: number | null
          property_interest_type?: string
          province_region?: string | null
          scheduled_for?: string | null
          scheduled_phrase?: string | null
          secondary_email?: string | null
          secondary_phone?: string | null
          secondary_phone_type?: string
          status?: string
          street_address?: string | null
          tags?: string[]
          timeframe?: string | null
          unit_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          birthdate?: string | null
          buyer_financing_type?: string | null
          buyer_pre_approval_amount?: number | null
          buyer_pre_approved?: boolean | null
          buyer_target_area?: string | null
          buyer_target_close_date?: string | null
          city?: string | null
          communication_tone?: string
          country?: string
          created_at?: string
          email?: string | null
          engagement_score?: number | null
          engagement_updated_at?: string | null
          first_contacted_at?: string | null
          first_name?: string | null
          id?: string
          imported_at?: string | null
          last_contact_at?: string | null
          last_name?: string | null
          lead_source?: string | null
          name?: string
          name_search?: string
          notes?: string | null
          phone?: string | null
          phone_type?: string
          postal_code?: string | null
          preferred_contact?: string
          property_interest?: number | null
          property_interest_type?: string
          province_region?: string | null
          scheduled_for?: string | null
          scheduled_phrase?: string | null
          secondary_email?: string | null
          secondary_phone?: string | null
          secondary_phone_type?: string
          status?: string
          street_address?: string | null
          tags?: string[]
          timeframe?: string | null
          unit_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          client_id: string
          consent_type: string
          created_at: string
          expires_at: string | null
          granted_at: string
          id: string
          notes: string | null
          source: string | null
          updated_at: string
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          client_id: string
          consent_type: string
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          notes?: string | null
          source?: string | null
          updated_at?: string
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          client_id?: string
          consent_type?: string
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          notes?: string | null
          source?: string | null
          updated_at?: string
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_activities: {
        Row: {
          activity_date: string
          client_id: string
          created_at: string
          description: string
          id: string
          type: string
          user_id: string
        }
        Insert: {
          activity_date?: string
          client_id: string
          created_at?: string
          description?: string
          id?: string
          type?: string
          user_id: string
        }
        Update: {
          activity_date?: string
          client_id?: string
          created_at?: string
          description?: string
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tasks: {
        Row: {
          client_id: string | null
          completed_at: string | null
          created_at: string
          due_date: string
          id: string
          notes: string | null
          priority: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          priority?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          priority?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      corp_chart_of_accounts: {
        Row: {
          account_code: string
          created_at: string
          name: string
          notes: string | null
          type: string
        }
        Insert: {
          account_code: string
          created_at?: string
          name: string
          notes?: string | null
          type: string
        }
        Update: {
          account_code?: string
          created_at?: string
          name?: string
          notes?: string | null
          type?: string
        }
        Relationships: []
      }
      corp_transactions: {
        Row: {
          account_code: string | null
          account_type: string | null
          amount_pretax: number
          amount_total: number
          corp_pct: number
          created_at: string
          currency: string
          date: string
          description: string | null
          fx_rate: number | null
          gst_hst: number
          id: string
          incurred_date: string | null
          ingested_at: string
          ingested_by_user_id: string | null
          needs_review: boolean
          notes: string | null
          parent_transaction_id: string | null
          posted_at: string | null
          pre_incorp_flag: boolean
          receipt_storage_path: string | null
          review_reason: string | null
          source_channel: string
          source_ref: string | null
          sred_category: string | null
          sred_eligible: boolean
          updated_at: string
          user_id: string
          vendor_id: string | null
          vendor_name_raw: string | null
        }
        Insert: {
          account_code?: string | null
          account_type?: string | null
          amount_pretax: number
          amount_total: number
          corp_pct?: number
          created_at?: string
          currency?: string
          date: string
          description?: string | null
          fx_rate?: number | null
          gst_hst?: number
          id?: string
          incurred_date?: string | null
          ingested_at?: string
          ingested_by_user_id?: string | null
          needs_review?: boolean
          notes?: string | null
          parent_transaction_id?: string | null
          posted_at?: string | null
          pre_incorp_flag?: boolean
          receipt_storage_path?: string | null
          review_reason?: string | null
          source_channel: string
          source_ref?: string | null
          sred_category?: string | null
          sred_eligible?: boolean
          updated_at?: string
          user_id: string
          vendor_id?: string | null
          vendor_name_raw?: string | null
        }
        Update: {
          account_code?: string | null
          account_type?: string | null
          amount_pretax?: number
          amount_total?: number
          corp_pct?: number
          created_at?: string
          currency?: string
          date?: string
          description?: string | null
          fx_rate?: number | null
          gst_hst?: number
          id?: string
          incurred_date?: string | null
          ingested_at?: string
          ingested_by_user_id?: string | null
          needs_review?: boolean
          notes?: string | null
          parent_transaction_id?: string | null
          posted_at?: string | null
          pre_incorp_flag?: boolean
          receipt_storage_path?: string | null
          review_reason?: string | null
          source_channel?: string
          source_ref?: string | null
          sred_category?: string | null
          sred_eligible?: boolean
          updated_at?: string
          user_id?: string
          vendor_id?: string | null
          vendor_name_raw?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corp_transactions_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "corp_chart_of_accounts"
            referencedColumns: ["account_code"]
          },
          {
            foreignKeyName: "corp_transactions_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "corp_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corp_transactions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "corp_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      corp_vendor_allocations: {
        Row: {
          corp_pct: number
          created_at: string
          effective_from: string | null
          id: string
          personal_pct: number
          rationale_text: string | null
          set_by: string | null
          updated_at: string
          user_id: string
          vendor_id: string
        }
        Insert: {
          corp_pct: number
          created_at?: string
          effective_from?: string | null
          id?: string
          personal_pct: number
          rationale_text?: string | null
          set_by?: string | null
          updated_at?: string
          user_id: string
          vendor_id: string
        }
        Update: {
          corp_pct?: number
          created_at?: string
          effective_from?: string | null
          id?: string
          personal_pct?: number
          rationale_text?: string | null
          set_by?: string | null
          updated_at?: string
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corp_vendor_allocations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "corp_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      corp_vendors: {
        Row: {
          corp_pct: number
          created_at: string
          default_account_code: string | null
          id: string
          name: string
          notes: string | null
          regex_pattern: string
          sred_category: string | null
          sred_eligible: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          corp_pct?: number
          created_at?: string
          default_account_code?: string | null
          id?: string
          name: string
          notes?: string | null
          regex_pattern: string
          sred_category?: string | null
          sred_eligible?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          corp_pct?: number
          created_at?: string
          default_account_code?: string | null
          id?: string
          name?: string
          notes?: string | null
          regex_pattern?: string
          sred_category?: string | null
          sred_eligible?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corp_vendors_default_account_code_fkey"
            columns: ["default_account_code"]
            isOneToOne: false
            referencedRelation: "corp_chart_of_accounts"
            referencedColumns: ["account_code"]
          },
        ]
      }
      drive_documents: {
        Row: {
          created_at: string
          extracted_data: Json | null
          google_file_id: string
          id: string
          indexed_at: string | null
          last_modified: string | null
          mime_type: string
          name: string
          size_bytes: number | null
          summary: string | null
          tags: string[]
          updated_at: string
          user_id: string
          web_view_link: string | null
        }
        Insert: {
          created_at?: string
          extracted_data?: Json | null
          google_file_id: string
          id?: string
          indexed_at?: string | null
          last_modified?: string | null
          mime_type: string
          name: string
          size_bytes?: number | null
          summary?: string | null
          tags?: string[]
          updated_at?: string
          user_id: string
          web_view_link?: string | null
        }
        Update: {
          created_at?: string
          extracted_data?: Json | null
          google_file_id?: string
          id?: string
          indexed_at?: string | null
          last_modified?: string | null
          mime_type?: string
          name?: string
          size_bytes?: number | null
          summary?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string
          web_view_link?: string | null
        }
        Relationships: []
      }
      email_connections: {
        Row: {
          access_token_enc: string | null
          calendar_sync_enabled: boolean
          calendar_sync_token: string | null
          connected_at: string
          connection_name: string | null
          display_name: string | null
          email_address: string
          expires_at: string | null
          id: string
          last_calendar_sync: string | null
          provider: string
          refresh_token_enc: string | null
          smtp_host: string | null
          smtp_password_enc: string | null
          smtp_port: number | null
          smtp_username: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          calendar_sync_enabled?: boolean
          calendar_sync_token?: string | null
          connected_at?: string
          connection_name?: string | null
          display_name?: string | null
          email_address: string
          expires_at?: string | null
          id?: string
          last_calendar_sync?: string | null
          provider: string
          refresh_token_enc?: string | null
          smtp_host?: string | null
          smtp_password_enc?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          calendar_sync_enabled?: boolean
          calendar_sync_token?: string | null
          connected_at?: string
          connection_name?: string | null
          display_name?: string | null
          email_address?: string
          expires_at?: string | null
          id?: string
          last_calendar_sync?: string | null
          provider?: string
          refresh_token_enc?: string | null
          smtp_host?: string | null
          smtp_password_enc?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_signups: {
        Row: {
          brokerage: string | null
          created_at: string
          email: string
          id: string
          name: string | null
          source: string
        }
        Insert: {
          brokerage?: string | null
          created_at?: string
          email: string
          id?: string
          name?: string | null
          source?: string
        }
        Update: {
          brokerage?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          source?: string
        }
        Relationships: []
      }
      email_warmup_status: {
        Row: {
          bounce_count: number
          complaint_count: number
          daily_limit: number
          daily_sends_today: number
          id: string
          last_send_at: string | null
          pause_reason: string | null
          paused: boolean
          provider: string
          total_sends: number
          updated_at: string
          user_id: string
          warmup_start_date: string
        }
        Insert: {
          bounce_count?: number
          complaint_count?: number
          daily_limit?: number
          daily_sends_today?: number
          id?: string
          last_send_at?: string | null
          pause_reason?: string | null
          paused?: boolean
          provider?: string
          total_sends?: number
          updated_at?: string
          user_id: string
          warmup_start_date?: string
        }
        Update: {
          bounce_count?: number
          complaint_count?: number
          daily_limit?: number
          daily_sends_today?: number
          id?: string
          last_send_at?: string | null
          pause_reason?: string | null
          paused?: boolean
          provider?: string
          total_sends?: number
          updated_at?: string
          user_id?: string
          warmup_start_date?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          key: string
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          sort_order?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expense_items: {
        Row: {
          category_id: string
          created_at: string
          id: string
          key: string
          monthly_recurring: number
          sort_order: number
          title: string
          updated_at: string
          user_id: string
          ytd_amount: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          key: string
          monthly_recurring?: number
          sort_order?: number
          title: string
          updated_at?: string
          user_id: string
          ytd_amount?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          key?: string
          monthly_recurring?: number
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
          ytd_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          name: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      flight_plan_steps: {
        Row: {
          action_type: string
          created_at: string
          delay_days: number
          flight_plan_id: string
          id: string
          step_order: number
          template: string | null
        }
        Insert: {
          action_type?: string
          created_at?: string
          delay_days?: number
          flight_plan_id: string
          id?: string
          step_order?: number
          template?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          delay_days?: number
          flight_plan_id?: string
          id?: string
          step_order?: number
          template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_plan_steps_flight_plan_id_fkey"
            columns: ["flight_plan_id"]
            isOneToOne: false
            referencedRelation: "flight_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          system_key: string | null
          trigger_status: string | null
          trigger_tag: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          system_key?: string | null
          trigger_status?: string | null
          trigger_tag?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          system_key?: string | null
          trigger_status?: string | null
          trigger_tag?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_connections: {
        Row: {
          access_token_enc: string
          calendar_sync_enabled: boolean
          calendar_sync_token: string | null
          connected_at: string
          display_name: string | null
          drive_read_enabled: boolean
          email_address: string
          expires_at: string
          gmail_send_enabled: boolean
          granted_scopes: string[]
          id: string
          last_calendar_sync: string | null
          refresh_token_enc: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc: string
          calendar_sync_enabled?: boolean
          calendar_sync_token?: string | null
          connected_at?: string
          display_name?: string | null
          drive_read_enabled?: boolean
          email_address: string
          expires_at: string
          gmail_send_enabled?: boolean
          granted_scopes?: string[]
          id?: string
          last_calendar_sync?: string | null
          refresh_token_enc: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string
          calendar_sync_enabled?: boolean
          calendar_sync_token?: string | null
          connected_at?: string
          display_name?: string | null
          drive_read_enabled?: boolean
          email_address?: string
          expires_at?: string
          gmail_send_enabled?: boolean
          granted_scopes?: string[]
          id?: string
          last_calendar_sync?: string | null
          refresh_token_enc?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      history_items: {
        Row: {
          annual_expenses: number
          annual_gci: number
          annual_mileage_deduct: number
          annual_mileage_km: number
          annual_tx: number
          created_at: string
          id: string
          is_locked: boolean
          quarter_gci: Json
          quarter_tx: Json
          split_pct: number | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          annual_expenses?: number
          annual_gci?: number
          annual_mileage_deduct?: number
          annual_mileage_km?: number
          annual_tx?: number
          created_at?: string
          id?: string
          is_locked?: boolean
          quarter_gci?: Json
          quarter_tx?: Json
          split_pct?: number | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          annual_expenses?: number
          annual_gci?: number
          annual_mileage_deduct?: number
          annual_mileage_km?: number
          annual_tx?: number
          created_at?: string
          id?: string
          is_locked?: boolean
          quarter_gci?: Json
          quarter_tx?: Json
          split_pct?: number | null
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      import_telemetry: {
        Row: {
          brokerage_confirmation_checked: boolean
          brokerage_confirmation_shown: boolean
          created_at: string
          deal_count: number | null
          document_subtype: string | null
          edited_field_counts: Json | null
          edited_field_names: string[] | null
          error_category: string | null
          event_type: string
          extraction_quality: string | null
          file_type: string | null
          id: string
          import_source: string | null
          is_replace: boolean
          issue_count_total: number | null
          low_confidence_gci_count: number | null
          rows_kept: number | null
          rows_total: number | null
          time_on_review_ms: number | null
          total_fields_edited: number
          truncation_occurred: boolean
          user_id: string
        }
        Insert: {
          brokerage_confirmation_checked?: boolean
          brokerage_confirmation_shown?: boolean
          created_at?: string
          deal_count?: number | null
          document_subtype?: string | null
          edited_field_counts?: Json | null
          edited_field_names?: string[] | null
          error_category?: string | null
          event_type?: string
          extraction_quality?: string | null
          file_type?: string | null
          id?: string
          import_source?: string | null
          is_replace?: boolean
          issue_count_total?: number | null
          low_confidence_gci_count?: number | null
          rows_kept?: number | null
          rows_total?: number | null
          time_on_review_ms?: number | null
          total_fields_edited?: number
          truncation_occurred?: boolean
          user_id: string
        }
        Update: {
          brokerage_confirmation_checked?: boolean
          brokerage_confirmation_shown?: boolean
          created_at?: string
          deal_count?: number | null
          document_subtype?: string | null
          edited_field_counts?: Json | null
          edited_field_names?: string[] | null
          error_category?: string | null
          event_type?: string
          extraction_quality?: string | null
          file_type?: string | null
          id?: string
          import_source?: string | null
          is_replace?: boolean
          issue_count_total?: number | null
          low_confidence_gci_count?: number | null
          rows_kept?: number | null
          rows_total?: number | null
          time_on_review_ms?: number | null
          total_fields_edited?: number
          truncation_occurred?: boolean
          user_id?: string
        }
        Relationships: []
      }
      inbound_emails: {
        Row: {
          attachment_count: number
          attachment_summary: Json
          cc_addresses: string[]
          client_id: string | null
          created_at: string
          email_references: string[] | null
          from_address: string
          from_name: string | null
          has_attachments: boolean
          id: string
          in_reply_to: string | null
          matched_outreach_id: string | null
          message_id: string | null
          preview: string | null
          raw_webhook: Json
          received_at: string
          resend_email_id: string
          status: string
          subject: string | null
          to_address: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_count?: number
          attachment_summary?: Json
          cc_addresses?: string[]
          client_id?: string | null
          created_at?: string
          email_references?: string[] | null
          from_address: string
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          in_reply_to?: string | null
          matched_outreach_id?: string | null
          message_id?: string | null
          preview?: string | null
          raw_webhook?: Json
          received_at: string
          resend_email_id: string
          status?: string
          subject?: string | null
          to_address: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_count?: number
          attachment_summary?: Json
          cc_addresses?: string[]
          client_id?: string | null
          created_at?: string
          email_references?: string[] | null
          from_address?: string
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          in_reply_to?: string | null
          matched_outreach_id?: string | null
          message_id?: string | null
          preview?: string | null
          raw_webhook?: Json
          received_at?: string
          resend_email_id?: string
          status?: string
          subject?: string | null
          to_address?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_emails_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_emails_matched_outreach_id_fkey"
            columns: ["matched_outreach_id"]
            isOneToOne: false
            referencedRelation: "outreach_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_appointments: {
        Row: {
          actual_list_price: number | null
          actual_sale_price: number | null
          appointment_date: string
          client_id: string | null
          created_at: string
          estimated_commission_pct: number | null
          estimated_list_price: number | null
          expected_close_date: string | null
          id: string
          listing_agreement_date: string | null
          notes: string | null
          property_address: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_list_price?: number | null
          actual_sale_price?: number | null
          appointment_date: string
          client_id?: string | null
          created_at?: string
          estimated_commission_pct?: number | null
          estimated_list_price?: number | null
          expected_close_date?: string | null
          id?: string
          listing_agreement_date?: string | null
          notes?: string | null
          property_address?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_list_price?: number | null
          actual_sale_price?: number | null
          appointment_date?: string
          client_id?: string | null
          created_at?: string
          estimated_commission_pct?: number | null
          estimated_list_price?: number | null
          expected_close_date?: string | null
          id?: string
          listing_agreement_date?: string | null
          notes?: string | null
          property_address?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      market_data_points: {
        Row: {
          active_listings: number | null
          avg_price: number | null
          benchmark_price: number | null
          created_at: string
          dom_median: number | null
          geo_board_code: string | null
          geo_name: string
          geo_province_code: string
          geo_type: Database["public"]["Enums"]["market_geography_type"]
          id: string
          mom_price_pct: number | null
          mom_sales_pct: number | null
          months_of_inventory: number | null
          new_listings: number | null
          notes: string | null
          period_end: string | null
          period_label: string
          period_start: string | null
          retrieved_at: string
          sales: number | null
          source_name: string
          source_url: string | null
          user_id: string
          yoy_price_pct: number | null
          yoy_sales_pct: number | null
        }
        Insert: {
          active_listings?: number | null
          avg_price?: number | null
          benchmark_price?: number | null
          created_at?: string
          dom_median?: number | null
          geo_board_code?: string | null
          geo_name?: string
          geo_province_code?: string
          geo_type?: Database["public"]["Enums"]["market_geography_type"]
          id?: string
          mom_price_pct?: number | null
          mom_sales_pct?: number | null
          months_of_inventory?: number | null
          new_listings?: number | null
          notes?: string | null
          period_end?: string | null
          period_label: string
          period_start?: string | null
          retrieved_at?: string
          sales?: number | null
          source_name?: string
          source_url?: string | null
          user_id: string
          yoy_price_pct?: number | null
          yoy_sales_pct?: number | null
        }
        Update: {
          active_listings?: number | null
          avg_price?: number | null
          benchmark_price?: number | null
          created_at?: string
          dom_median?: number | null
          geo_board_code?: string | null
          geo_name?: string
          geo_province_code?: string
          geo_type?: Database["public"]["Enums"]["market_geography_type"]
          id?: string
          mom_price_pct?: number | null
          mom_sales_pct?: number | null
          months_of_inventory?: number | null
          new_listings?: number | null
          notes?: string | null
          period_end?: string | null
          period_label?: string
          period_start?: string | null
          retrieved_at?: string
          sales?: number | null
          source_name?: string
          source_url?: string | null
          user_id?: string
          yoy_price_pct?: number | null
          yoy_sales_pct?: number | null
        }
        Relationships: []
      }
      market_data_snapshots: {
        Row: {
          average_price: number | null
          avg_price_yoy_pct: number | null
          board_name: string
          board_slug: string
          created_at: string
          dollar_volume_yoy_pct: number | null
          historical_comparisons: Json | null
          id: string
          market_condition: string | null
          median_sale_price: number | null
          median_sale_price_yoy: number | null
          new_listings_yoy_pct: number | null
          quarterly_unit_sales: number | null
          quarterly_unit_sales_yoy: number | null
          raw_payload: Json | null
          report_month: string
          sales_to_new_listings_ratio: number | null
          sales_yoy_pct: number | null
          snapshot_date: string
          sub_regions: Json | null
          total_dollar_volume: number | null
          total_new_listings: number | null
          total_sales: number | null
          ytd_avg_price: number | null
          ytd_avg_price_yoy_pct: number | null
          ytd_dollar_volume: number | null
          ytd_sales: number | null
          ytd_sales_yoy_pct: number | null
        }
        Insert: {
          average_price?: number | null
          avg_price_yoy_pct?: number | null
          board_name: string
          board_slug: string
          created_at?: string
          dollar_volume_yoy_pct?: number | null
          historical_comparisons?: Json | null
          id?: string
          market_condition?: string | null
          median_sale_price?: number | null
          median_sale_price_yoy?: number | null
          new_listings_yoy_pct?: number | null
          quarterly_unit_sales?: number | null
          quarterly_unit_sales_yoy?: number | null
          raw_payload?: Json | null
          report_month: string
          sales_to_new_listings_ratio?: number | null
          sales_yoy_pct?: number | null
          snapshot_date?: string
          sub_regions?: Json | null
          total_dollar_volume?: number | null
          total_new_listings?: number | null
          total_sales?: number | null
          ytd_avg_price?: number | null
          ytd_avg_price_yoy_pct?: number | null
          ytd_dollar_volume?: number | null
          ytd_sales?: number | null
          ytd_sales_yoy_pct?: number | null
        }
        Update: {
          average_price?: number | null
          avg_price_yoy_pct?: number | null
          board_name?: string
          board_slug?: string
          created_at?: string
          dollar_volume_yoy_pct?: number | null
          historical_comparisons?: Json | null
          id?: string
          market_condition?: string | null
          median_sale_price?: number | null
          median_sale_price_yoy?: number | null
          new_listings_yoy_pct?: number | null
          quarterly_unit_sales?: number | null
          quarterly_unit_sales_yoy?: number | null
          raw_payload?: Json | null
          report_month?: string
          sales_to_new_listings_ratio?: number | null
          sales_yoy_pct?: number | null
          snapshot_date?: string
          sub_regions?: Json | null
          total_dollar_volume?: number | null
          total_new_listings?: number | null
          total_sales?: number | null
          ytd_avg_price?: number | null
          ytd_avg_price_yoy_pct?: number | null
          ytd_dollar_volume?: number | null
          ytd_sales?: number | null
          ytd_sales_yoy_pct?: number | null
        }
        Relationships: []
      }
      mcp_events: {
        Row: {
          created_at: string
          id: string
          is_error: boolean | null
          latency_ms: number | null
          tool_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_error?: boolean | null
          latency_ms?: number | null
          tool_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_error?: boolean | null
          latency_ms?: number | null
          tool_name?: string
          user_id?: string
        }
        Relationships: []
      }
      mileage_logs: {
        Row: {
          cra_rate_per_km: number
          created_at: string
          deduction: number | null
          description: string
          from_location: string | null
          id: string
          km: number
          notes: string | null
          purpose: string | null
          to_location: string | null
          trip_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cra_rate_per_km?: number
          created_at?: string
          deduction?: number | null
          description?: string
          from_location?: string | null
          id?: string
          km?: number
          notes?: string | null
          purpose?: string | null
          to_location?: string | null
          trip_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cra_rate_per_km?: number
          created_at?: string
          deduction?: number | null
          description?: string
          from_location?: string | null
          id?: string
          km?: number
          notes?: string | null
          purpose?: string | null
          to_location?: string | null
          trip_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      milestones: {
        Row: {
          acknowledged: boolean
          created_at: string
          id: string
          message: string
          title: string
          triggered_at: string
          type: Database["public"]["Enums"]["milestone_type"]
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          created_at?: string
          id?: string
          message?: string
          title: string
          triggered_at?: string
          type: Database["public"]["Enums"]["milestone_type"]
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          created_at?: string
          id?: string
          message?: string
          title?: string
          triggered_at?: string
          type?: Database["public"]["Enums"]["milestone_type"]
          user_id?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          body: string | null
          data: Json | null
          expo_ticket_id: string | null
          id: string
          notification_type: string
          sent_at: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          data?: Json | null
          expo_ticket_id?: string | null
          id?: string
          notification_type: string
          sent_at?: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          data?: Json | null
          expo_ticket_id?: string | null
          id?: string
          notification_type?: string
          sent_at?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          afternoon_recap: boolean
          created_at: string
          deal_milestone: boolean
          follow_up_due: boolean
          hot_lead_alert: boolean
          morning_briefing: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          updated_at: string
          user_id: string
          weekly_digest_enabled: boolean
        }
        Insert: {
          afternoon_recap?: boolean
          created_at?: string
          deal_milestone?: boolean
          follow_up_due?: boolean
          hot_lead_alert?: boolean
          morning_briefing?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          updated_at?: string
          user_id: string
          weekly_digest_enabled?: boolean
        }
        Update: {
          afternoon_recap?: boolean
          created_at?: string
          deal_milestone?: boolean
          follow_up_due?: boolean
          hot_lead_alert?: boolean
          morning_briefing?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          updated_at?: string
          user_id?: string
          weekly_digest_enabled?: boolean
        }
        Relationships: []
      }
      nurture_sequences: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          current_step: number
          id: string
          metadata: Json | null
          next_send_at: string | null
          paused_at: string | null
          sequence_type: string
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          metadata?: Json | null
          next_send_at?: string | null
          paused_at?: string | null
          sequence_type?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          metadata?: Json | null
          next_send_at?: string | null
          paused_at?: string | null
          sequence_type?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nurture_sequences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nurture_sequences_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          consent_granted_at: string | null
          consent_version: number | null
          created_at: string
          data_sharing_tier: Database["public"]["Enums"]["data_sharing_tier"]
          id: string
          joined_at: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          status: Database["public"]["Enums"]["org_member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          consent_granted_at?: string | null
          consent_version?: number | null
          created_at?: string
          data_sharing_tier?: Database["public"]["Enums"]["data_sharing_tier"]
          id?: string
          joined_at?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          status?: Database["public"]["Enums"]["org_member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          consent_granted_at?: string | null
          consent_version?: number | null
          created_at?: string
          data_sharing_tier?: Database["public"]["Enums"]["data_sharing_tier"]
          id?: string
          joined_at?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          status?: Database["public"]["Enums"]["org_member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          anonymize_agents: boolean
          billing_email: string | null
          created_at: string
          id: string
          is_beta: boolean
          logo_url: string | null
          max_seats: number
          name: string
          org_goal_gci: number | null
          owner_id: string | null
          slug: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          type: Database["public"]["Enums"]["org_type"]
          updated_at: string
        }
        Insert: {
          anonymize_agents?: boolean
          billing_email?: string | null
          created_at?: string
          id?: string
          is_beta?: boolean
          logo_url?: string | null
          max_seats?: number
          name: string
          org_goal_gci?: number | null
          owner_id?: string | null
          slug: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          type: Database["public"]["Enums"]["org_type"]
          updated_at?: string
        }
        Update: {
          anonymize_agents?: boolean
          billing_email?: string | null
          created_at?: string
          id?: string
          is_beta?: boolean
          logo_url?: string | null
          max_seats?: number
          name?: string
          org_goal_gci?: number | null
          owner_id?: string | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          type?: Database["public"]["Enums"]["org_type"]
          updated_at?: string
        }
        Relationships: []
      }
      outreach_queue: {
        Row: {
          ai_body: string | null
          ai_subject: string | null
          client_id: string | null
          client_record_id: string | null
          context: Json
          created_at: string
          final_body: string | null
          final_subject: string | null
          id: string
          opportunity_type: string
          sent_at: string | null
          status: string
          trigger_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_body?: string | null
          ai_subject?: string | null
          client_id?: string | null
          client_record_id?: string | null
          context?: Json
          created_at?: string
          final_body?: string | null
          final_subject?: string | null
          id?: string
          opportunity_type: string
          sent_at?: string | null
          status?: string
          trigger_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_body?: string | null
          ai_subject?: string | null
          client_id?: string | null
          client_record_id?: string | null
          context?: Json
          created_at?: string
          final_body?: string | null
          final_subject?: string | null
          id?: string
          opportunity_type?: string
          sent_at?: string | null
          status?: string
          trigger_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_queue_client_record_id_fkey"
            columns: ["client_record_id"]
            isOneToOne: false
            referencedRelation: "client_records"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_deals: {
        Row: {
          address: string
          client_id: string | null
          client_name: string
          created_at: string
          estimated_commission_pct: number
          estimated_price: number
          expected_close_date: string | null
          id: string
          notes: string
          original_estimated_price: number | null
          probability_override: number | null
          side: Database["public"]["Enums"]["transaction_side"]
          stage: Database["public"]["Enums"]["pipeline_stage"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string
          client_id?: string | null
          client_name?: string
          created_at?: string
          estimated_commission_pct?: number
          estimated_price?: number
          expected_close_date?: string | null
          id?: string
          notes?: string
          original_estimated_price?: number | null
          probability_override?: number | null
          side?: Database["public"]["Enums"]["transaction_side"]
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          client_id?: string | null
          client_name?: string
          created_at?: string
          estimated_commission_pct?: number
          estimated_price?: number
          expected_close_date?: string | null
          id?: string
          notes?: string
          original_estimated_price?: number | null
          probability_override?: number | null
          side?: Database["public"]["Enums"]["transaction_side"]
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_items: {
        Row: {
          access_token: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          institution_id: string | null
          institution_name: string | null
          last_synced_at: string | null
          plaid_item_id: string
          sync_cursor: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          last_synced_at?: string | null
          plaid_item_id: string
          sync_cursor?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          last_synced_at?: string | null
          plaid_item_id?: string
          sync_cursor?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plaid_transactions: {
        Row: {
          amount: number
          category_key: string | null
          created_at: string
          description: string
          id: string
          merchant_name: string | null
          plaid_account_id: string | null
          plaid_item_id: string
          plaid_transaction_id: string
          review_status: string
          suggested_category: string | null
          suggestion_confidence: number | null
          transaction_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_key?: string | null
          created_at?: string
          description?: string
          id?: string
          merchant_name?: string | null
          plaid_account_id?: string | null
          plaid_item_id: string
          plaid_transaction_id: string
          review_status?: string
          suggested_category?: string | null
          suggestion_confidence?: number | null
          transaction_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_key?: string | null
          created_at?: string
          description?: string
          id?: string
          merchant_name?: string | null
          plaid_account_id?: string | null
          plaid_item_id?: string
          plaid_transaction_id?: string
          review_status?: string
          suggested_category?: string | null
          suggestion_confidence?: number | null
          transaction_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaid_transactions_plaid_item_id_fkey"
            columns: ["plaid_item_id"]
            isOneToOne: false
            referencedRelation: "plaid_items"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_acceptances: {
        Row: {
          acceptance_context: string
          accepted_at: string
          created_at: string
          id: string
          ip_address: unknown
          policy_type: string
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          acceptance_context: string
          accepted_at?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          policy_type: string
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          acceptance_context?: string
          accepted_at?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          policy_type?: string
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      precomputed_insights: {
        Row: {
          content: Json
          expires_at: string
          generated_at: string
          id: string
          insight_type: string
          user_id: string
        }
        Insert: {
          content?: Json
          expires_at: string
          generated_at?: string
          id?: string
          insight_type: string
          user_id: string
        }
        Update: {
          content?: Json
          expires_at?: string
          generated_at?: string
          id?: string
          insight_type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      property_analyses: {
        Row: {
          ai_analysis: Json
          client_id: string | null
          created_at: string
          id: string
          property_data: Json
          showing_id: string | null
          source_type: string
          source_url: string | null
          user_id: string
        }
        Insert: {
          ai_analysis?: Json
          client_id?: string | null
          created_at?: string
          id?: string
          property_data?: Json
          showing_id?: string | null
          source_type: string
          source_url?: string | null
          user_id: string
        }
        Update: {
          ai_analysis?: Json
          client_id?: string | null
          created_at?: string
          id?: string
          property_data?: Json
          showing_id?: string | null
          source_type?: string
          source_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_analyses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_analyses_showing_id_fkey"
            columns: ["showing_id"]
            isOneToOne: false
            referencedRelation: "property_showings"
            referencedColumns: ["id"]
          },
        ]
      }
      property_showings: {
        Row: {
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          client_id: string
          client_rating: number | null
          created_at: string
          extracted_data: Json
          id: string
          listing_price: number | null
          lot_size: string | null
          mls_number: string | null
          notes: string | null
          postal_code: string | null
          property_address: string
          property_type: string | null
          province_region: string | null
          realtor_ca_url: string | null
          screenshot_url: string | null
          showing_date: string
          square_feet: number | null
          updated_at: string
          user_id: string
          year_built: number | null
        }
        Insert: {
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          client_id: string
          client_rating?: number | null
          created_at?: string
          extracted_data?: Json
          id?: string
          listing_price?: number | null
          lot_size?: string | null
          mls_number?: string | null
          notes?: string | null
          postal_code?: string | null
          property_address: string
          property_type?: string | null
          province_region?: string | null
          realtor_ca_url?: string | null
          screenshot_url?: string | null
          showing_date?: string
          square_feet?: number | null
          updated_at?: string
          user_id: string
          year_built?: number | null
        }
        Update: {
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          client_id?: string
          client_rating?: number | null
          created_at?: string
          extracted_data?: Json
          id?: string
          listing_price?: number | null
          lot_size?: string | null
          mls_number?: string | null
          notes?: string | null
          postal_code?: string | null
          property_address?: string
          property_type?: string | null
          province_region?: string | null
          realtor_ca_url?: string | null
          screenshot_url?: string | null
          showing_date?: string
          square_feet?: number | null
          updated_at?: string
          user_id?: string
          year_built?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_showings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      public_rate_limits: {
        Row: {
          endpoint: string
          key: string
          request_count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          endpoint: string
          key: string
          request_count?: number
          updated_at?: string
          window_start: string
        }
        Update: {
          endpoint?: string
          key?: string
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          expo_push_token: string
          id: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          expo_push_token: string
          id?: string
          platform?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          expo_push_token?: string
          id?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          endpoint: string
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          endpoint: string
          request_count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          endpoint?: string
          request_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      receipt_expenses: {
        Row: {
          category_key: string | null
          created_at: string
          currency: string
          expense_date: string | null
          id: string
          notes: string | null
          ocr_confidence: number | null
          ocr_raw: Json | null
          receipt_path: string | null
          subtotal: number | null
          tax_amount: number | null
          total_amount: number | null
          updated_at: string
          user_id: string
          vendor: string | null
        }
        Insert: {
          category_key?: string | null
          created_at?: string
          currency?: string
          expense_date?: string | null
          id?: string
          notes?: string | null
          ocr_confidence?: number | null
          ocr_raw?: Json | null
          receipt_path?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string
          user_id: string
          vendor?: string | null
        }
        Update: {
          category_key?: string | null
          created_at?: string
          currency?: string
          expense_date?: string | null
          id?: string
          notes?: string | null
          ocr_confidence?: number | null
          ocr_raw?: Json | null
          receipt_path?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string
          vendor?: string | null
        }
        Relationships: []
      }
      receipt_upload_tokens: {
        Row: {
          created_at: string
          error_message: string | null
          expires_at: string
          extraction_result: Json | null
          id: string
          receipt_path: string | null
          status: string
          token: string
          used: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          expires_at?: string
          extraction_result?: Json | null
          id?: string
          receipt_path?: string | null
          status?: string
          token: string
          used?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          expires_at?: string
          extraction_result?: Json | null
          id?: string
          receipt_path?: string | null
          status?: string
          token?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      recruitment_applications: {
        Row: {
          applicant_email: string
          applicant_name: string
          applicant_phone: string | null
          created_at: string
          current_brokerage: string | null
          id: string
          message: string | null
          recruitment_page_id: string
          resume_url: string | null
          status: string
          years_experience: number | null
        }
        Insert: {
          applicant_email: string
          applicant_name: string
          applicant_phone?: string | null
          created_at?: string
          current_brokerage?: string | null
          id?: string
          message?: string | null
          recruitment_page_id: string
          resume_url?: string | null
          status?: string
          years_experience?: number | null
        }
        Update: {
          applicant_email?: string
          applicant_name?: string
          applicant_phone?: string | null
          created_at?: string
          current_brokerage?: string | null
          id?: string
          message?: string | null
          recruitment_page_id?: string
          resume_url?: string | null
          status?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_applications_recruitment_page_id_fkey"
            columns: ["recruitment_page_id"]
            isOneToOne: false
            referencedRelation: "recruitment_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_pages: {
        Row: {
          application_count: number
          application_email: string | null
          created_at: string
          created_by: string
          custom_values: Json | null
          description: string
          headline: string
          id: string
          is_active: boolean
          last_viewed_at: string | null
          org_id: string
          require_resume: boolean | null
          show_team_stats: boolean
          show_testimonials: boolean
          show_value_props: boolean
          team_photo_url: string | null
          token: string
          updated_at: string
          view_count: number
        }
        Insert: {
          application_count?: number
          application_email?: string | null
          created_at?: string
          created_by: string
          custom_values?: Json | null
          description?: string
          headline?: string
          id?: string
          is_active?: boolean
          last_viewed_at?: string | null
          org_id: string
          require_resume?: boolean | null
          show_team_stats?: boolean
          show_testimonials?: boolean
          show_value_props?: boolean
          team_photo_url?: string | null
          token?: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          application_count?: number
          application_email?: string | null
          created_at?: string
          created_by?: string
          custom_values?: Json | null
          description?: string
          headline?: string
          id?: string
          is_active?: boolean
          last_viewed_at?: string | null
          org_id?: string
          require_resume?: boolean | null
          show_team_stats?: boolean
          show_testimonials?: boolean
          show_value_props?: boolean
          team_photo_url?: string | null
          token?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_pages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_pages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_pages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expense_entries: {
        Row: {
          amount: number
          created_at: string
          entry_date: string
          id: string
          receipt_expense_id: string | null
          recurring_expense_id: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          entry_date: string
          id?: string
          receipt_expense_id?: string | null
          recurring_expense_id: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          entry_date?: string
          id?: string
          receipt_expense_id?: string | null
          recurring_expense_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expense_entries_receipt_expense_id_fkey"
            columns: ["receipt_expense_id"]
            isOneToOne: false
            referencedRelation: "receipt_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_entries_recurring_expense_id_fkey"
            columns: ["recurring_expense_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          amount: number
          category_key: string
          created_at: string
          day_of_month: number
          end_date: string | null
          frequency: string
          hst_amount: number | null
          hst_included: boolean
          id: string
          is_active: boolean
          month_of_year: number | null
          name: string
          notes: string | null
          start_date: string
          updated_at: string
          user_id: string
          vehicle_pct_applicable: boolean
        }
        Insert: {
          amount: number
          category_key: string
          created_at?: string
          day_of_month: number
          end_date?: string | null
          frequency?: string
          hst_amount?: number | null
          hst_included?: boolean
          id?: string
          is_active?: boolean
          month_of_year?: number | null
          name: string
          notes?: string | null
          start_date?: string
          updated_at?: string
          user_id: string
          vehicle_pct_applicable?: boolean
        }
        Update: {
          amount?: number
          category_key?: string
          created_at?: string
          day_of_month?: number
          end_date?: string | null
          frequency?: string
          hst_amount?: number | null
          hst_included?: boolean
          id?: string
          is_active?: boolean
          month_of_year?: number | null
          name?: string
          notes?: string | null
          start_date?: string
          updated_at?: string
          user_id?: string
          vehicle_pct_applicable?: boolean
        }
        Relationships: []
      }
      referrals: {
        Row: {
          actual_fee_paid: number | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          direction: string
          estimated_value: number | null
          fee_paid_date: string | null
          id: string
          notes: string | null
          partner_brokerage: string | null
          partner_email: string | null
          partner_name: string
          partner_phone: string | null
          property_address: string | null
          referral_date: string
          referral_fee_pct: number | null
          status: string
          transaction_id: string | null
          transaction_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_fee_paid?: number | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string
          direction: string
          estimated_value?: number | null
          fee_paid_date?: string | null
          id?: string
          notes?: string | null
          partner_brokerage?: string | null
          partner_email?: string | null
          partner_name: string
          partner_phone?: string | null
          property_address?: string | null
          referral_date?: string
          referral_fee_pct?: number | null
          status?: string
          transaction_id?: string | null
          transaction_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_fee_paid?: number | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string
          direction?: string
          estimated_value?: number | null
          fee_paid_date?: string | null
          id?: string
          notes?: string | null
          partner_brokerage?: string | null
          partner_email?: string | null
          partner_name?: string
          partner_phone?: string | null
          property_address?: string | null
          referral_date?: string
          referral_fee_pct?: number | null
          status?: string
          transaction_id?: string | null
          transaction_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_update_locks: {
        Row: {
          acquired_at: string
          expires_at: string
          org_id: string
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          org_id: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_update_locks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_update_locks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_update_locks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json | null
          org_id: string
          target_user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          org_id: string
          target_user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          org_id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          created_at: string
          id: string
          instagram_business_account_id: string | null
          page_access_token: string | null
          page_id: string | null
          platform: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          created_at?: string
          id?: string
          instagram_business_account_id?: string | null
          page_access_token?: string | null
          page_id?: string | null
          platform: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          created_at?: string
          id?: string
          instagram_business_account_id?: string | null
          page_access_token?: string | null
          page_id?: string | null
          platform?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          month: number | null
          platform: string
          published_at: string | null
          status: string
          template_style: string
          title: string | null
          transaction_ids: string[] | null
          updated_at: string
          user_id: string
          year: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          month?: number | null
          platform?: string
          published_at?: string | null
          status?: string
          template_style?: string
          title?: string | null
          transaction_ids?: string[] | null
          updated_at?: string
          user_id: string
          year?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          month?: number | null
          platform?: string
          published_at?: string | null
          status?: string
          template_style?: string
          title?: string | null
          transaction_ids?: string[] | null
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          event_id: string
          processed_at: string
        }
        Insert: {
          event_id: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          processed_at?: string
        }
        Relationships: []
      }
      t2125_cca_assets: {
        Row: {
          acquisition_date: string
          additions_this_year: number
          business_use_pct: number
          cca_claimed_prior: number
          cca_class: number
          class_half_year: boolean
          class_rate: number
          created_at: string
          description: string
          disposals_this_year: number
          id: string
          notes: string | null
          opening_ucc: number
          original_cost: number
          updated_at: string
          user_id: string
        }
        Insert: {
          acquisition_date: string
          additions_this_year?: number
          business_use_pct?: number
          cca_claimed_prior?: number
          cca_class: number
          class_half_year?: boolean
          class_rate: number
          created_at?: string
          description: string
          disposals_this_year?: number
          id?: string
          notes?: string | null
          opening_ucc?: number
          original_cost: number
          updated_at?: string
          user_id: string
        }
        Update: {
          acquisition_date?: string
          additions_this_year?: number
          business_use_pct?: number
          cca_claimed_prior?: number
          cca_class?: number
          class_half_year?: boolean
          class_rate?: number
          created_at?: string
          description?: string
          disposals_this_year?: number
          id?: string
          notes?: string | null
          opening_ucc?: number
          original_cost?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_deals: {
        Row: {
          address: string
          agent_profile_id: string
          client_name: string
          created_at: string
          date: string
          gci: number
          id: string
          side: Database["public"]["Enums"]["transaction_side"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string
          agent_profile_id: string
          client_name?: string
          created_at?: string
          date: string
          gci?: number
          id?: string
          side?: Database["public"]["Enums"]["transaction_side"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          agent_profile_id?: string
          client_name?: string
          created_at?: string
          date?: string
          gci?: number
          id?: string
          side?: Database["public"]["Enums"]["transaction_side"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_deals_agent_profile_id_fkey"
            columns: ["agent_profile_id"]
            isOneToOne: false
            referencedRelation: "agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          approved: boolean | null
          created_at: string | null
          featured: boolean | null
          id: string
          name: string
          quote: string
          rating: number | null
          source: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          approved?: boolean | null
          created_at?: string | null
          featured?: boolean | null
          id?: string
          name: string
          quote: string
          rating?: number | null
          source?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          approved?: boolean | null
          created_at?: string | null
          featured?: boolean | null
          id?: string
          name?: string
          quote?: string
          rating?: number | null
          source?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          address: string
          client_name: string
          commission_pct: number
          created_at: string
          date: string
          date_precision: Database["public"]["Enums"]["tx_date_precision"]
          edited_at: string | null
          gci_override: number | null
          id: string
          import_external_id: string | null
          notes: string
          pipeline_deal_id: string | null
          sale_price: number
          side: Database["public"]["Enums"]["transaction_side"]
          source: Database["public"]["Enums"]["tx_source"]
          status: Database["public"]["Enums"]["transaction_status"]
          team_split_pct: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string
          client_name?: string
          commission_pct?: number
          created_at?: string
          date: string
          date_precision?: Database["public"]["Enums"]["tx_date_precision"]
          edited_at?: string | null
          gci_override?: number | null
          id?: string
          import_external_id?: string | null
          notes?: string
          pipeline_deal_id?: string | null
          sale_price?: number
          side?: Database["public"]["Enums"]["transaction_side"]
          source?: Database["public"]["Enums"]["tx_source"]
          status?: Database["public"]["Enums"]["transaction_status"]
          team_split_pct?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          client_name?: string
          commission_pct?: number
          created_at?: string
          date?: string
          date_precision?: Database["public"]["Enums"]["tx_date_precision"]
          edited_at?: string | null
          gci_override?: number | null
          id?: string
          import_external_id?: string | null
          notes?: string
          pipeline_deal_id?: string | null
          sale_price?: number
          side?: Database["public"]["Enums"]["transaction_side"]
          source?: Database["public"]["Enums"]["tx_source"]
          status?: Database["public"]["Enums"]["transaction_status"]
          team_split_pct?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_pipeline_deal_id_fkey"
            columns: ["pipeline_deal_id"]
            isOneToOne: false
            referencedRelation: "pipeline_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_security_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_category: string
          event_type: string
          id: number
          ip_address_hash: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_category: string
          event_type: string
          id?: number
          ip_address_hash?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_category?: string
          event_type?: string
          id?: number
          ip_address_hash?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          agent_goals: Json | null
          ai_profile_prompt_dismissed_at: string | null
          ai_voice_guide: string | null
          apply_market_adjustment: boolean
          auto_categorize_enabled: boolean
          avatar_url: string
          board_code: string
          board_subregion: string
          brokerage_name: string
          brokerage_withholds_hst: boolean
          business_identity: Json | null
          business_logo_url: string
          business_name: string
          business_number: string
          cash_reserve: number
          color_theme: string
          communication_profile: Json | null
          compensation_method: string
          corp_type: string | null
          cpp_instalment_paid_ytd: number
          created_at: string
          dashboard_view: string
          display_name: string
          email_signature: string
          estimated_weekly_hours: number | null
          experience_years: number | null
          filing_frequency: string
          fiscal_year_end_month: number
          goal_gci: number
          goal_transactions: number
          goal_volume: number
          growth_goal_year_pcts: Json
          gst_hst_paid_on_expenses: number
          gst_hst_registered: boolean
          gst_hst_remitted_q1: number
          gst_hst_remitted_q2: number
          gst_hst_remitted_q3: number
          gst_hst_remitted_q4: number
          has_employees: boolean
          home_office_business_use_pct: number
          home_office_condo_fees_monthly: number
          home_office_insurance_monthly: number
          home_office_maintenance_annual: number
          home_office_method: string
          home_office_property_tax_annual: number
          home_office_rent_monthly: number
          home_office_sq_footage: number | null
          home_office_utilities_monthly: number
          inbound_alias: string
          is_admin: boolean
          is_incorporated: boolean
          market_board_name: string
          market_data_is_manual: boolean
          market_index_source_note: string
          market_last_updated: string
          market_metric_focus: Database["public"]["Enums"]["market_metric_focus"]
          market_mom_growth_pct: number
          market_new_listings_change_pct: number
          market_report_month: string
          market_sales_change_pct: number
          market_yoy_growth_pct: number
          monthly_brokerage_fee: number
          national_quarter_pcts: Json
          national_seasonality_updated: string
          num_employees: number
          post_cap_agent_pct: number
          post_cap_brokerage_pct: number
          post_cap_threshold_gci: number
          province: Database["public"]["Enums"]["province"]
          runway_score_snapshot: Json | null
          social_facebook: string
          social_instagram: string
          social_linkedin: string
          social_tiktok: string
          social_youtube: string
          split_preset: Database["public"]["Enums"]["split_preset"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_status: string
          subscription_tier: string
          tax_instalment_paid_q1: number
          tax_instalment_paid_q2: number
          tax_instalment_paid_q3: number
          tax_instalment_paid_q4: number
          tax_opt_dismissed: Json
          tx_fee_annual_cap: number
          tx_fee_rate_pct: number
          updated_at: string
          use_national_seasonality: boolean
          user_id: string
          vacation_weeks_per_year: number | null
          vehicle_business_use_pct: number
          vehicle_type: string
          ytd_gci: number
          ytd_transactions: number
          ytd_volume: number
        }
        Insert: {
          agent_goals?: Json | null
          ai_profile_prompt_dismissed_at?: string | null
          ai_voice_guide?: string | null
          apply_market_adjustment?: boolean
          auto_categorize_enabled?: boolean
          avatar_url?: string
          board_code?: string
          board_subregion?: string
          brokerage_name?: string
          brokerage_withholds_hst?: boolean
          business_identity?: Json | null
          business_logo_url?: string
          business_name?: string
          business_number?: string
          cash_reserve?: number
          color_theme?: string
          communication_profile?: Json | null
          compensation_method?: string
          corp_type?: string | null
          cpp_instalment_paid_ytd?: number
          created_at?: string
          dashboard_view?: string
          display_name?: string
          email_signature?: string
          estimated_weekly_hours?: number | null
          experience_years?: number | null
          filing_frequency?: string
          fiscal_year_end_month?: number
          goal_gci?: number
          goal_transactions?: number
          goal_volume?: number
          growth_goal_year_pcts?: Json
          gst_hst_paid_on_expenses?: number
          gst_hst_registered?: boolean
          gst_hst_remitted_q1?: number
          gst_hst_remitted_q2?: number
          gst_hst_remitted_q3?: number
          gst_hst_remitted_q4?: number
          has_employees?: boolean
          home_office_business_use_pct?: number
          home_office_condo_fees_monthly?: number
          home_office_insurance_monthly?: number
          home_office_maintenance_annual?: number
          home_office_method?: string
          home_office_property_tax_annual?: number
          home_office_rent_monthly?: number
          home_office_sq_footage?: number | null
          home_office_utilities_monthly?: number
          inbound_alias: string
          is_admin?: boolean
          is_incorporated?: boolean
          market_board_name?: string
          market_data_is_manual?: boolean
          market_index_source_note?: string
          market_last_updated?: string
          market_metric_focus?: Database["public"]["Enums"]["market_metric_focus"]
          market_mom_growth_pct?: number
          market_new_listings_change_pct?: number
          market_report_month?: string
          market_sales_change_pct?: number
          market_yoy_growth_pct?: number
          monthly_brokerage_fee?: number
          national_quarter_pcts?: Json
          national_seasonality_updated?: string
          num_employees?: number
          post_cap_agent_pct?: number
          post_cap_brokerage_pct?: number
          post_cap_threshold_gci?: number
          province?: Database["public"]["Enums"]["province"]
          runway_score_snapshot?: Json | null
          social_facebook?: string
          social_instagram?: string
          social_linkedin?: string
          social_tiktok?: string
          social_youtube?: string
          split_preset?: Database["public"]["Enums"]["split_preset"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string
          subscription_tier?: string
          tax_instalment_paid_q1?: number
          tax_instalment_paid_q2?: number
          tax_instalment_paid_q3?: number
          tax_instalment_paid_q4?: number
          tax_opt_dismissed?: Json
          tx_fee_annual_cap?: number
          tx_fee_rate_pct?: number
          updated_at?: string
          use_national_seasonality?: boolean
          user_id: string
          vacation_weeks_per_year?: number | null
          vehicle_business_use_pct?: number
          vehicle_type?: string
          ytd_gci?: number
          ytd_transactions?: number
          ytd_volume?: number
        }
        Update: {
          agent_goals?: Json | null
          ai_profile_prompt_dismissed_at?: string | null
          ai_voice_guide?: string | null
          apply_market_adjustment?: boolean
          auto_categorize_enabled?: boolean
          avatar_url?: string
          board_code?: string
          board_subregion?: string
          brokerage_name?: string
          brokerage_withholds_hst?: boolean
          business_identity?: Json | null
          business_logo_url?: string
          business_name?: string
          business_number?: string
          cash_reserve?: number
          color_theme?: string
          communication_profile?: Json | null
          compensation_method?: string
          corp_type?: string | null
          cpp_instalment_paid_ytd?: number
          created_at?: string
          dashboard_view?: string
          display_name?: string
          email_signature?: string
          estimated_weekly_hours?: number | null
          experience_years?: number | null
          filing_frequency?: string
          fiscal_year_end_month?: number
          goal_gci?: number
          goal_transactions?: number
          goal_volume?: number
          growth_goal_year_pcts?: Json
          gst_hst_paid_on_expenses?: number
          gst_hst_registered?: boolean
          gst_hst_remitted_q1?: number
          gst_hst_remitted_q2?: number
          gst_hst_remitted_q3?: number
          gst_hst_remitted_q4?: number
          has_employees?: boolean
          home_office_business_use_pct?: number
          home_office_condo_fees_monthly?: number
          home_office_insurance_monthly?: number
          home_office_maintenance_annual?: number
          home_office_method?: string
          home_office_property_tax_annual?: number
          home_office_rent_monthly?: number
          home_office_sq_footage?: number | null
          home_office_utilities_monthly?: number
          inbound_alias?: string
          is_admin?: boolean
          is_incorporated?: boolean
          market_board_name?: string
          market_data_is_manual?: boolean
          market_index_source_note?: string
          market_last_updated?: string
          market_metric_focus?: Database["public"]["Enums"]["market_metric_focus"]
          market_mom_growth_pct?: number
          market_new_listings_change_pct?: number
          market_report_month?: string
          market_sales_change_pct?: number
          market_yoy_growth_pct?: number
          monthly_brokerage_fee?: number
          national_quarter_pcts?: Json
          national_seasonality_updated?: string
          num_employees?: number
          post_cap_agent_pct?: number
          post_cap_brokerage_pct?: number
          post_cap_threshold_gci?: number
          province?: Database["public"]["Enums"]["province"]
          runway_score_snapshot?: Json | null
          social_facebook?: string
          social_instagram?: string
          social_linkedin?: string
          social_tiktok?: string
          social_youtube?: string
          split_preset?: Database["public"]["Enums"]["split_preset"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string
          subscription_tier?: string
          tax_instalment_paid_q1?: number
          tax_instalment_paid_q2?: number
          tax_instalment_paid_q3?: number
          tax_instalment_paid_q4?: number
          tax_opt_dismissed?: Json
          tx_fee_annual_cap?: number
          tx_fee_rate_pct?: number
          updated_at?: string
          use_national_seasonality?: boolean
          user_id?: string
          vacation_weeks_per_year?: number | null
          vehicle_business_use_pct?: number
          vehicle_type?: string
          ytd_gci?: number
          ytd_transactions?: number
          ytd_volume?: number
        }
        Relationships: []
      }
    }
    Views: {
      chat_analytics_daily_summary: {
        Row: {
          day: string | null
          diagnostic_hits: number | null
          escalation_count: number | null
          high_followup_sessions: number | null
          playbook_hits: number | null
          positive_feedback_rate: number | null
          thumbs_down: number | null
          thumbs_up: number | null
          total_messages: number | null
          unique_users: number | null
        }
        Relationships: []
      }
      org_agent_performance: {
        Row: {
          agent_name: string | null
          avatar_url: string | null
          data_sharing_tier:
            | Database["public"]["Enums"]["data_sharing_tier"]
            | null
          deal_count: number | null
          experience_years: number | null
          goal_gci: number | null
          monthly_gci: Json | null
          org_id: string | null
          pipeline_count: number | null
          pipeline_value: number | null
          role: Database["public"]["Enums"]["org_member_role"] | null
          status: Database["public"]["Enums"]["org_member_status"] | null
          user_id: string | null
          ytd_gci: number | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations_billing: {
        Row: {
          anonymize_agents: boolean | null
          billing_email: string | null
          created_at: string | null
          id: string | null
          is_beta: boolean | null
          logo_url: string | null
          max_seats: number | null
          name: string | null
          org_goal_gci: number | null
          owner_id: string | null
          slug: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          type: Database["public"]["Enums"]["org_type"] | null
          updated_at: string | null
        }
        Insert: {
          anonymize_agents?: boolean | null
          billing_email?: string | null
          created_at?: string | null
          id?: string | null
          is_beta?: boolean | null
          logo_url?: string | null
          max_seats?: number | null
          name?: string | null
          org_goal_gci?: number | null
          owner_id?: string | null
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          type?: Database["public"]["Enums"]["org_type"] | null
          updated_at?: string | null
        }
        Update: {
          anonymize_agents?: boolean | null
          billing_email?: string | null
          created_at?: string | null
          id?: string | null
          is_beta?: boolean | null
          logo_url?: string | null
          max_seats?: number | null
          name?: string | null
          org_goal_gci?: number | null
          owner_id?: string | null
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          type?: Database["public"]["Enums"]["org_type"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      organizations_public: {
        Row: {
          anonymize_agents: boolean | null
          created_at: string | null
          id: string | null
          is_beta: boolean | null
          logo_url: string | null
          max_seats: number | null
          name: string | null
          org_goal_gci: number | null
          owner_id: string | null
          slug: string | null
          subscription_status: string | null
          type: Database["public"]["Enums"]["org_type"] | null
          updated_at: string | null
        }
        Insert: {
          anonymize_agents?: boolean | null
          created_at?: string | null
          id?: string | null
          is_beta?: boolean | null
          logo_url?: string | null
          max_seats?: number | null
          name?: string | null
          org_goal_gci?: number | null
          owner_id?: string | null
          slug?: string | null
          subscription_status?: string | null
          type?: Database["public"]["Enums"]["org_type"] | null
          updated_at?: string | null
        }
        Update: {
          anonymize_agents?: boolean | null
          created_at?: string | null
          id?: string | null
          is_beta?: boolean | null
          logo_url?: string | null
          max_seats?: number | null
          name?: string | null
          org_goal_gci?: number | null
          owner_id?: string | null
          slug?: string | null
          subscription_status?: string | null
          type?: Database["public"]["Enums"]["org_type"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      fn_org_crm_activity_summary: {
        Args: { p_org_id: string }
        Returns: {
          active_clients: number
          agent_name: string
          calls: number
          emails: number
          last_activity_at: string
          meetings: number
          showings: number
          texts: number
          total_activities: number
          user_id: string
        }[]
      }
      fn_org_expense_filing_status: {
        Args: { p_org_id: string }
        Returns: {
          agent_name: string
          expense_category_count: number
          has_expenses_this_quarter: boolean
          has_receipt_uploads: boolean
          user_id: string
        }[]
      }
      fn_org_pending_deals_summary: {
        Args: { p_org_id: string }
        Returns: {
          agent_name: string
          avg_probability: number
          nearest_close: string
          pending_count: number
          pending_value: number
          user_id: string
        }[]
      }
      new_role_is_not_owner: {
        Args: { r: Database["public"]["Enums"]["org_member_role"] }
        Returns: boolean
      }
      release_seat_lock: { Args: { p_org_id: string }; Returns: undefined }
      resolve_inbound_alias: { Args: { alias_token: string }; Returns: string }
      seed_default_expenses: { Args: { p_user_id: string }; Returns: undefined }
      try_acquire_seat_lock: {
        Args: { p_org_id: string; p_ttl_seconds?: number }
        Returns: boolean
      }
    }
    Enums: {
      audit_action:
        | "member_invited"
        | "member_joined"
        | "member_removed"
        | "member_departed"
        | "member_role_changed"
        | "consent_granted"
        | "consent_revoked"
        | "settings_changed"
        | "performance_viewed"
        | "export_requested"
      data_sharing_tier: "tier1" | "tier2"
      market_data_readiness: "manualOnly" | "stubData" | "liveFeed"
      market_geography_type: "national" | "province" | "board" | "city"
      market_metric_focus: "sales" | "price" | "combined"
      milestone_type:
        | "gciThreshold"
        | "dealCount"
        | "firstDealOfMonth"
        | "firstDealOfQuarter"
        | "bestMonth"
        | "bestQuarter"
        | "paceAhead"
        | "streakWeek"
      org_member_role: "owner" | "admin" | "team_leader" | "agent"
      org_member_status: "active" | "pending" | "suspended" | "departed"
      org_type: "brokerage" | "team"
      pipeline_stage:
        | "lead"
        | "showing"
        | "offer"
        | "conditional"
        | "firm"
        | "closed"
      province:
        | "alberta"
        | "britishColumbia"
        | "manitoba"
        | "newBrunswick"
        | "newfoundland"
        | "northwestTerritories"
        | "novaScotia"
        | "nunavut"
        | "ontario"
        | "princeEdwardIsland"
        | "quebec"
        | "saskatchewan"
        | "yukon"
      split_preset:
        | "p70_30"
        | "p75_25"
        | "p80_20"
        | "p85_15"
        | "p90_10"
        | "p95_5"
        | "p100_0"
      transaction_side: "buyer" | "seller" | "both"
      transaction_status: "closed" | "pending" | "fallen"
      tx_date_precision: "day" | "month" | "quarter" | "year"
      tx_source: "manual" | "imported"
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
      audit_action: [
        "member_invited",
        "member_joined",
        "member_removed",
        "member_departed",
        "member_role_changed",
        "consent_granted",
        "consent_revoked",
        "settings_changed",
        "performance_viewed",
        "export_requested",
      ],
      data_sharing_tier: ["tier1", "tier2"],
      market_data_readiness: ["manualOnly", "stubData", "liveFeed"],
      market_geography_type: ["national", "province", "board", "city"],
      market_metric_focus: ["sales", "price", "combined"],
      milestone_type: [
        "gciThreshold",
        "dealCount",
        "firstDealOfMonth",
        "firstDealOfQuarter",
        "bestMonth",
        "bestQuarter",
        "paceAhead",
        "streakWeek",
      ],
      org_member_role: ["owner", "admin", "team_leader", "agent"],
      org_member_status: ["active", "pending", "suspended", "departed"],
      org_type: ["brokerage", "team"],
      pipeline_stage: [
        "lead",
        "showing",
        "offer",
        "conditional",
        "firm",
        "closed",
      ],
      province: [
        "alberta",
        "britishColumbia",
        "manitoba",
        "newBrunswick",
        "newfoundland",
        "northwestTerritories",
        "novaScotia",
        "nunavut",
        "ontario",
        "princeEdwardIsland",
        "quebec",
        "saskatchewan",
        "yukon",
      ],
      split_preset: [
        "p70_30",
        "p75_25",
        "p80_20",
        "p85_15",
        "p90_10",
        "p95_5",
        "p100_0",
      ],
      transaction_side: ["buyer", "seller", "both"],
      transaction_status: ["closed", "pending", "fallen"],
      tx_date_precision: ["day", "month", "quarter", "year"],
      tx_source: ["manual", "imported"],
    },
  },
} as const
