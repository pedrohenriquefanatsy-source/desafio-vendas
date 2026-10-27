// Gerado a partir do banco de TESTE (Supabase → generate_typescript_types).
// Não edite à mão: gere de novo depois de cada migration.
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
      auditoria: {
        Row: {
          acao: string
          antes: Json | null
          depois: Json | null
          em: string
          id: number
          registro_id: string
          tabela: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          antes?: Json | null
          depois?: Json | null
          em?: string
          id?: never
          registro_id: string
          tabela: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          antes?: Json | null
          depois?: Json | null
          em?: string
          id?: never
          registro_id?: string
          tabela?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      desafios: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          chave_idempotencia: string | null
          criado_em: string
          criado_por: string | null
          fim: string
          id: string
          inicio: string
          meta_resultado: number | null
          meta_vendas: number | null
          nome: string
          situacao: Database["public"]["Enums"]["situacao_desafio"]
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          chave_idempotencia?: string | null
          criado_em?: string
          criado_por?: string | null
          fim: string
          id?: string
          inicio: string
          meta_resultado?: number | null
          meta_vendas?: number | null
          nome: string
          situacao?: Database["public"]["Enums"]["situacao_desafio"]
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          chave_idempotencia?: string | null
          criado_em?: string
          criado_por?: string | null
          fim?: string
          id?: string
          inicio?: string
          meta_resultado?: number | null
          meta_vendas?: number | null
          nome?: string
          situacao?: Database["public"]["Enums"]["situacao_desafio"]
        }
        Relationships: []
      }
      formas_pagamento: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          ativa: boolean
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
          ordem: number
          taxa_percentual: number
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          ativa?: boolean
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome: string
          ordem?: number
          taxa_percentual?: number
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          ativa?: boolean
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string
          ordem?: number
          taxa_percentual?: number
        }
        Relationships: []
      }
      perfis: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          ativo: boolean
          criado_em: string
          criado_por: string | null
          id: string
          nome: string | null
          papel: Database["public"]["Enums"]["papel"]
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          ativo?: boolean
          criado_em?: string
          criado_por?: string | null
          id: string
          nome?: string | null
          papel?: Database["public"]["Enums"]["papel"]
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          ativo?: boolean
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string | null
          papel?: Database["public"]["Enums"]["papel"]
        }
        Relationships: []
      }
    }
    Views: {
      v_desafios: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          chave_idempotencia: string | null
          criado_em: string | null
          criado_por: string | null
          dias_decorridos: number | null
          dias_restantes: number | null
          dias_total: number | null
          fim: string | null
          hoje: string | null
          id: string | null
          inicio: string | null
          meta_resultado: number | null
          meta_vendas: number | null
          nome: string | null
          situacao: Database["public"]["Enums"]["situacao_desafio"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_atualizar_participante: {
        Args: {
          p_ativo: boolean
          p_id: string
          p_nome: string
          p_papel: Database["public"]["Enums"]["papel"]
        }
        Returns: undefined
      }
      definir_meu_nome: { Args: { p_nome: string }; Returns: undefined }
    }
    Enums: {
      papel: "administrador" | "membro"
      situacao_desafio: "planejado" | "em_andamento" | "encerrado"
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
