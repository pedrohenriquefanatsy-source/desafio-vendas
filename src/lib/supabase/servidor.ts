import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { ambiente } from "./ambiente";

// Cliente do Supabase para páginas do servidor, Server Actions e rotas.
// Usa só a chave pública e o login do participante (cookie): a RLS vale sempre.
export async function criarClienteServidor() {
  const loja = await cookies();
  return createServerClient(ambiente.url, ambiente.chavePublica, {
    cookies: {
      getAll() {
        return loja.getAll();
      },
      setAll(lista) {
        try {
          for (const { name, value, options } of lista) {
            loja.set(name, value, options);
          }
        } catch {
          // Chamado de um Server Component, onde não dá para gravar cookie.
          // A renovação da sessão acontece no proxy.
        }
      },
    },
  });
}
