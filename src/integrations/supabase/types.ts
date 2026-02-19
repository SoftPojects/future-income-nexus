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
      agent_logs: {
        Row: {
          created_at: string
          id: number
          message: string
        }
        Insert: {
          created_at?: string
          id?: never
          message: string
        }
        Update: {
          created_at?: string
          id?: never
          message?: string
        }
        Relationships: []
      }
      agent_state: {
        Row: {
          agent_status: string
          current_strategy: string
          energy_level: number
          id: string
          total_hustled: number
          updated_at: string
        }
        Insert: {
          agent_status?: string
          current_strategy?: string
          energy_level?: number
          id?: string
          total_hustled?: number
          updated_at?: string
        }
        Update: {
          agent_status?: string
          current_strategy?: string
          energy_level?: number
          id?: string
          total_hustled?: number
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: number
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: never
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: never
          role?: string
        }
        Relationships: []
      }
      daily_social_quota: {
        Row: {
          date: string
          follows_count: number
          follows_limit: number
          id: string
          likes_count: number
          likes_limit: number
          updated_at: string
        }
        Insert: {
          date?: string
          follows_count?: number
          follows_limit?: number
          id?: string
          likes_count?: number
          likes_limit?: number
          updated_at?: string
        }
        Update: {
          date?: string
          follows_count?: number
          follows_limit?: number
          id?: string
          likes_count?: number
          likes_limit?: number
          updated_at?: string
        }
        Relationships: []
      }
      donations: {
        Row: {
          amount_sol: number
          created_at: string
          id: string
          tx_signature: string | null
          wallet_address: string
        }
        Insert: {
          amount_sol: number
          created_at?: string
          id?: string
          tx_signature?: string | null
          wallet_address: string
        }
        Update: {
          amount_sol?: number
          created_at?: string
          id?: string
          tx_signature?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      global_messages: {
        Row: {
          content: string
          created_at: string
          display_name: string
          id: string
          is_holder: boolean
          wallet_address: string | null
        }
        Insert: {
          content: string
          created_at?: string
          display_name?: string
          id?: string
          is_holder?: boolean
          wallet_address?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          display_name?: string
          id?: string
          is_holder?: boolean
          wallet_address?: string | null
        }
        Relationships: []
      }
      leaderboard: {
        Row: {
          agent_name: string
          avatar_emoji: string
          created_at: string
          id: string
          is_player: boolean
          total_hustled: number
        }
        Insert: {
          agent_name: string
          avatar_emoji?: string
          created_at?: string
          id?: string
          is_player?: boolean
          total_hustled?: number
        }
        Update: {
          agent_name?: string
          avatar_emoji?: string
          created_at?: string
          id?: string
          is_player?: boolean
          total_hustled?: number
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          audio_url: string | null
          created_at: string
          error_message: string | null
          id: string
          image_url: string | null
          status: string
          tweet_id: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          image_url?: string | null
          status?: string
          tweet_id?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          image_url?: string | null
          status?: string
          tweet_id?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweet_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      social_logs: {
        Row: {
          action_type: string
          created_at: string
          id: string
          reason: string | null
          source: string
          target_handle: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          reason?: string | null
          source?: string
          target_handle: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          reason?: string | null
          source?: string
          target_handle?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      target_agents: {
        Row: {
          auto_follow: boolean
          created_at: string
          followed_at: string | null
          id: string
          is_active: boolean
          last_roasted_at: string | null
          priority: number
          source: string
          x_handle: string
        }
        Insert: {
          auto_follow?: boolean
          created_at?: string
          followed_at?: string | null
          id?: string
          is_active?: boolean
          last_roasted_at?: string | null
          priority?: number
          source?: string
          x_handle: string
        }
        Update: {
          auto_follow?: boolean
          created_at?: string
          followed_at?: string | null
          id?: string
          is_active?: boolean
          last_roasted_at?: string | null
          priority?: number
          source?: string
          x_handle?: string
        }
        Relationships: []
      }
      tweet_queue: {
        Row: {
          audio_url: string | null
          content: string
          created_at: string
          error_message: string | null
          id: string
          image_url: string | null
          model_used: string | null
          posted_at: string | null
          reply_to_tweet_id: string | null
          scheduled_at: string
          status: string
          type: string
        }
        Insert: {
          audio_url?: string | null
          content: string
          created_at?: string
          error_message?: string | null
          id?: string
          image_url?: string | null
          model_used?: string | null
          posted_at?: string | null
          reply_to_tweet_id?: string | null
          scheduled_at?: string
          status?: string
          type?: string
        }
        Update: {
          audio_url?: string | null
          content?: string
          created_at?: string
          error_message?: string | null
          id?: string
          image_url?: string | null
          model_used?: string | null
          posted_at?: string | null
          reply_to_tweet_id?: string | null
          scheduled_at?: string
          status?: string
          type?: string
        }
        Relationships: []
      }
      vip_reply_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          like_count: number | null
          likes_checked_at: string | null
          reply_sent: boolean
          reply_text: string
          tweet_content: string
          tweet_id: string
          tweet_url: string | null
          vip_handle: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          like_count?: number | null
          likes_checked_at?: string | null
          reply_sent?: boolean
          reply_text: string
          tweet_content: string
          tweet_id: string
          tweet_url?: string | null
          vip_handle: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          like_count?: number | null
          likes_checked_at?: string | null
          reply_sent?: boolean
          reply_text?: string
          tweet_content?: string
          tweet_id?: string
          tweet_url?: string | null
          vip_handle?: string
        }
        Relationships: []
      }
      vip_targets: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          last_checked_at: string | null
          last_replied_at: string | null
          last_tweet_id: string | null
          rotation_order: number | null
          x_handle: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_replied_at?: string | null
          last_tweet_id?: string | null
          rotation_order?: number | null
          x_handle: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_replied_at?: string | null
          last_tweet_id?: string | null
          rotation_order?: number | null
          x_handle?: string
        }
        Relationships: []
      }
      x_mentions: {
        Row: {
          author_handle: string
          content: string
          created_at: string
          id: string
          replied: boolean
        }
        Insert: {
          author_handle: string
          content: string
          created_at?: string
          id: string
          replied?: boolean
        }
        Update: {
          author_handle?: string
          content?: string
          created_at?: string
          id?: string
          replied?: boolean
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
    Enums: {},
  },
} as const
