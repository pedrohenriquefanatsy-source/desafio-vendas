import { createBrowserClient } from "@supabase/ssr";
import { ambiente } from "./ambiente";

// Cliente do Supabase para componentes do navegador (só chave pública).
export function criarClienteNavegador() {
  return createBrowserClient(ambiente.url, ambiente.chavePublica);
}
