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
      favorites: {
        Row: {
          created_at: string
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          recipe_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      food_measures: {
        Row: {
          food_id: number
          grams: number
          id: number
          source: string
          unit: string
        }
        Insert: {
          food_id: number
          grams: number
          id?: never
          source?: string
          unit: string
        }
        Update: {
          food_id?: number
          grams?: number
          id?: never
          source?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_measures_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          aliases: string[]
          category: string | null
          id: number
          name_en: string | null
          name_no: string
          source: string
        }
        Insert: {
          aliases?: string[]
          category?: string | null
          id?: never
          name_en?: string | null
          name_no: string
          source?: string
        }
        Update: {
          aliases?: string[]
          category?: string | null
          id?: never
          name_en?: string | null
          name_no?: string
          source?: string
        }
        Relationships: []
      }
      import_log: {
        Row: {
          created_at: string
          id: number
          model: string
          ok: boolean
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          model: string
          ok?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          model?: string
          ok?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_groups: {
        Row: {
          id: number
          name: string | null
          position: number
          recipe_id: string
        }
        Insert: {
          id?: never
          name?: string | null
          position?: number
          recipe_id: string
        }
        Update: {
          id?: never
          name?: string | null
          position?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_groups_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          amount: number | null
          amount_max: number | null
          food_id: number | null
          group_id: number
          id: number
          name: string
          note: string | null
          original_amount: number | null
          original_text: string
          original_unit: string | null
          position: number
          scalable: boolean
          unit: string | null
        }
        Insert: {
          amount?: number | null
          amount_max?: number | null
          food_id?: number | null
          group_id: number
          id?: never
          name: string
          note?: string | null
          original_amount?: number | null
          original_text: string
          original_unit?: string | null
          position?: number
          scalable?: boolean
          unit?: string | null
        }
        Update: {
          amount?: number | null
          amount_max?: number | null
          food_id?: number | null
          group_id?: number
          id?: never
          name?: string
          note?: string | null
          original_amount?: number | null
          original_text?: string
          original_unit?: string | null
          position?: number
          scalable?: boolean
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "ingredient_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_admin: boolean
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          is_admin?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
      recipes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          import_raw_text: string | null
          original_language: string | null
          owner_id: string
          parent_id: string | null
          prep_minutes: number | null
          servings: number | null
          servings_unit: string | null
          source_site: string | null
          source_url: string | null
          tags: string[]
          tips: string[]
          title: string
          total_minutes: number | null
          updated_at: string
          visibility: string
          was_translated: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          import_raw_text?: string | null
          original_language?: string | null
          owner_id: string
          parent_id?: string | null
          prep_minutes?: number | null
          servings?: number | null
          servings_unit?: string | null
          source_site?: string | null
          source_url?: string | null
          tags?: string[]
          tips?: string[]
          title: string
          total_minutes?: number | null
          updated_at?: string
          visibility?: string
          was_translated?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          import_raw_text?: string | null
          original_language?: string | null
          owner_id?: string
          parent_id?: string | null
          prep_minutes?: number | null
          servings?: number | null
          servings_unit?: string | null
          source_site?: string | null
          source_url?: string | null
          tags?: string[]
          tips?: string[]
          title?: string
          total_minutes?: number | null
          updated_at?: string
          visibility?: string
          was_translated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "recipes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      steps: {
        Row: {
          group_name: string | null
          id: number
          position: number
          recipe_id: string
          text: string
        }
        Insert: {
          group_name?: string | null
          id?: never
          position?: number
          recipe_id: string
          text: string
        }
        Update: {
          group_name?: string | null
          id?: never
          position?: number
          recipe_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          id: string
          import_count: number
          is_admin: boolean
          last_sign_in_at: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      owns_recipe: { Args: { recipe_id: string }; Returns: boolean }
      save_recipe: { Args: { payload: Json }; Returns: string }
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
