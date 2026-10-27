// Transforma erros do Supabase/Postgres em mensagens que dizem como resolver
// (Nielsen 9). As mensagens das funções do banco (raise exception) já vêm em
// português e são mostradas como estão.
type ErroBanco = { code?: string; message?: string } | null | undefined;

export type Resultado =
  | { ok: true; mensagem?: string }
  | { ok: false; erro: string };

const SEM_CONEXAO =
  "Sem conexão com o servidor. Nada foi salvo. Confira o sinal e toque de novo.";

export function mensagemDeErro(erro: ErroBanco, contexto?: { duplicado?: string }): string {
  if (!erro) return "Algo deu errado. Tente de novo.";
  const codigo = erro.code ?? "";
  const texto = erro.message ?? "";
  if (/fetch failed|Failed to fetch|NetworkError|ECONN|ETIMEDOUT/i.test(texto)) return SEM_CONEXAO;
  switch (codigo) {
    case "P0001":
      return texto;
    case "42501":
      return "Você não tem permissão para isso. Se precisar, peça ao administrador.";
    case "23505":
      return contexto?.duplicado ?? "Já existe um registro igual a este.";
    case "23514":
      return "Algum valor está fora do permitido. Confira os campos e tente de novo.";
    case "PGRST116":
      return "Registro não encontrado. Ele pode ter sido alterado por outra pessoa; atualize a página.";
    default:
      return "Não foi possível salvar. Tente de novo; se continuar, avise o administrador.";
  }
}

export function falha(erro: string): Resultado {
  return { ok: false, erro };
}
