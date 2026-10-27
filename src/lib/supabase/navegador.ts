import { createBrowserClient } from "@supabase/ssr";
import { ambiente } from "./ambiente";
import type { Database } from "./tipos-banco";

// Cliente do Supabase para componentes do navegador (só chave pública).
export function criarClienteNavegador() {
  return createBrowserClient<Database>(ambiente.url, ambiente.chavePublica);
}
