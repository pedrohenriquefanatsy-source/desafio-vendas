"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Aviso, classeBotao } from "./ui";
import type { Resultado } from "@/servicos/erros";

type Acao = (anterior: Resultado | null, dados: FormData) => Promise<Resultado>;

// Formulário que chama uma Server Action e mostra o resultado.
// - Gera uma chave única ao abrir (idempotência): um reenvio não duplica.
// - Botão travado durante o envio (sem duplo toque).
// - Mensagem de erro que diz como resolver; sucesso confirmado em texto.
export function Formulario({
  acao,
  children,
  textoBotao,
  textoEnviando = "Salvando…",
  className = "flex flex-col gap-4",
}: {
  acao: Acao;
  children: ReactNode;
  textoBotao: string;
  textoEnviando?: string;
  className?: string;
}) {
  const [resultado, enviar] = useActionState(acao, null);
  const [chave] = useState(() => crypto.randomUUID());
  return (
    <form action={enviar} className={className}>
      <input type="hidden" name="chave" value={chave} />
      {children}
      {resultado && !resultado.ok ? <Aviso tipo="erro">{resultado.erro}</Aviso> : null}
      {resultado?.ok && resultado.mensagem ? <Aviso tipo="sucesso">{resultado.mensagem}</Aviso> : null}
      <BotaoEnviar textoEnviando={textoEnviando}>{textoBotao}</BotaoEnviar>
    </form>
  );
}

export function BotaoEnviar({
  children,
  textoEnviando = "Salvando…",
  variante = "primario",
}: {
  children: ReactNode;
  textoEnviando?: string;
  variante?: "primario" | "secundario" | "perigo";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={classeBotao(variante, "w-full")}>
      {pending ? textoEnviando : children}
    </button>
  );
}
