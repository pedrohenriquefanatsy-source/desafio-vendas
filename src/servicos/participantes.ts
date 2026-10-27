import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Tables, Enums } from "@/lib/supabase/tipos-banco";
import { mensagemDeErro, type Resultado } from "./erros";

export type Participante = Pick<Tables<"perfis">, "id" | "nome" | "papel" | "ativo" | "criado_em">;
export type Papel = Enums<"papel">;

export const NOMES_PAPEL: Record<Papel, string> = {
  administrador: "Administrador",
  membro: "Membro",
};

export async function listarParticipantes(): Promise<Participante[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("perfis")
    .select("id, nome, papel, ativo, criado_em")
    .order("ativo", { ascending: true }) // desativados (aguardando) primeiro
    .order("nome", { nullsFirst: true });
  if (error) throw new Error(mensagemDeErro(error));
  return data;
}

export async function definirMeuNome(nome: string): Promise<Resultado> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("definir_meu_nome", { p_nome: nome });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  return { ok: true };
}

export async function atualizarParticipante(
  id: string,
  dados: { nome: string | null; papel: Papel; ativo: boolean },
): Promise<Resultado> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("admin_atualizar_participante", {
    p_id: id,
    // O banco aceita nulo ("manter o nome atual"); o tipo gerado não sabe disso.
    p_nome: dados.nome as string,
    p_papel: dados.papel,
    p_ativo: dados.ativo,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  return { ok: true, mensagem: "Participante atualizado." };
}
