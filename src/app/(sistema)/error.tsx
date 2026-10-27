"use client";

import { Aviso, classeBotao } from "@/componentes/ui";

// Erro ao carregar uma tela: diz o que houve e como tentar de novo (Nielsen 9).
export default function ErroTela({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const semConexao = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div className="flex flex-col gap-4">
      <Aviso tipo="erro">
        {semConexao
          ? "Sem conexão. Não foi possível carregar esta tela. Confira o sinal e tente de novo."
          : "Não foi possível carregar esta tela. Tente de novo; se continuar, avise o administrador."}
      </Aviso>
      {error.digest ? <p className="text-xs text-texto-suave">Código do erro: {error.digest}</p> : null}
      <button type="button" onClick={reset} className={classeBotao("primario")}>
        Tentar de novo
      </button>
    </div>
  );
}
