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
  public: {
    Tables: {
      app_settings: {
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
      bookmakers: {
        Row: {
          address: string
          created_at: string
          deposit_enabled: boolean
          deposit_fee_percent: number
          id: string
          is_active: boolean
          logo_url: string | null
          max_amount: number
          min_amount: number
          name: string
          sort_order: number
          withdraw_enabled: boolean
          withdraw_fee_percent: number
        }
        Insert: {
          address?: string
          created_at?: string
          deposit_enabled?: boolean
          deposit_fee_percent?: number
          id: string
          is_active?: boolean
          logo_url?: string | null
          max_amount?: number
          min_amount?: number
          name: string
          sort_order?: number
          withdraw_enabled?: boolean
          withdraw_fee_percent?: number
        }
        Update: {
          address?: string
          created_at?: string
          deposit_enabled?: boolean
          deposit_fee_percent?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          max_amount?: number
          min_amount?: number
          name?: string
          sort_order?: number
          withdraw_enabled?: boolean
          withdraw_fee_percent?: number
        }
        Relationships: []
      }
      tg_users: {
        Row: {
          balance: number
          created_at: string
          first_name: string | null
          id: number
          is_blocked: boolean
          lang: string
          lang_chosen: boolean
          last_name: string | null
          last_seen_at: string
          phone: string | null
          photo_url: string | null
          referral_earned: number
          referrer_id: number | null
          username: string | null
        }
        Insert: {
          balance?: number
          created_at?: string
          first_name?: string | null
          id: number
          is_blocked?: boolean
          lang?: string
          lang_chosen?: boolean
          last_name?: string | null
          last_seen_at?: string
          phone?: string | null
          photo_url?: string | null
          referral_earned?: number
          referrer_id?: number | null
          username?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          first_name?: string | null
          id?: number
          is_blocked?: boolean
          lang?: string
          lang_chosen?: boolean
          last_name?: string | null
          last_seen_at?: string
          phone?: string | null
          photo_url?: string | null
          referral_earned?: number
          referrer_id?: number | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tg_users_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          admin_note: string | null
          amount: number
          bonus: number
          bookmaker_id: string | null
          card_number: string | null
          created_at: string
          fee: number
          id: string
          number: number
          processed_at: string | null
          receipt_path: string | null
          status: Database["public"]["Enums"]["tx_status"]
          type: Database["public"]["Enums"]["tx_type"]
          user_id: number
          withdraw_code: string | null
        }
        Insert: {
          account_id?: string | null
          admin_note?: string | null
          amount?: number
          bonus?: number
          bookmaker_id?: string | null
          card_number?: string | null
          created_at?: string
          fee?: number
          id?: string
          number?: number
          processed_at?: string | null
          receipt_path?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          type: Database["public"]["Enums"]["tx_type"]
          user_id: number
          withdraw_code?: string | null
        }
        Update: {
          account_id?: string | null
          admin_note?: string | null
          amount?: number
          bonus?: number
          bookmaker_id?: string | null
          card_number?: string | null
          created_at?: string
          fee?: number
          id?: string
          number?: number
          processed_at?: string | null
          receipt_path?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          type?: Database["public"]["Enums"]["tx_type"]
          user_id?: number
          withdraw_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          slot: string
          storage_path: string | null
          tg_file_id: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          slot: string
          storage_path?: string | null
          tg_file_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          slot?: string
          storage_path?: string | null
          tg_file_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_balance: {
        Args: { p_delta: number; p_note: string; p_user_id: number }
        Returns: number
      }
      approve_transaction: {
        Args: {
          p_amount: number
          p_fee_percent: number
          p_note: string
          p_referral_percent: number
          p_tx_id: string
        }
        Returns: {
          account_id: string | null
          admin_note: string | null
          amount: number
          bonus: number
          bookmaker_id: string | null
          card_number: string | null
          created_at: string
          fee: number
          id: string
          number: number
          processed_at: string | null
          receipt_path: string | null
          status: Database["public"]["Enums"]["tx_status"]
          type: Database["public"]["Enums"]["tx_type"]
          user_id: number
          withdraw_code: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_debit_request: {
        Args: {
          p_account_id: string
          p_amount: number
          p_bonus: number
          p_bookmaker_id: string
          p_card_number: string
          p_fee: number
          p_type: Database["public"]["Enums"]["tx_type"]
          p_user_id: number
        }
        Returns: {
          account_id: string | null
          admin_note: string | null
          amount: number
          bonus: number
          bookmaker_id: string | null
          card_number: string | null
          created_at: string
          fee: number
          id: string
          number: number
          processed_at: string | null
          receipt_path: string | null
          status: Database["public"]["Enums"]["tx_status"]
          type: Database["public"]["Enums"]["tx_type"]
          user_id: number
          withdraw_code: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_transaction: {
        Args: { p_note: string; p_tx_id: string }
        Returns: {
          account_id: string | null
          admin_note: string | null
          amount: number
          bonus: number
          bookmaker_id: string | null
          card_number: string | null
          created_at: string
          fee: number
          id: string
          number: number
          processed_at: string | null
          receipt_path: string | null
          status: Database["public"]["Enums"]["tx_status"]
          type: Database["public"]["Enums"]["tx_type"]
          user_id: number
          withdraw_code: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      tx_status: "pending" | "approved" | "rejected"
      tx_type:
        | "wallet_topup"
        | "card_withdraw"
        | "bk_deposit"
        | "bk_withdraw"
        | "referral_bonus"
        | "adjustment"
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
  public: {
    Enums: {
      tx_status: ["pending", "approved", "rejected"],
      tx_type: [
        "wallet_topup",
        "card_withdraw",
        "bk_deposit",
        "bk_withdraw",
        "referral_bonus",
        "adjustment",
      ],
    },
  },
} as const
