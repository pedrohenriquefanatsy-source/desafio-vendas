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
      aportes: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          cancelado_em: string | null
          cancelado_por: string | null
          chave_idempotencia: string
          criado_em: string
          criado_por: string | null
          data: string
          desafio_id: string | null
          id: string
          motivo_cancelamento: string | null
          observacao: string | null
          origem: Database["public"]["Enums"]["origem_aporte"]
          participante_id: string | null
          situacao: Database["public"]["Enums"]["situacao_registro"]
          valor: number
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave_idempotencia: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          desafio_id?: string | null
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          origem: Database["public"]["Enums"]["origem_aporte"]
          participante_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          valor: number
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave_idempotencia?: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          desafio_id?: string | null
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          origem?: Database["public"]["Enums"]["origem_aporte"]
          participante_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          valor?: number
        }
        Relationships: []
      }
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
      compra_itens: {
        Row: {
          compra_id: string
          custo_por_base: number
          id: string
          insumo_id: string
          quantidade: number
          quantidade_base: number
          unidade: string
          valor: number
        }
        Insert: {
          compra_id: string
          custo_por_base: number
          id?: string
          insumo_id: string
          quantidade: number
          quantidade_base: number
          unidade: string
          valor: number
        }
        Update: {
          compra_id?: string
          custo_por_base?: number
          id?: string
          insumo_id?: string
          quantidade?: number
          quantidade_base?: number
          unidade?: string
          valor?: number
        }
        Relationships: []
      }
      compras: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          cancelado_em: string | null
          cancelado_por: string | null
          chave_idempotencia: string
          criado_em: string
          criado_por: string | null
          data: string
          desafio_id: string | null
          fornecedor: string | null
          id: string
          motivo_cancelamento: string | null
          observacao: string | null
          pago_por: Database["public"]["Enums"]["pago_por"]
          participante_id: string | null
          situacao: Database["public"]["Enums"]["situacao_registro"]
          total: number
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave_idempotencia: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          desafio_id?: string | null
          fornecedor?: string | null
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          pago_por: Database["public"]["Enums"]["pago_por"]
          participante_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          total: number
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave_idempotencia?: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          desafio_id?: string | null
          fornecedor?: string | null
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          pago_por?: Database["public"]["Enums"]["pago_por"]
          participante_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          total?: number
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
      despesas: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          cancelado_em: string | null
          cancelado_por: string | null
          categoria: string | null
          chave_idempotencia: string
          criado_em: string
          criado_por: string | null
          data: string
          desafio_id: string | null
          descricao: string
          id: string
          motivo_cancelamento: string | null
          pago_por: Database["public"]["Enums"]["pago_por"]
          participante_id: string | null
          situacao: Database["public"]["Enums"]["situacao_registro"]
          valor: number
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria?: string | null
          chave_idempotencia: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          desafio_id?: string | null
          descricao: string
          id?: string
          motivo_cancelamento?: string | null
          pago_por: Database["public"]["Enums"]["pago_por"]
          participante_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          valor: number
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria?: string | null
          chave_idempotencia?: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          desafio_id?: string | null
          descricao?: string
          id?: string
          motivo_cancelamento?: string | null
          pago_por?: Database["public"]["Enums"]["pago_por"]
          participante_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          valor?: number
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
          compra_id: string | null
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
          compra_id?: string | null
          custo_por_base?: number | null
          id?: never
          insumo_id: string
          origem?: string
          preco_referencia?: number | null
          registrado_em?: string
          registrado_por?: string | null
          unidade_referencia?: string | null
        }
        Update: {
          compra_id?: string | null
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
      lancamentos_caixa: {
        Row: {
          criado_em: string
          criado_por: string | null
          desafio_id: string | null
          descricao: string | null
          id: number
          origem_id: string | null
          origem_tipo: string | null
          tipo: Database["public"]["Enums"]["tipo_lancamento_caixa"]
          valor: number
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          desafio_id?: string | null
          descricao?: string | null
          id?: never
          origem_id?: string | null
          origem_tipo?: string | null
          tipo: Database["public"]["Enums"]["tipo_lancamento_caixa"]
          valor: number
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          desafio_id?: string | null
          descricao?: string | null
          id?: never
          origem_id?: string | null
          origem_tipo?: string | null
          tipo?: Database["public"]["Enums"]["tipo_lancamento_caixa"]
          valor?: number
        }
        Relationships: []
      }
      movimentos_estoque: {
        Row: {
          criado_em: string
          criado_por: string | null
          custo_unitario: number | null
          desafio_id: string | null
          id: number
          insumo_id: string | null
          justificativa: string | null
          origem_id: string | null
          origem_tipo: string | null
          quantidade_base: number
          tipo: Database["public"]["Enums"]["tipo_movimento"]
          variacao_id: string | null
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          custo_unitario?: number | null
          desafio_id?: string | null
          id?: never
          insumo_id?: string | null
          justificativa?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          quantidade_base: number
          tipo: Database["public"]["Enums"]["tipo_movimento"]
          variacao_id?: string | null
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          custo_unitario?: number | null
          desafio_id?: string | null
          id?: never
          insumo_id?: string | null
          justificativa?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          quantidade_base?: number
          tipo?: Database["public"]["Enums"]["tipo_movimento"]
          variacao_id?: string | null
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
      producoes: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          cancelado_em: string | null
          cancelado_por: string | null
          chave_idempotencia: string
          concluida_em: string | null
          concluida_por: string | null
          criado_em: string
          criado_por: string | null
          data_planejada: string | null
          desafio_id: string | null
          fornadas: number
          id: string
          motivo_cancelamento: string | null
          observacao: string | null
          receita_id: string
          situacao: Database["public"]["Enums"]["situacao_producao"]
          unidades_perdidas: number | null
          unidades_previstas: number
          unidades_produzidas: number | null
          variacao_id: string
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave_idempotencia: string
          concluida_em?: string | null
          concluida_por?: string | null
          criado_em?: string
          criado_por?: string | null
          data_planejada?: string | null
          desafio_id?: string | null
          fornadas: number
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          receita_id: string
          situacao?: Database["public"]["Enums"]["situacao_producao"]
          unidades_perdidas?: number | null
          unidades_previstas: number
          unidades_produzidas?: number | null
          variacao_id: string
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave_idempotencia?: string
          concluida_em?: string | null
          concluida_por?: string | null
          criado_em?: string
          criado_por?: string | null
          data_planejada?: string | null
          desafio_id?: string | null
          fornadas?: number
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          receita_id?: string
          situacao?: Database["public"]["Enums"]["situacao_producao"]
          unidades_perdidas?: number | null
          unidades_previstas?: number
          unidades_produzidas?: number | null
          variacao_id?: string
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
      recebimentos: {
        Row: {
          chave_idempotencia: string | null
          criado_em: string
          criado_por: string | null
          estorno_de: string | null
          forma_pagamento_id: string
          id: string
          recebido_em: string
          taxa_percentual: number
          taxa_valor: number
          valor: number
          venda_id: string
        }
        Insert: {
          chave_idempotencia?: string | null
          criado_em?: string
          criado_por?: string | null
          estorno_de?: string | null
          forma_pagamento_id: string
          id?: string
          recebido_em?: string
          taxa_percentual?: number
          taxa_valor?: number
          valor: number
          venda_id: string
        }
        Update: {
          chave_idempotencia?: string | null
          criado_em?: string
          criado_por?: string | null
          estorno_de?: string | null
          forma_pagamento_id?: string
          id?: string
          recebido_em?: string
          taxa_percentual?: number
          taxa_valor?: number
          valor?: number
          venda_id?: string
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
      reembolsos: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          cancelado_em: string | null
          cancelado_por: string | null
          chave_idempotencia: string
          criado_em: string
          criado_por: string | null
          data: string
          id: string
          motivo_cancelamento: string | null
          observacao: string | null
          participante_id: string
          situacao: Database["public"]["Enums"]["situacao_registro"]
          valor: number
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave_idempotencia: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          participante_id: string
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          valor: number
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave_idempotencia?: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          participante_id?: string
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          valor?: number
        }
        Relationships: []
      }
      saldos_estoque: {
        Row: {
          id: number
          insumo_id: string | null
          saldo: number
          variacao_id: string | null
        }
        Insert: {
          id?: never
          insumo_id?: string | null
          saldo?: number
          variacao_id?: string | null
        }
        Update: {
          id?: never
          insumo_id?: string | null
          saldo?: number
          variacao_id?: string | null
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
          nome?: string
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
      venda_itens: {
        Row: {
          custo_unitario_momento: number | null
          desconto_rateado: number
          id: string
          margem_contribuicao: number | null
          ordem: number
          preco_unitario: number
          quantidade: number
          taxa_rateada: number
          valor_bruto: number
          valor_liquido: number
          variacao_id: string
          venda_id: string
        }
        Insert: {
          custo_unitario_momento?: number | null
          desconto_rateado?: number
          id?: string
          margem_contribuicao?: number | null
          ordem?: number
          preco_unitario: number
          quantidade: number
          taxa_rateada?: number
          valor_bruto: number
          valor_liquido: number
          variacao_id: string
          venda_id: string
        }
        Update: {
          custo_unitario_momento?: number | null
          desconto_rateado?: number
          id?: string
          margem_contribuicao?: number | null
          ordem?: number
          preco_unitario?: number
          quantidade?: number
          taxa_rateada?: number
          valor_bruto?: number
          valor_liquido?: number
          variacao_id?: string
          venda_id?: string
        }
        Relationships: []
      }
      vendas: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          cancelado_em: string | null
          cancelado_por: string | null
          chave_idempotencia: string
          cliente: string | null
          criado_em: string
          criado_por: string | null
          data_hora: string
          desafio_id: string | null
          desconto: number
          entrega_prevista: string | null
          entregue_em: string | null
          estoque_baixado: boolean
          estoque_negativo_confirmado: boolean
          forma_pagamento_id: string | null
          id: string
          motivo_cancelamento: string | null
          numero: number
          observacao: string | null
          participante_id: string
          recebido: number
          reconhecida_em: string | null
          situacao: Database["public"]["Enums"]["situacao_registro"]
          situacao_entrega:
            | Database["public"]["Enums"]["situacao_entrega"]
            | null
          situacao_pagamento:
            | Database["public"]["Enums"]["situacao_pagamento"]
            | null
          subtotal: number
          taxa_percentual: number
          tipo: Database["public"]["Enums"]["tipo_venda"]
          total: number
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave_idempotencia: string
          cliente?: string | null
          criado_em?: string
          criado_por?: string | null
          data_hora?: string
          desafio_id?: string | null
          desconto?: number
          entrega_prevista?: string | null
          entregue_em?: string | null
          estoque_baixado?: boolean
          estoque_negativo_confirmado?: boolean
          forma_pagamento_id?: string | null
          id?: string
          motivo_cancelamento?: string | null
          numero?: never
          observacao?: string | null
          participante_id: string
          recebido?: number
          reconhecida_em?: string | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          situacao_entrega?:
            | Database["public"]["Enums"]["situacao_entrega"]
            | null
          situacao_pagamento?:
            | Database["public"]["Enums"]["situacao_pagamento"]
            | null
          subtotal: number
          taxa_percentual?: number
          tipo: Database["public"]["Enums"]["tipo_venda"]
          total: number
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave_idempotencia?: string
          cliente?: string | null
          criado_em?: string
          criado_por?: string | null
          data_hora?: string
          desafio_id?: string | null
          desconto?: number
          entrega_prevista?: string | null
          entregue_em?: string | null
          estoque_baixado?: boolean
          estoque_negativo_confirmado?: boolean
          forma_pagamento_id?: string | null
          id?: string
          motivo_cancelamento?: string | null
          numero?: never
          observacao?: string | null
          participante_id?: string
          recebido?: number
          reconhecida_em?: string | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          situacao_entrega?:
            | Database["public"]["Enums"]["situacao_entrega"]
            | null
          situacao_pagamento?:
            | Database["public"]["Enums"]["situacao_pagamento"]
            | null
          subtotal?: number
          taxa_percentual?: number
          tipo?: Database["public"]["Enums"]["tipo_venda"]
          total?: number
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
      v_estoque_insumos: {
        Row: {
          abaixo_minimo: boolean | null
          ativo: boolean | null
          custo_atual: number | null
          estoque_minimo: number | null
          insumo_id: string | null
          nome: string | null
          saldo: number | null
          tipo: Database["public"]["Enums"]["tipo_insumo"] | null
          unidade_base: string | null
          valor_estoque: number | null
        }
        Relationships: []
      }
      v_estoque_produtos: {
        Row: {
          ativa: boolean | null
          custo_unitario: number | null
          produto: string | null
          produto_id: string | null
          saldo: number | null
          tipo: Database["public"]["Enums"]["tipo_produto"] | null
          valor_estoque: number | null
          variacao: string | null
          variacao_id: string | null
        }
        Relationships: []
      }
      v_fluxo_caixa: {
        Row: {
          criado_em: string | null
          criado_por: string | null
          desafio_id: string | null
          descricao: string | null
          dia: string | null
          id: number | null
          origem_id: string | null
          origem_tipo: string | null
          quem: string | null
          saldo_apos: number | null
          tipo: Database["public"]["Enums"]["tipo_lancamento_caixa"] | null
          valor: number | null
        }
        Relationships: []
      }
      v_lista_compras: {
        Row: {
          custo_atual: number | null
          custo_estimado: number | null
          estoque_minimo: number | null
          falta: number | null
          insumo_id: string | null
          necessario_planejado: number | null
          nome: string | null
          saldo: number | null
          tipo: Database["public"]["Enums"]["tipo_insumo"] | null
          unidade_base: string | null
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
      v_producao_possivel: {
        Row: {
          ativa: boolean | null
          fornadas_possiveis: number | null
          insumo_limitante: string | null
          produto: string | null
          receita_id: string | null
          rendimento_unidades: number | null
          unidades_possiveis: number | null
          variacao: string | null
          variacao_id: string | null
        }
        Relationships: []
      }
      v_produtos_venda: {
        Row: {
          apelidos: string[] | null
          categoria: string | null
          custo_unitario: number | null
          estoque: number | null
          nome: string | null
          ordem: number | null
          ordem_produto: number | null
          preco_venda: number | null
          produto: string | null
          produto_id: string | null
          tipo: Database["public"]["Enums"]["tipo_produto"] | null
          variacao: string | null
          variacao_id: string | null
          vendidos: number | null
        }
        Relationships: []
      }
      v_reembolsos_devidos: {
        Row: {
          devido: number | null
          pago_do_bolso: number | null
          participante: string | null
          participante_id: string | null
          reembolsado: number | null
        }
        Relationships: []
      }
      v_resultado_diario: {
        Row: {
          custo_perdas: number | null
          desafio_id: string | null
          despesas: number | null
          dia: string | null
          margem_vendas: number | null
          resultado: number | null
          sem_custo: boolean | null
          unidades: number | null
          vendas: number | null
          vendido: number | null
        }
        Relationships: []
      }
      v_saldo_caixa: {
        Row: {
          entradas: number | null
          saidas: number | null
          saldo: number | null
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
      v_vendas: {
        Row: {
          a_receber: number | null
          cancelado_em: string | null
          cancelado_por: string | null
          cliente: string | null
          criado_em: string | null
          criado_por: string | null
          data_hora: string | null
          desafio_id: string | null
          desconto: number | null
          dia: string | null
          entrega_prevista: string | null
          entregue_em: string | null
          estoque_negativo_confirmado: boolean | null
          forma_pagamento: string | null
          forma_pagamento_id: string | null
          id: string | null
          itens_resumo: string | null
          margem_total: number | null
          motivo_cancelamento: string | null
          numero: number | null
          observacao: string | null
          participante: string | null
          participante_id: string | null
          recebido: number | null
          reconhecida_em: string | null
          sem_custo: boolean | null
          situacao: Database["public"]["Enums"]["situacao_registro"] | null
          situacao_entrega:
            | Database["public"]["Enums"]["situacao_entrega"]
            | null
          situacao_pagamento:
            | Database["public"]["Enums"]["situacao_pagamento"]
            | null
          subtotal: number | null
          taxa_percentual: number | null
          tipo: Database["public"]["Enums"]["tipo_venda"] | null
          total: number | null
          variacoes: string[] | null
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
      ajustar_caixa: {
        Args: {
          p_chave: string
          p_justificativa: string
          p_saldo_contado: number
        }
        Returns: number
      }
      ajustar_estoque: {
        Args: {
          p_chave: string
          p_contado: number
          p_insumo: string
          p_justificativa: string
          p_variacao: string
        }
        Returns: number
      }
      cancelar_aporte: {
        Args: { p_aporte: string; p_motivo: string }
        Returns: undefined
      }
      cancelar_compra: {
        Args: { p_compra: string; p_motivo: string }
        Returns: undefined
      }
      cancelar_despesa: {
        Args: { p_despesa: string; p_motivo: string }
        Returns: undefined
      }
      cancelar_producao: {
        Args: { p_motivo: string; p_producao: string }
        Returns: undefined
      }
      cancelar_reembolso: {
        Args: { p_motivo: string; p_reembolso: string }
        Returns: undefined
      }
      cancelar_venda: {
        Args: { p_motivo: string; p_venda: string }
        Returns: undefined
      }
      concluir_producao: {
        Args: {
          p_producao: string
          p_unidades_boas: number
          p_unidades_perdidas?: number
        }
        Returns: Json
      }
      definir_custo_insumo: {
        Args: { p_insumo: string; p_preco: number; p_unidade: string }
        Returns: undefined
      }
      definir_meu_nome: { Args: { p_nome: string }; Returns: undefined }
      entregar_encomenda: {
        Args: { p_confirmar_estoque?: boolean; p_venda: string }
        Returns: Json
      }
      marcar_encomenda_pronta: { Args: { p_venda: string }; Returns: undefined }
      pagar_reembolso: {
        Args: {
          p_chave: string
          p_observacao?: string
          p_participante: string
          p_valor: number
        }
        Returns: string
      }
      planejar_producao: {
        Args: {
          p_chave: string
          p_data?: string
          p_fornadas: number
          p_observacao?: string
          p_variacao: string
        }
        Returns: string
      }
      registrar_aporte: {
        Args: {
          p_chave: string
          p_observacao?: string
          p_origem: Database["public"]["Enums"]["origem_aporte"]
          p_participante: string
          p_valor: number
        }
        Returns: string
      }
      registrar_compra: {
        Args: {
          p_chave: string
          p_data?: string
          p_fornecedor?: string
          p_itens: Json
          p_observacao?: string
          p_pago_por: Database["public"]["Enums"]["pago_por"]
        }
        Returns: string
      }
      registrar_despesa: {
        Args: {
          p_categoria: string
          p_chave: string
          p_data?: string
          p_descricao: string
          p_pago_por: Database["public"]["Enums"]["pago_por"]
          p_valor: number
        }
        Returns: string
      }
      registrar_perda: {
        Args: {
          p_chave: string
          p_insumo: string
          p_motivo: string
          p_quantidade: number
          p_unidade: string
          p_variacao: string
        }
        Returns: undefined
      }
      registrar_recebimento: {
        Args: {
          p_chave: string
          p_forma: string
          p_valor: number
          p_venda: string
        }
        Returns: undefined
      }
      registrar_venda: {
        Args: {
          p_chave: string
          p_cliente?: string
          p_confirmar_estoque?: boolean
          p_desconto?: number
          p_entrega_prevista?: string
          p_forma?: string
          p_itens: Json
          p_observacao?: string
          p_tipo: Database["public"]["Enums"]["tipo_venda"]
          p_valor_recebido?: number
        }
        Returns: Json
      }
    }
    Enums: {
      dimensao: "massa" | "volume" | "contagem"
      origem_aporte: "participante" | "pj"
      pago_por: "caixa" | "participante"
      papel: "administrador" | "membro"
      situacao_desafio: "planejado" | "em_andamento" | "encerrado"
      situacao_entrega: "aguardando" | "pronta" | "entregue"
      situacao_pagamento: "paga" | "parcial" | "pendente"
      situacao_producao: "planejada" | "concluida" | "cancelada"
      situacao_registro: "ativa" | "cancelada"
      tipo_insumo: "ingrediente" | "embalagem" | "outro"
      tipo_lancamento_caixa:
        | "recebimento"
        | "taxa"
        | "compra"
        | "despesa"
        | "reembolso"
        | "aporte"
        | "ajuste"
        | "estorno"
      tipo_movimento:
        | "compra"
        | "consumo_producao"
        | "entrada_producao"
        | "venda"
        | "doacao"
        | "perda"
        | "ajuste"
        | "estorno"
      tipo_produto: "simples" | "kit"
      tipo_venda: "venda" | "encomenda" | "doacao"
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
      dimensao: ["massa", "volume", "contagem"],
      origem_aporte: ["participante", "pj"],
      pago_por: ["caixa", "participante"],
      papel: ["administrador", "membro"],
      situacao_desafio: ["planejado", "em_andamento", "encerrado"],
      situacao_entrega: ["aguardando", "pronta", "entregue"],
      situacao_pagamento: ["paga", "parcial", "pendente"],
      situacao_producao: ["planejada", "concluida", "cancelada"],
      situacao_registro: ["ativa", "cancelada"],
      tipo_insumo: ["ingrediente", "embalagem", "outro"],
      tipo_lancamento_caixa: [
        "recebimento",
        "taxa",
        "compra",
        "despesa",
        "reembolso",
        "aporte",
        "ajuste",
        "estorno",
      ],
      tipo_movimento: [
        "compra",
        "consumo_producao",
        "entrada_producao",
        "venda",
        "doacao",
        "perda",
        "ajuste",
        "estorno",
      ],
      tipo_produto: ["simples", "kit"],
      tipo_venda: ["venda", "encomenda", "doacao"],
    },
  },
} as const
