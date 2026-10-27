import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Tables, Enums } from "@/lib/supabase/tipos-banco";
import { mensagemDeErro, type Resultado } from "./erros";

export type Desafio = Tables<"v_desafios">;
export type SituacaoDesafio = Enums<"situacao_desafio">;

export const NOMES_SITUACAO: Record<SituacaoDesafio, string> = {
  planejado: "Planejado",
  em_andamento: "Em andamento",
  encerrado: "Encerrado",
};

// Desafio atual: o que está em andamento; senão, o planejado mais próximo.
export async function obterDesafioAtual(): Promise<Desafio | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("v_desafios")
    .select("*")
    .in("situacao", ["em_andamento", "planejado"])
    .order("situacao", { ascending: true }) // enum: planejado < em_andamento
    .order("inicio", { ascending: true });
  if (error) throw new Error(mensagemDeErro(error));
  return data.find((d) => d.situacao === "em_andamento") ?? data[0] ?? null;
}

export async function listarDesafios(): Promise<Desafio[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("v_desafios")
    .select("*")
    .order("inicio", { ascending: false });
  if (error) throw new Error(mensagemDeErro(error));
  return data;
}

export async function obterDesafio(id: string): Promise<Desafio | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("v_desafios").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(mensagemDeErro(error));
  return data;
}

export type DadosDesafio = {
  nome: string;
  inicio: string;
  fim: string;
  meta_resultado: number | null;
  meta_vendas: number | null;
  situacao: SituacaoDesafio;
};

const DUPLICADO = {
  duplicado: "Já existe um desafio em andamento. Encerre o atual antes de iniciar outro.",
};

// Criar com a chave do formulário: um reenvio (duplo toque, sinal ruim) não duplica.
export async function criarDesafio(chave: string, dados: DadosDesafio): Promise<Resultado> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("desafios")
    .upsert({ ...dados, chave_idempotencia: chave }, { onConflict: "chave_idempotencia", ignoreDuplicates: true });
  if (error) return { ok: false, erro: mensagemDeErro(error, DUPLICADO) };
  return { ok: true, mensagem: "Desafio salvo." };
}

export async function alterarDesafio(id: string, dados: DadosDesafio): Promise<Resultado> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("desafios").update(dados).eq("id", id).select("id");
  if (error) return { ok: false, erro: mensagemDeErro(error, DUPLICADO) };
  if (!data.length) return { ok: false, erro: mensagemDeErro({ code: "42501" }) };
  return { ok: true, mensagem: "Alterações salvas." };
}
