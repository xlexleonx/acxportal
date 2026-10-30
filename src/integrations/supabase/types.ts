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
      agent_commands: {
        Row: {
          agent_id: string
          command_type: string
          created_at: string
          executed_at: string | null
          id: string
          payload: Json | null
          result: Json | null
          status: string
        }
        Insert: {
          agent_id: string
          command_type: string
          created_at?: string
          executed_at?: string | null
          id?: string
          payload?: Json | null
          result?: Json | null
          status?: string
        }
        Update: {
          agent_id?: string
          command_type?: string
          created_at?: string
          executed_at?: string | null
          id?: string
          payload?: Json | null
          result?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_commands_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_registrations"
            referencedColumns: ["agent_id"]
          },
        ]
      }
      agent_metrics: {
        Row: {
          agent_id: string
          collected_at: string
          cpu_usage_percent: number | null
          created_at: string
          disk_metrics: Json | null
          id: string
          load_avg: Json | null
          network_metrics: Json | null
          ram_total_mb: number | null
          ram_used_mb: number | null
          services: Json | null
          temperatures: Json | null
          uptime_seconds: number | null
        }
        Insert: {
          agent_id: string
          collected_at?: string
          cpu_usage_percent?: number | null
          created_at?: string
          disk_metrics?: Json | null
          id?: string
          load_avg?: Json | null
          network_metrics?: Json | null
          ram_total_mb?: number | null
          ram_used_mb?: number | null
          services?: Json | null
          temperatures?: Json | null
          uptime_seconds?: number | null
        }
        Update: {
          agent_id?: string
          collected_at?: string
          cpu_usage_percent?: number | null
          created_at?: string
          disk_metrics?: Json | null
          id?: string
          load_avg?: Json | null
          network_metrics?: Json | null
          ram_total_mb?: number | null
          ram_used_mb?: number | null
          services?: Json | null
          temperatures?: Json | null
          uptime_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_registrations"
            referencedColumns: ["agent_id"]
          },
        ]
      }
      agent_registrations: {
        Row: {
          agent_id: string
          agent_version: string | null
          arch: string | null
          auto_registered: boolean
          cpu_cores: number | null
          cpu_model: string | null
          created_at: string
          equipment_id: string | null
          hostname: string | null
          id: string
          ip_addresses: Json | null
          is_active: boolean
          last_seen_at: string | null
          mac_addresses: Json | null
          notes: string | null
          organization_id: string | null
          os_type: string | null
          os_version: string | null
          proxy_required: boolean
          ram_total_mb: number | null
          registered_at: string
          serial_number: string | null
          site_id: string | null
          token: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          agent_version?: string | null
          arch?: string | null
          auto_registered?: boolean
          cpu_cores?: number | null
          cpu_model?: string | null
          created_at?: string
          equipment_id?: string | null
          hostname?: string | null
          id?: string
          ip_addresses?: Json | null
          is_active?: boolean
          last_seen_at?: string | null
          mac_addresses?: Json | null
          notes?: string | null
          organization_id?: string | null
          os_type?: string | null
          os_version?: string | null
          proxy_required?: boolean
          ram_total_mb?: number | null
          registered_at?: string
          serial_number?: string | null
          site_id?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          agent_version?: string | null
          arch?: string | null
          auto_registered?: boolean
          cpu_cores?: number | null
          cpu_model?: string | null
          created_at?: string
          equipment_id?: string | null
          hostname?: string | null
          id?: string
          ip_addresses?: Json | null
          is_active?: boolean
          last_seen_at?: string | null
          mac_addresses?: Json | null
          notes?: string | null
          organization_id?: string | null
          os_type?: string | null
          os_version?: string | null
          proxy_required?: boolean
          ram_total_mb?: number | null
          registered_at?: string
          serial_number?: string | null
          site_id?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_registrations_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_registrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_registrations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_thresholds: {
        Row: {
          auto_create_ticket: boolean
          comparison: string
          created_at: string
          created_by: string | null
          critical_value: number | null
          display_name: string | null
          enabled: boolean
          host_id: string | null
          id: string
          item_key: string
          notes: string | null
          updated_at: string
          warning_value: number | null
          zabbix_host_id: string | null
        }
        Insert: {
          auto_create_ticket?: boolean
          comparison?: string
          created_at?: string
          created_by?: string | null
          critical_value?: number | null
          display_name?: string | null
          enabled?: boolean
          host_id?: string | null
          id?: string
          item_key: string
          notes?: string | null
          updated_at?: string
          warning_value?: number | null
          zabbix_host_id?: string | null
        }
        Update: {
          auto_create_ticket?: boolean
          comparison?: string
          created_at?: string
          created_by?: string | null
          critical_value?: number | null
          display_name?: string | null
          enabled?: boolean
          host_id?: string | null
          id?: string
          item_key?: string
          notes?: string | null
          updated_at?: string
          warning_value?: number | null
          zabbix_host_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_thresholds_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "monitored_hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      applied_migrations: {
        Row: {
          applied_at: string
          applied_by: string | null
          checksum: string | null
          duration_ms: number | null
          filename: string
          note: string | null
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          checksum?: string | null
          duration_ms?: number | null
          filename: string
          note?: string | null
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          checksum?: string | null
          duration_ms?: number | null
          filename?: string
          note?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          entity_id: string | null
          id: string
          module: string
          organization: string | null
          target_user_id: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          entity_id?: string | null
          id?: string
          module: string
          organization?: string | null
          target_user_id?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          entity_id?: string | null
          id?: string
          module?: string
          organization?: string | null
          target_user_id?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      automation_logs: {
        Row: {
          cancel_requested: boolean
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          host_id: string | null
          host_name: string | null
          id: string
          result: string | null
          script_id: string | null
          script_name: string
          status: string
          user_id: string
        }
        Insert: {
          cancel_requested?: boolean
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          host_id?: string | null
          host_name?: string | null
          id?: string
          result?: string | null
          script_id?: string | null
          script_name: string
          status?: string
          user_id: string
        }
        Update: {
          cancel_requested?: boolean
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          host_id?: string | null
          host_name?: string | null
          id?: string
          result?: string | null
          script_id?: string | null
          script_name?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      backup_storage_connections: {
        Row: {
          auth_method: string
          base_path: string
          created_at: string
          enabled: boolean
          host: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          last_status: string | null
          name: string
          notes: string | null
          password: string | null
          port: number
          private_key: string | null
          updated_at: string
          username: string
        }
        Insert: {
          auth_method?: string
          base_path?: string
          created_at?: string
          enabled?: boolean
          host: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_status?: string | null
          name: string
          notes?: string | null
          password?: string | null
          port?: number
          private_key?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          auth_method?: string
          base_path?: string
          created_at?: string
          enabled?: boolean
          host?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_status?: string | null
          name?: string
          notes?: string | null
          password?: string | null
          port?: number
          private_key?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          attachments: Json
          content: string
          created_at: string
          edited_at: string | null
          id: string
          parent_id: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          content: string
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          attachments?: Json
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_thread_participants: {
        Row: {
          history_from: string | null
          joined_at: string
          last_read_at: string
          muted: boolean
          thread_id: string
          user_id: string
        }
        Insert: {
          history_from?: string | null
          joined_at?: string
          last_read_at?: string
          muted?: boolean
          thread_id: string
          user_id: string
        }
        Update: {
          history_from?: string | null
          joined_at?: string
          last_read_at?: string
          muted?: boolean
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          last_message_at: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind?: string
          last_message_at?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          last_message_at?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          contract_number: string
          created_at: string
          created_by: string | null
          end_date: string | null
          executor_org_name: string | null
          id: string
          is_active: boolean
          notes: string | null
          organization_id: string
          scan_name: string | null
          scan_path: string | null
          start_date: string
          title: string | null
          updated_at: string
        }
        Insert: {
          contract_number: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          executor_org_name?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_id: string
          scan_name?: string | null
          scan_path?: string | null
          start_date: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          contract_number?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          executor_org_name?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_id?: string
          scan_name?: string | null
          scan_path?: string | null
          start_date?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dismissed_alerts: {
        Row: {
          dismissed_at: string
          eventid: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          eventid: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          dismissed_at?: string
          eventid?: string
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          description: string | null
          doc_category: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          name: string
          organization: string
          organization_id: string | null
          site_id: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          doc_category?: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          name: string
          organization: string
          organization_id?: string | null
          site_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          doc_category?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          name?: string
          organization?: string
          organization_id?: string | null
          site_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          backup_extensions: string[] | null
          backup_filename_pattern: string | null
          backup_max_age_hours: number | null
          backup_md5_expected: string | null
          backup_md5_source: string | null
          backup_min_size_kb: number | null
          backup_path: string | null
          backup_storage_id: string | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          log_extensions: string[] | null
          log_filename_pattern: string | null
          log_max_age_days: number | null
          log_path: string | null
          log_storage_id: string | null
          model: string | null
          name: string
          organization_id: string | null
          os_info: string | null
          quantity: number | null
          serial_number: string | null
          site_id: string
          status: string | null
          updated_at: string
          warranty_provider: string | null
          warranty_until: string | null
        }
        Insert: {
          backup_extensions?: string[] | null
          backup_filename_pattern?: string | null
          backup_max_age_hours?: number | null
          backup_md5_expected?: string | null
          backup_md5_source?: string | null
          backup_min_size_kb?: number | null
          backup_path?: string | null
          backup_storage_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          log_extensions?: string[] | null
          log_filename_pattern?: string | null
          log_max_age_days?: number | null
          log_path?: string | null
          log_storage_id?: string | null
          model?: string | null
          name: string
          organization_id?: string | null
          os_info?: string | null
          quantity?: number | null
          serial_number?: string | null
          site_id: string
          status?: string | null
          updated_at?: string
          warranty_provider?: string | null
          warranty_until?: string | null
        }
        Update: {
          backup_extensions?: string[] | null
          backup_filename_pattern?: string | null
          backup_max_age_hours?: number | null
          backup_md5_expected?: string | null
          backup_md5_source?: string | null
          backup_min_size_kb?: number | null
          backup_path?: string | null
          backup_storage_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          log_extensions?: string[] | null
          log_filename_pattern?: string | null
          log_max_age_days?: number | null
          log_path?: string | null
          log_storage_id?: string | null
          model?: string | null
          name?: string
          organization_id?: string | null
          os_info?: string | null
          quantity?: number | null
          serial_number?: string | null
          site_id?: string
          status?: string | null
          updated_at?: string
          warranty_provider?: string | null
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_backup_storage_id_fkey"
            columns: ["backup_storage_id"]
            isOneToOne: false
            referencedRelation: "backup_storage_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "equipment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_log_storage_id_fkey"
            columns: ["log_storage_id"]
            isOneToOne: false
            referencedRelation: "backup_storage_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_backup_checks: {
        Row: {
          checked_at: string
          equipment_id: string
          file_mtime: string | null
          file_path: string | null
          file_size: number | null
          id: string
          md5_actual: string | null
          md5_expected: string | null
          message: string | null
          status: string
          storage_id: string | null
          triggered_by: string
        }
        Insert: {
          checked_at?: string
          equipment_id: string
          file_mtime?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          md5_actual?: string | null
          md5_expected?: string | null
          message?: string | null
          status: string
          storage_id?: string | null
          triggered_by?: string
        }
        Update: {
          checked_at?: string
          equipment_id?: string
          file_mtime?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          md5_actual?: string | null
          md5_expected?: string | null
          message?: string | null
          status?: string
          storage_id?: string | null
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_backup_checks_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_backup_checks_storage_id_fkey"
            columns: ["storage_id"]
            isOneToOne: false
            referencedRelation: "backup_storage_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_categories: {
        Row: {
          description: string | null
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          description?: string | null
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      equipment_log_files: {
        Row: {
          analyzed_log_id: string | null
          discovered_at: string
          equipment_id: string
          file_mtime: string | null
          file_path: string
          filename: string
          id: string
          last_error: string | null
          size_bytes: number | null
          status: string
          storage_id: string
          updated_at: string
        }
        Insert: {
          analyzed_log_id?: string | null
          discovered_at?: string
          equipment_id: string
          file_mtime?: string | null
          file_path: string
          filename: string
          id?: string
          last_error?: string | null
          size_bytes?: number | null
          status?: string
          storage_id: string
          updated_at?: string
        }
        Update: {
          analyzed_log_id?: string | null
          discovered_at?: string
          equipment_id?: string
          file_mtime?: string | null
          file_path?: string
          filename?: string
          id?: string
          last_error?: string | null
          size_bytes?: number | null
          status?: string
          storage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_log_files_analyzed_log_id_fkey"
            columns: ["analyzed_log_id"]
            isOneToOne: false
            referencedRelation: "equipment_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_log_files_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_log_files_storage_id_fkey"
            columns: ["storage_id"]
            isOneToOne: false
            referencedRelation: "backup_storage_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_logs: {
        Row: {
          analysis: Json | null
          created_at: string
          equipment_id: string | null
          filename: string | null
          id: string
          protocol_id: string | null
          protocol_item_id: string | null
          raw_text: string | null
          size_bytes: number | null
          source: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          analysis?: Json | null
          created_at?: string
          equipment_id?: string | null
          filename?: string | null
          id?: string
          protocol_id?: string | null
          protocol_item_id?: string | null
          raw_text?: string | null
          size_bytes?: number | null
          source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          analysis?: Json | null
          created_at?: string
          equipment_id?: string | null
          filename?: string | null
          id?: string
          protocol_id?: string | null
          protocol_item_id?: string | null
          raw_text?: string | null
          size_bytes?: number | null
          source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_logs_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_logs_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "maintenance_protocols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_logs_protocol_item_id_fkey"
            columns: ["protocol_item_id"]
            isOneToOne: false
            referencedRelation: "protocol_items"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_reset_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_email: string | null
          created_at: string
          executed_at: string | null
          expires_at: string
          id: string
          reason: string | null
          rejected_reason: string | null
          requested_by: string
          requested_by_email: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_email?: string | null
          created_at?: string
          executed_at?: string | null
          expires_at?: string
          id?: string
          reason?: string | null
          rejected_reason?: string | null
          requested_by: string
          requested_by_email?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_email?: string | null
          created_at?: string
          executed_at?: string | null
          expires_at?: string
          id?: string
          reason?: string | null
          rejected_reason?: string | null
          requested_by?: string
          requested_by_email?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      gitlab_ticket_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          issue_iid: number
          issue_state: string
          issue_url: string
          project_id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          issue_iid: number
          issue_state?: string
          issue_url: string
          project_id: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          issue_iid?: number
          issue_state?: string
          issue_url?: string
          project_id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          country_code: string
          created_at: string
          created_by: string | null
          date: string
          day_type: string
          id: string
          name: string
          notes: string | null
          source: string
          updated_at: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          date: string
          day_type?: string
          id?: string
          name: string
          notes?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          date?: string
          day_type?: string
          id?: string
          name?: string
          notes?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      infrastructure_map_versions: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          data: Json
          edge_count: number
          id: string
          map_id: string
          node_count: number
          version_number: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          data?: Json
          edge_count?: number
          id?: string
          map_id: string
          node_count?: number
          version_number: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          data?: Json
          edge_count?: number
          id?: string
          map_id?: string
          node_count?: number
          version_number?: number
        }
        Relationships: []
      }
      infrastructure_maps: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          description: string | null
          id: string
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      integration_settings: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      item_aliases: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          display_name: string
          host_id: string | null
          id: string
          item_key: string
          updated_at: string
          zabbix_host_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          display_name: string
          host_id?: string | null
          id?: string
          item_key: string
          updated_at?: string
          zabbix_host_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          host_id?: string | null
          id?: string
          item_key?: string
          updated_at?: string
          zabbix_host_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_aliases_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "monitored_hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      item_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          custom_display_name: string | null
          custom_oid: string | null
          disabled: boolean
          id: string
          item_key: string
          notes: string | null
          updated_at: string
          zabbix_host_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_display_name?: string | null
          custom_oid?: string | null
          disabled?: boolean
          id?: string
          item_key: string
          notes?: string | null
          updated_at?: string
          zabbix_host_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_display_name?: string | null
          custom_oid?: string | null
          disabled?: boolean
          id?: string
          item_key?: string
          notes?: string | null
          updated_at?: string
          zabbix_host_id?: string
        }
        Relationships: []
      }
      maintenance_protocols: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          customer_org_id: string | null
          executor_name: string | null
          executor_org_id: string | null
          executor_signature_user_id: string | null
          executor_user_id: string | null
          frequency: Database["public"]["Enums"]["maintenance_frequency"]
          header_snapshot: Json | null
          id: string
          notes: string | null
          period_end: string
          period_start: string
          report_date: string | null
          responsible_name: string | null
          responsible_signature_user_id: string | null
          responsible_user_id: string | null
          signed_executor_at: string | null
          signed_responsible_at: string | null
          site_id: string
          status: Database["public"]["Enums"]["protocol_status"]
          template_id: string | null
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_org_id?: string | null
          executor_name?: string | null
          executor_org_id?: string | null
          executor_signature_user_id?: string | null
          executor_user_id?: string | null
          frequency: Database["public"]["Enums"]["maintenance_frequency"]
          header_snapshot?: Json | null
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          report_date?: string | null
          responsible_name?: string | null
          responsible_signature_user_id?: string | null
          responsible_user_id?: string | null
          signed_executor_at?: string | null
          signed_responsible_at?: string | null
          site_id: string
          status?: Database["public"]["Enums"]["protocol_status"]
          template_id?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_org_id?: string | null
          executor_name?: string | null
          executor_org_id?: string | null
          executor_signature_user_id?: string | null
          executor_user_id?: string | null
          frequency?: Database["public"]["Enums"]["maintenance_frequency"]
          header_snapshot?: Json | null
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          report_date?: string | null
          responsible_name?: string | null
          responsible_signature_user_id?: string | null
          responsible_user_id?: string | null
          signed_executor_at?: string | null
          signed_responsible_at?: string | null
          site_id?: string
          status?: Database["public"]["Enums"]["protocol_status"]
          template_id?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_protocols_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_protocols_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_protocols_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "protocol_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_protocols_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_schedules: {
        Row: {
          assigned_to: string | null
          created_at: string
          equipment_id: string
          id: string
          last_completed_date: string | null
          next_due_date: string
          task_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          equipment_id: string
          id?: string
          last_completed_date?: string | null
          next_due_date: string
          task_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          equipment_id?: string
          id?: string
          last_completed_date?: string | null
          next_due_date?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_schedules_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_schedules_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "maintenance_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tasks: {
        Row: {
          automation_script: string | null
          category_id: string | null
          created_at: string
          description: string | null
          equipment_id: string | null
          equipment_ids: string[]
          frequency: Database["public"]["Enums"]["maintenance_frequency"]
          id: string
          include_in_protocol: boolean
          is_active: boolean
          is_automatable: boolean | null
          is_system: boolean
          manual_coverage: boolean
          manual_coverage_note: string | null
          metric_bindings: Json
          organization_id: string | null
          site_id: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          automation_script?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          equipment_id?: string | null
          equipment_ids?: string[]
          frequency: Database["public"]["Enums"]["maintenance_frequency"]
          id?: string
          include_in_protocol?: boolean
          is_active?: boolean
          is_automatable?: boolean | null
          is_system?: boolean
          manual_coverage?: boolean
          manual_coverage_note?: string | null
          metric_bindings?: Json
          organization_id?: string | null
          site_id?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          automation_script?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          equipment_id?: string | null
          equipment_ids?: string[]
          frequency?: Database["public"]["Enums"]["maintenance_frequency"]
          id?: string
          include_in_protocol?: boolean
          is_active?: boolean
          is_automatable?: boolean | null
          is_system?: boolean
          manual_coverage?: boolean
          manual_coverage_note?: string | null
          metric_bindings?: Json
          organization_id?: string | null
          site_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "equipment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tasks_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tasks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_translations: {
        Row: {
          category: string | null
          created_at: string
          description_ru: string | null
          display_name_ru: string
          id: string
          key_pattern: string
          match_type: string
          priority: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description_ru?: string | null
          display_name_ru: string
          id?: string
          key_pattern: string
          match_type?: string
          priority?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description_ru?: string | null
          display_name_ru?: string
          id?: string
          key_pattern?: string
          match_type?: string
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      mib_oid_cache: {
        Row: {
          description: string | null
          fetched_at: string
          name: string | null
          oid: string
          source: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          fetched_at?: string
          name?: string | null
          oid: string
          source?: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          fetched_at?: string
          name?: string | null
          oid?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      monitored_hosts: {
        Row: {
          created_at: string
          credentials_login: string | null
          credentials_password: string | null
          device_type: Database["public"]["Enums"]["device_type"]
          enabled: boolean
          host_group: string | null
          id: string
          ip_address: string
          name: string
          notes: string | null
          organization_id: string | null
          port: number | null
          protocol: Database["public"]["Enums"]["monitoring_protocol"]
          protocols_config: Json | null
          site_id: string | null
          snmp_community: string | null
          templates: Json | null
          updated_at: string
          visible_name: string | null
          zabbix_connection_id: string | null
          zabbix_host_id: string | null
        }
        Insert: {
          created_at?: string
          credentials_login?: string | null
          credentials_password?: string | null
          device_type?: Database["public"]["Enums"]["device_type"]
          enabled?: boolean
          host_group?: string | null
          id?: string
          ip_address: string
          name: string
          notes?: string | null
          organization_id?: string | null
          port?: number | null
          protocol?: Database["public"]["Enums"]["monitoring_protocol"]
          protocols_config?: Json | null
          site_id?: string | null
          snmp_community?: string | null
          templates?: Json | null
          updated_at?: string
          visible_name?: string | null
          zabbix_connection_id?: string | null
          zabbix_host_id?: string | null
        }
        Update: {
          created_at?: string
          credentials_login?: string | null
          credentials_password?: string | null
          device_type?: Database["public"]["Enums"]["device_type"]
          enabled?: boolean
          host_group?: string | null
          id?: string
          ip_address?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          port?: number | null
          protocol?: Database["public"]["Enums"]["monitoring_protocol"]
          protocols_config?: Json | null
          site_id?: string | null
          snmp_community?: string | null
          templates?: Json | null
          updated_at?: string
          visible_name?: string | null
          zabbix_connection_id?: string | null
          zabbix_host_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monitored_hosts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitored_hosts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitored_hosts_zabbix_connection_id_fkey"
            columns: ["zabbix_connection_id"]
            isOneToOne: false
            referencedRelation: "zabbix_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_host_links: {
        Row: {
          auto_matched: boolean
          created_at: string
          created_by: string | null
          equipment_id: string
          host_name: string
          id: string
          updated_at: string
          zabbix_host_id: string
        }
        Insert: {
          auto_matched?: boolean
          created_at?: string
          created_by?: string | null
          equipment_id: string
          host_name: string
          id?: string
          updated_at?: string
          zabbix_host_id: string
        }
        Update: {
          auto_matched?: boolean
          created_at?: string
          created_by?: string | null
          equipment_id?: string
          host_name?: string
          id?: string
          updated_at?: string
          zabbix_host_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_host_links_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: true
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_channels: {
        Row: {
          channel_type: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          last_test_at: string | null
          last_test_error: string | null
          last_test_status: string | null
          name: string
          updated_at: string
          user_id: string
          verified: boolean
        }
        Insert: {
          channel_type: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          name: string
          updated_at?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          channel_type?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          name?: string
          updated_at?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          attempts: number
          body: string | null
          channel_id: string | null
          channel_type: string
          created_at: string
          error: string | null
          event_type: string
          http_status: number | null
          id: string
          is_read: boolean
          payload: Json | null
          priority: string | null
          sent_at: string | null
          status: string
          title: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          body?: string | null
          channel_id?: string | null
          channel_type: string
          created_at?: string
          error?: string | null
          event_type: string
          http_status?: number | null
          id?: string
          is_read?: boolean
          payload?: Json | null
          priority?: string | null
          sent_at?: string | null
          status?: string
          title?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          body?: string | null
          channel_id?: string | null
          channel_type?: string
          created_at?: string
          error?: string | null
          event_type?: string
          http_status?: number | null
          id?: string
          is_read?: boolean
          payload?: Json | null
          priority?: string | null
          sent_at?: string | null
          status?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          delivery_mode: string
          digest_schedule: string
          dnd_enabled: boolean
          quiet_bypass_critical: boolean
          quiet_days: Json
          quiet_hours_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivery_mode?: string
          digest_schedule?: string
          dnd_enabled?: boolean
          quiet_bypass_critical?: boolean
          quiet_days?: Json
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivery_mode?: string
          digest_schedule?: string
          dnd_enabled?: boolean
          quiet_bypass_critical?: boolean
          quiet_days?: Json
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          attempts: number
          body: string | null
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          priority: string | null
          scheduled_for: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json
          priority?: string | null
          scheduled_for?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          priority?: string | null
          scheduled_for?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_subscriptions: {
        Row: {
          channel_ids: Json
          created_at: string
          enabled: boolean
          event_type: string
          filters: Json
          id: string
          min_priority: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_ids?: Json
          created_at?: string
          enabled?: boolean
          event_type: string
          filters?: Json
          id?: string
          min_priority?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_ids?: Json
          created_at?: string
          enabled?: boolean
          event_type?: string
          filters?: Json
          id?: string
          min_priority?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          executor_default: string | null
          id: string
          inn: string | null
          is_active: boolean
          legal_full_name: string | null
          name: string
          notes: string | null
          short_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          executor_default?: string | null
          id?: string
          inn?: string | null
          is_active?: boolean
          legal_full_name?: string | null
          name: string
          notes?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          executor_default?: string | null
          id?: string
          inn?: string | null
          is_active?: boolean
          legal_full_name?: string | null
          name?: string
          notes?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      problem_flags: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string
          created_by_name: string | null
          eventid: string | null
          flag: Database["public"]["Enums"]["problem_flag_level"]
          host: string | null
          id: string
          triggerid: string | null
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by: string
          created_by_name?: string | null
          eventid?: string | null
          flag?: Database["public"]["Enums"]["problem_flag_level"]
          host?: string | null
          id?: string
          triggerid?: string | null
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          eventid?: string | null
          flag?: Database["public"]["Enums"]["problem_flag_level"]
          host?: string | null
          id?: string
          triggerid?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          organization: string | null
          phone: string | null
          position: string | null
          signature_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          organization?: string | null
          phone?: string | null
          position?: string | null
          signature_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          organization?: string | null
          phone?: string | null
          position?: string | null
          signature_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      protocol_items: {
        Row: {
          auto_result: Json | null
          completed_at: string | null
          completed_by: string | null
          equipment_id: string
          equipment_snapshot: Json | null
          id: string
          notes: string | null
          protocol_id: string
          result: string | null
          schedule_id: string | null
          status: string | null
          task_id: string
        }
        Insert: {
          auto_result?: Json | null
          completed_at?: string | null
          completed_by?: string | null
          equipment_id: string
          equipment_snapshot?: Json | null
          id?: string
          notes?: string | null
          protocol_id: string
          result?: string | null
          schedule_id?: string | null
          status?: string | null
          task_id: string
        }
        Update: {
          auto_result?: Json | null
          completed_at?: string | null
          completed_by?: string | null
          equipment_id?: string
          equipment_snapshot?: Json | null
          id?: string
          notes?: string | null
          protocol_id?: string
          result?: string | null
          schedule_id?: string | null
          status?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocol_items_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_items_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "maintenance_protocols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_items_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "maintenance_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "maintenance_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_templates: {
        Row: {
          contract_id: string | null
          created_at: string
          created_by: string | null
          default_executor_id: string | null
          default_responsible_id: string | null
          description: string | null
          frequency: Database["public"]["Enums"]["maintenance_frequency"] | null
          id: string
          is_active: boolean
          name: string
          organization_id: string | null
          signatory_executor_label: string | null
          signatory_responsible_label: string | null
          site_id: string | null
          template_file_name: string | null
          template_file_path: string | null
          updated_at: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          default_executor_id?: string | null
          default_responsible_id?: string | null
          description?: string | null
          frequency?:
            | Database["public"]["Enums"]["maintenance_frequency"]
            | null
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string | null
          signatory_executor_label?: string | null
          signatory_responsible_label?: string | null
          site_id?: string | null
          template_file_name?: string | null
          template_file_path?: string | null
          updated_at?: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          default_executor_id?: string | null
          default_responsible_id?: string | null
          description?: string | null
          frequency?:
            | Database["public"]["Enums"]["maintenance_frequency"]
            | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string | null
          signatory_executor_label?: string | null
          signatory_responsible_label?: string | null
          site_id?: string | null
          template_file_name?: string | null
          template_file_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocol_templates_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_templates_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_uploads: {
        Row: {
          filename: string | null
          folder: string | null
          id: string
          meta: Json | null
          protocol_id: string
          storage: string
          uploaded_at: string
          uploaded_by: string | null
          url: string | null
        }
        Insert: {
          filename?: string | null
          folder?: string | null
          id?: string
          meta?: Json | null
          protocol_id: string
          storage?: string
          uploaded_at?: string
          uploaded_by?: string | null
          url?: string | null
        }
        Update: {
          filename?: string | null
          folder?: string | null
          id?: string
          meta?: Json | null
          protocol_id?: string
          storage?: string
          uploaded_at?: string
          uploaded_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protocol_uploads_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "maintenance_protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_graphs: {
        Row: {
          aggregation: string | null
          chart_type: string
          config: Json | null
          created_at: string
          description: string | null
          host_ids: Json
          id: string
          is_shared: boolean
          is_template: boolean
          item_keys: Json
          name: string
          time_range: string
          tz_requirement_codes: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aggregation?: string | null
          chart_type?: string
          config?: Json | null
          created_at?: string
          description?: string | null
          host_ids?: Json
          id?: string
          is_shared?: boolean
          is_template?: boolean
          item_keys?: Json
          name: string
          time_range?: string
          tz_requirement_codes?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aggregation?: string | null
          chart_type?: string
          config?: Json | null
          created_at?: string
          description?: string | null
          host_ids?: Json
          id?: string
          is_shared?: boolean
          is_template?: boolean
          item_keys?: Json
          name?: string
          time_range?: string
          tz_requirement_codes?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          organization: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_scheme_lines: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          fallback_engineer_name: string | null
          fallback_engineer_phone: string | null
          id: string
          line_name: string
          line_number: string | null
          position: number
          primary_engineer_name: string | null
          primary_engineer_phone: string | null
          scheme_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          fallback_engineer_name?: string | null
          fallback_engineer_phone?: string | null
          id?: string
          line_name: string
          line_number?: string | null
          position?: number
          primary_engineer_name?: string | null
          primary_engineer_phone?: string | null
          scheme_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          fallback_engineer_name?: string | null
          fallback_engineer_phone?: string | null
          id?: string
          line_name?: string
          line_number?: string | null
          position?: number
          primary_engineer_name?: string | null
          primary_engineer_phone?: string | null
          scheme_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_scheme_lines_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "support_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      support_schemes: {
        Row: {
          contractor_responsible_name: string | null
          contractor_responsible_phone: string | null
          contractor_responsible_role: string | null
          created_at: string
          customer_responsible_name: string | null
          customer_responsible_phone: string | null
          customer_responsible_role: string | null
          escalation_name: string | null
          escalation_phone: string | null
          escalation_role: string | null
          hotline_city: string | null
          hotline_mobile: string | null
          id: string
          ivr_after_hours: string | null
          ivr_business_hours: string | null
          organization_id: string
          sla_note: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          contractor_responsible_name?: string | null
          contractor_responsible_phone?: string | null
          contractor_responsible_role?: string | null
          created_at?: string
          customer_responsible_name?: string | null
          customer_responsible_phone?: string | null
          customer_responsible_role?: string | null
          escalation_name?: string | null
          escalation_phone?: string | null
          escalation_role?: string | null
          hotline_city?: string | null
          hotline_mobile?: string | null
          id?: string
          ivr_after_hours?: string | null
          ivr_business_hours?: string | null
          organization_id: string
          sla_note?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          contractor_responsible_name?: string | null
          contractor_responsible_phone?: string | null
          contractor_responsible_role?: string | null
          created_at?: string
          customer_responsible_name?: string | null
          customer_responsible_phone?: string | null
          customer_responsible_role?: string | null
          escalation_name?: string | null
          escalation_phone?: string | null
          escalation_role?: string | null
          hotline_city?: string | null
          hotline_mobile?: string | null
          id?: string
          ivr_after_hours?: string | null
          ivr_business_hours?: string | null
          organization_id?: string
          sla_note?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_schemes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_kill_log: {
        Row: {
          created_at: string
          details: string | null
          id: string
          status: string
          triggered_by: string | null
          triggered_email: string | null
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          status: string
          triggered_by?: string | null
          triggered_email?: string | null
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          status?: string
          triggered_by?: string | null
          triggered_email?: string | null
        }
        Relationships: []
      }
      ticket_ai_analyses: {
        Row: {
          analysis: Json
          created_at: string
          id: string
          model: string | null
          ticket_id: string
          updated_at: string
        }
        Insert: {
          analysis: Json
          created_at?: string
          id?: string
          model?: string | null
          ticket_id: string
          updated_at?: string
        }
        Update: {
          analysis?: Json
          created_at?: string
          id?: string
          model?: string | null
          ticket_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          emoji: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "ticket_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          attachments: Json
          body_format: string
          content: string
          created_at: string
          edited_at: string | null
          id: string
          is_internal: boolean | null
          mentions: string[]
          parent_id: string | null
          ticket_id: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          body_format?: string
          content: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_internal?: boolean | null
          mentions?: string[]
          parent_id?: string | null
          ticket_id: string
          user_id: string
        }
        Update: {
          attachments?: Json
          body_format?: string
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_internal?: boolean | null
          mentions?: string[]
          parent_id?: string | null
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ticket_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["ticket_link_kind"]
          note: string | null
          source_ticket_id: string
          target_ticket_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ticket_link_kind"]
          note?: string | null
          source_ticket_id: string
          target_ticket_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ticket_link_kind"]
          note?: string | null
          source_ticket_id?: string
          target_ticket_id?: string
        }
        Relationships: []
      }
      ticket_status_history: {
        Row: {
          changed_by: string
          changed_by_name: string | null
          comment: string | null
          created_at: string
          id: string
          new_status: string
          old_status: string | null
          ticket_id: string
        }
        Insert: {
          changed_by: string
          changed_by_name?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          new_status: string
          old_status?: string | null
          ticket_id: string
        }
        Update: {
          changed_by?: string
          changed_by_name?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          new_status?: string
          old_status?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_status_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          description: string | null
          equipment_id: string | null
          first_response_at: string | null
          id: string
          incident_category: string | null
          organization_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          product_code: string | null
          request_type: string | null
          resolved_at: string | null
          site_id: string | null
          sla_deadline: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subcategory: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          equipment_id?: string | null
          first_response_at?: string | null
          id?: string
          incident_category?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          product_code?: string | null
          request_type?: string | null
          resolved_at?: string | null
          site_id?: string | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategory?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          equipment_id?: string | null
          first_response_at?: string | null
          id?: string
          incident_category?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          product_code?: string | null
          request_type?: string | null
          resolved_at?: string | null
          site_id?: string | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategory?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      tz_coverage: {
        Row: {
          created_at: string
          host_id: string | null
          id: string
          notes: string | null
          related_items: Json | null
          requirement_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          host_id?: string | null
          id?: string
          notes?: string | null
          related_items?: Json | null
          requirement_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          host_id?: string | null
          id?: string
          notes?: string | null
          related_items?: Json | null
          requirement_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tz_coverage_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "monitored_hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tz_coverage_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "tz_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      tz_requirements: {
        Row: {
          category: string | null
          check_type: string | null
          code: string
          created_at: string
          id: string
          notes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          check_type?: string | null
          code: string
          created_at?: string
          id?: string
          notes?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          check_type?: string | null
          code?: string
          created_at?: string
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_dashboard_widgets: {
        Row: {
          config: Json
          created_at: string
          id: string
          position: number
          title: string
          updated_at: string
          user_id: string
          widget_type: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          position?: number
          title: string
          updated_at?: string
          user_id: string
          widget_type: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
          widget_type?: string
        }
        Relationships: []
      }
      user_favorite_metrics: {
        Row: {
          created_at: string
          host_name: string
          id: string
          item_key: string
          item_name: string
          itemid: string
          position: number
          units: string | null
          user_id: string
          zabbix_host_id: string
        }
        Insert: {
          created_at?: string
          host_name: string
          id?: string
          item_key: string
          item_name: string
          itemid: string
          position?: number
          units?: string | null
          user_id: string
          zabbix_host_id: string
        }
        Update: {
          created_at?: string
          host_name?: string
          id?: string
          item_key?: string
          item_name?: string
          itemid?: string
          position?: number
          units?: string | null
          user_id?: string
          zabbix_host_id?: string
        }
        Relationships: []
      }
      user_metric_preferences: {
        Row: {
          created_at: string
          display_language: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_language?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_language?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_module_permissions: {
        Row: {
          created_at: string
          id: string
          module_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module_key?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      zabbix_connections: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          organization_id: string
          updated_at: string
          updated_by: string | null
          vpn_info: string | null
          zabbix_password: string
          zabbix_url: string
          zabbix_user: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
          vpn_info?: string | null
          zabbix_password: string
          zabbix_url: string
          zabbix_user: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
          vpn_info?: string | null
          zabbix_password?: string
          zabbix_url?: string
          zabbix_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "zabbix_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      zabbix_template_library: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          imported_from: string | null
          name: string
          source: string
          source_url: string | null
          tags: Json
          updated_at: string
          yaml_content: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          imported_from?: string | null
          name: string
          source?: string
          source_url?: string | null
          tags?: Json
          updated_at?: string
          yaml_content?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          imported_from?: string | null
          name?: string
          source?: string
          source_url?: string | null
          tags?: Json
          updated_at?: string
          yaml_content?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      force_delete_organization: { Args: { _org_id: string }; Returns: Json }
      get_tables_list: {
        Args: never
        Returns: {
          columns_count: number
          table_name: string
          total_size: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_chat_participant: {
        Args: { _thread: string; _user: string }
        Returns: boolean
      }
      preview_organization_cascade: { Args: { _org_id: string }; Returns: Json }
      set_notification_channels_enabled: {
        Args: { _channel_ids: string[]; _enabled: boolean }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "engineer" | "customer"
      device_type:
        | "server"
        | "bmc"
        | "switch"
        | "storage"
        | "firewall"
        | "ups"
        | "router"
        | "other"
      maintenance_frequency:
        | "daily"
        | "weekly"
        | "monthly"
        | "quarterly"
        | "semi_annual"
        | "on_request"
      monitoring_protocol: "SNMP" | "IPMI" | "SSH" | "HTTP" | "HTTPS" | "Agent"
      problem_flag_level: "important" | "attention" | "minor"
      protocol_status: "pending" | "in_progress" | "completed" | "overdue"
      ticket_link_kind:
        | "related"
        | "duplicate"
        | "parent"
        | "child"
        | "blocks"
        | "blocked_by"
      ticket_priority: "P1" | "P2" | "P3" | "P4"
      ticket_status:
        | "open"
        | "in_progress"
        | "waiting"
        | "overdue"
        | "resolved"
        | "closed"
        | "assigned"
        | "cancelled"
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
      app_role: ["admin", "engineer", "customer"],
      device_type: [
        "server",
        "bmc",
        "switch",
        "storage",
        "firewall",
        "ups",
        "router",
        "other",
      ],
      maintenance_frequency: [
        "daily",
        "weekly",
        "monthly",
        "quarterly",
        "semi_annual",
        "on_request",
      ],
      monitoring_protocol: ["SNMP", "IPMI", "SSH", "HTTP", "HTTPS", "Agent"],
      problem_flag_level: ["important", "attention", "minor"],
      protocol_status: ["pending", "in_progress", "completed", "overdue"],
      ticket_link_kind: [
        "related",
        "duplicate",
        "parent",
        "child",
        "blocks",
        "blocked_by",
      ],
      ticket_priority: ["P1", "P2", "P3", "P4"],
      ticket_status: [
        "open",
        "in_progress",
        "waiting",
        "overdue",
        "resolved",
        "closed",
        "assigned",
        "cancelled",
      ],
    },
  },
} as const
