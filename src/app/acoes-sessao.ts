"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { definirMeuNome } from "@/servicos/participantes";
import { mensagemDeErro, type Resultado } from "@/servicos/erros";

export async function entrar(_anterior: Resultado | null, dados: FormData): Promise<Resultado> {
  const email = String(dados.get("email") ?? "").trim();
  const senha = String(dados.get("senha") ?? "");
  if (!email || !senha) return { ok: false, erro: "Preencha o e-mail e a senha." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    if (error.code === "invalid_credentials") {
      return { ok: false, erro: "E-mail ou senha incorretos. Confira e tente de novo; se esqueceu a senha, peça ao administrador." };
    }
    if (error.code === "email_not_confirmed") {
      return { ok: false, erro: "Seu e-mail ainda não foi confirmado. Peça ao administrador para confirmar seu cadastro." };
    }
    return { ok: false, erro: mensagemDeErro({ message: error.message }) };
  }
  redirect("/");
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/entrar");
}

export async function salvarMeuNome(_anterior: Resultado | null, dados: FormData): Promise<Resultado> {
  const nome = String(dados.get("nome") ?? "").trim();
  const resultado = await definirMeuNome(nome);
  if (!resultado.ok) return resultado;
  redirect("/");
}
