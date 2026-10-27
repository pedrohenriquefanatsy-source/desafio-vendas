// Gerado a partir do banco de TESTE (Supabase → generate_typescript_types), em forma
// compacta: sem os detalhes de relacionamento (as telas leem as views de cálculo).
// Não edite à mão: gere de novo depois de cada migration.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          em: string
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
          taxa_percentual: number
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
      insumo_conversoes: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          criado_em: string
          criado_por: string | null
          id: string
          insumo_id: string
          quantidade_em_base: number
          unidade: string
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          insumo_id: string
          quantidade_em_base: number
          unidade: string
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          insumo_id?: string
          quantidade_em_base?: number
          unidade?: string
        }
        Relationships: []
      }
      insumo_custos_historico: {
        Row: {
          custo_por_base: number | null
          id: number
          insumo_id: string
          origem: string
          preco_referencia: number | null
          registrado_em: string
          registrado_por: string | null
          unidade_referencia: string | null
        }
        Insert: {
          custo_por_base?: number | null
          id?: never
          insumo_id: string
          origem: string
          preco_referencia?: number | null
          registrado_em: string
          registrado_por?: string | null
          unidade_referencia?: string | null
        }
        Update: {
          custo_por_base?: number | null
          id?: never
          insumo_id?: string
          origem?: string
          preco_referencia?: number | null
          registrado_em?: string
          registrado_por?: string | null
          unidade_referencia?: string | null
        }
        Relationships: []
      }
      insumos: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          ativo: boolean
          criado_em: string
          criado_por: string | null
          custo_atual: number | null
          estoque_minimo: number | null
          fornecedor: string | null
          id: string
          nome: string
          preco_referencia: number | null
          tipo: Database["public"]["Enums"]["tipo_insumo"]
          unidade_base: string
          unidade_referencia: string | null
          validade: string | null
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          ativo?: boolean
          criado_em?: string
          criado_por?: string | null
          custo_atual?: number | null
          estoque_minimo?: number | null
          fornecedor?: string | null
          id?: string
          nome: string
          preco_referencia?: number | null
          tipo?: Database["public"]["Enums"]["tipo_insumo"]
          unidade_base: string
          unidade_referencia?: string | null
          validade?: string | null
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          ativo?: boolean
          criado_em?: string
          criado_por?: string | null
          custo_atual?: number | null
          estoque_minimo?: number | null
          fornecedor?: string | null
          id?: string
          nome?: string
          preco_referencia?: number | null
          tipo?: Database["public"]["Enums"]["tipo_insumo"]
          unidade_base?: string
          unidade_referencia?: string | null
          validade?: string | null
        }
        Relationships: []
      }
      kit_componentes: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          componente_variacao_id: string
          criado_em: string
          criado_por: string | null
          id: string
          kit_variacao_id: string
          quantidade: number
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          componente_variacao_id: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          kit_variacao_id: string
          quantidade: number
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          componente_variacao_id?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          kit_variacao_id?: string
          quantidade?: number
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
          id?: string
          nome?: string | null
          papel: Database["public"]["Enums"]["papel"]
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
      produtos: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          apelidos: string[]
          ativo: boolean
          categoria: string | null
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
          ordem: number
          tipo: Database["public"]["Enums"]["tipo_produto"]
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          apelidos?: string[]
          ativo?: boolean
          categoria?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome: string
          ordem?: number
          tipo?: Database["public"]["Enums"]["tipo_produto"]
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          apelidos?: string[]
          ativo?: boolean
          categoria?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string
          ordem?: number
          tipo?: Database["public"]["Enums"]["tipo_produto"]
        }
        Relationships: []
      }
      receita_itens: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          criado_em: string
          criado_por: string | null
          id: string
          insumo_id: string
          quantidade: number
          receita_id: string
          unidade: string
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          insumo_id: string
          quantidade: number
          receita_id: string
          unidade: string
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          insumo_id?: string
          quantidade?: number
          receita_id?: string
          unidade?: string
        }
        Relationships: []
      }
      receitas: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          ativa: boolean
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
          observacao: string | null
          rendimento_unidades: number
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          ativa?: boolean
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome: string
          observacao?: string | null
          rendimento_unidades: number
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          ativa?: boolean
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          rendimento_unidades?: number
        }
        Relationships: []
      }
      unidades: {
        Row: {
          codigo: string
          dimensao: Database["public"]["Enums"]["dimensao"]
          fator_para_base: number
          nome: string
        }
        Insert: {
          codigo: string
          dimensao: Database["public"]["Enums"]["dimensao"]
          fator_para_base: number
          nome: string
        }
        Update: {
          codigo?: string
          dimensao?: Database["public"]["Enums"]["dimensao"]
          fator_para_base?: number
          nome?: string
        }
        Relationships: []
      }
      variacao_embalagens: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          criado_em: string
          criado_por: string | null
          id: string
          insumo_id: string
          quantidade: number
          unidade: string
          variacao_id: string
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          insumo_id: string
          quantidade: number
          unidade: string
          variacao_id: string
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          insumo_id?: string
          quantidade?: number
          unidade?: string
          variacao_id?: string
        }
        Relationships: []
      }
      variacoes: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          ativa: boolean
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
          ordem: number
          preco_venda: number
          produto_id: string
          receita_id: string | null
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
          preco_venda: number
          produto_id: string
          receita_id?: string | null
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
          preco_venda?: number
          produto_id?: string
          receita_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_custo_embalagens: {
        Row: {
          custo: number | null
          id: string | null
          insumo: string | null
          insumo_id: string | null
          quantidade: number | null
          sem_preco: boolean | null
          unidade: string | null
          unidade_base: string | null
          variacao_id: string | null
        }
        Relationships: []
      }
      v_custo_receita_itens: {
        Row: {
          custo: number | null
          custo_atual: number | null
          id: string | null
          insumo: string | null
          insumo_id: string | null
          quantidade: number | null
          quantidade_base: number | null
          receita_id: string | null
          tipo: Database["public"]["Enums"]["tipo_insumo"] | null
          unidade: string | null
          unidade_base: string | null
        }
        Relationships: []
      }
      v_custo_receitas: {
        Row: {
          ativa: boolean | null
          custo_por_unidade: number | null
          custo_receita: number | null
          insumos_sem_preco: string | null
          itens: number | null
          itens_sem_preco: number | null
          nome: string | null
          receita_id: string | null
          rendimento_unidades: number | null
        }
        Relationships: []
      }
      v_custo_variacoes: {
        Row: {
          ativa: boolean | null
          categoria: string | null
          custo_unitario: number | null
          kit_sem_componentes: boolean | null
          markup: number | null
          mc_percentual: number | null
          mc_unitaria: number | null
          ordem: number | null
          ordem_produto: number | null
          preco_venda: number | null
          produto: string | null
          produto_id: string | null
          receita_id: string | null
          sem_preco: boolean | null
          sem_receita: boolean | null
          tipo: Database["public"]["Enums"]["tipo_produto"] | null
          variacao: string | null
          variacao_id: string | null
        }
        Relationships: []
      }
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
      v_margem_formas: {
        Row: {
          forma_pagamento: string | null
          forma_pagamento_id: string | null
          mc_unitaria: number | null
          taxa_percentual: number | null
          taxa_valor: number | null
          variacao_id: string | null
        }
        Relationships: []
      }
      v_unidades_insumo: {
        Row: {
          insumo_id: string | null
          personalizada: boolean | null
          quantidade_em_base: number | null
          unidade: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_atualizar_participante: {
        Args: { p_ativo: boolean; p_id: string; p_nome: string; p_papel: Database["public"]["Enums"]["papel"] }
        Returns: undefined
      }
      definir_custo_insumo: { Args: { p_insumo: string; p_preco: number; p_unidade: string }; Returns: undefined }
      definir_meu_nome: { Args: { p_nome: string }; Returns: undefined }
    }
    Enums: {
      dimensao: "massa" | "volume" | "contagem"
      papel: "administrador" | "membro"
      situacao_desafio: "planejado" | "em_andamento" | "encerrado"
      tipo_insumo: "ingrediente" | "embalagem" | "outro"
      tipo_produto: "simples" | "kit"
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
