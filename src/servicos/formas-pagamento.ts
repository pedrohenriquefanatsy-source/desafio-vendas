import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Tables } from "@/lib/supabase/tipos-banco";
import { mensagemDeErro, type Resultado } from "./erros";

export type FormaPagamento = Tables<"formas_pagamento">;

const DUPLICADO = { duplicado: "Já existe uma forma de pagamento com esse nome." };

export async function listarFormasPagamento(): Promise<FormaPagamento[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("formas_pagamento")
    .select("*")
    .order("ativa", { ascending: false })
    .order("ordem")
    .order("nome");
  if (error) throw new Error(mensagemDeErro(error));
  return data;
}

export async function criarFormaPagamento(nome: string, taxa: number): Promise<Resultado> {
  const supabase = await criarClienteServidor();
  const { data: ultima } = await supabase
    .from("formas_pagamento")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("formas_pagamento")
    .insert({ nome, taxa_percentual: taxa, ordem: (ultima?.ordem ?? 0) + 1 });
  if (error) return { ok: false, erro: mensagemDeErro(error, DUPLICADO) };
  return { ok: true, mensagem: `${nome} cadastrada.` };
}

export async function alterarFormaPagamento(
  id: string,
  dados: { nome: string; taxa_percentual: number; ativa: boolean },
): Promise<Resultado> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("formas_pagamento").update(dados).eq("id", id).select("id");
  if (error) return { ok: false, erro: mensagemDeErro(error, DUPLICADO) };
  if (!data.length) return { ok: false, erro: mensagemDeErro({ code: "42501" }) };
  return { ok: true, mensagem: "Alterações salvas." };
}
