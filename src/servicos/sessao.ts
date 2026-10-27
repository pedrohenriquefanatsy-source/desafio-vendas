import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Tables } from "@/lib/supabase/tipos-banco";

export type Perfil = Pick<Tables<"perfis">, "id" | "nome" | "papel" | "ativo">;

// Perfil de quem está logado, lido uma vez por requisição. null = não logado.
export const obterPerfil = cache(async (): Promise<Perfil | null> => {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const { data: perfil, error } = await supabase
    .from("perfis")
    .select("id, nome, papel, ativo")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Não foi possível ler o seu perfil.");
  // Sem perfil (não deveria acontecer): trata como desativado.
  return perfil ?? { id, nome: null, papel: "membro", ativo: false };
});

// Para as telas do sistema: exige login, participante ativo e nome informado.
export async function exigirParticipante(): Promise<Perfil & { nome: string }> {
  const perfil = await obterPerfil();
  if (!perfil) redirect("/entrar");
  if (!perfil.ativo) redirect("/acesso-pendente");
  if (!perfil.nome) redirect("/primeiro-acesso");
  return perfil as Perfil & { nome: string };
}

export function ehAdmin(perfil: Perfil): boolean {
  return perfil.ativo && perfil.papel === "administrador";
}
