// Variáveis públicas do Supabase. Nunca coloque a chave service_role aqui.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chavePublica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !chavePublica) {
  throw new Error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Veja .env.example.",
  );
}

export const ambiente = { url, chavePublica };
