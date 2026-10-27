"use client";

import { startTransition, useActionState, useRef, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Aviso, classeBotao } from "./ui";
import type { Resultado } from "@/servicos/erros";

type Acao = (anterior: Resultado | null, dados: FormData) => Promise<Resultado>;

const NAO_SALVO =
  "Não foi salvo: a conexão falhou no envio. O que você digitou continua aqui. Confira o sinal e toque de novo.";

// Formulário que chama uma Server Action e mostra o resultado.
// - Chave única por registro (idempotência): reenviar o mesmo formulário depois de
//   uma falha usa a mesma chave e não duplica; depois de um sucesso, a chave muda.
// - Botão travado durante o envio e segundo toque ignorado (sem duplo envio).
// - Em caso de erro, o que a pessoa digitou fica na tela (o React limparia o
//   formulário sozinho se usássemos <form action>; por isso o envio é manual).
// - Sem conexão no envio: mensagem "não foi salvo", dados preservados (Seção 6.2).
// - Mensagem de erro que diz como resolver; sucesso confirmado em texto.
export function Formulario({
  acao,
  children,
  textoBotao,
  textoEnviando = "Salvando…",
  limparAoSalvar = false,
  variante = "primario",
  className = "flex flex-col gap-4",
}: {
  acao: Acao;
  children: ReactNode;
  textoBotao: string;
  textoEnviando?: string;
  limparAoSalvar?: boolean;
  variante?: "primario" | "secundario" | "perigo";
  className?: string;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const chave = useRef("");
  const enviando = useRef(false);

  const [resultado, enviar, pendente] = useActionState<Resultado | null, FormData>(async (anterior, dados) => {
    try {
      const resposta = await acao(anterior, dados);
      if (resposta.ok) {
        chave.current = "";
        if (limparAoSalvar) formulario.current?.reset();
      }
      return resposta;
    } catch (erro) {
      unstable_rethrow(erro); // redirecionamentos do Next seguem normalmente
      return { ok: false, erro: NAO_SALVO };
    } finally {
      enviando.current = false;
    }
  }, null);

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando.current) return; // segundo toque antes da resposta: ignora
    enviando.current = true;
    if (!chave.current) chave.current = crypto.randomUUID();
    const dados = new FormData(evento.currentTarget);
    dados.set("chave", chave.current);
    startTransition(() => enviar(dados));
  }

  return (
    <form ref={formulario} onSubmit={aoEnviar} className={className}>
      {children}
      {resultado && !resultado.ok ? (
        <div className="flex flex-col gap-2">
          <Aviso tipo="erro">{resultado.erro}</Aviso>
          {resultado.itens?.length ? (
            <ul className="list-disc rounded-xl border border-borda p-3 pl-7 text-sm">
              {resultado.itens.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          ) : null}
          {resultado.links?.length ? (
            <div className="grid grid-cols-2 gap-2">
              {resultado.links.map((l) => (
                <Link key={l.href} href={l.href} className={classeBotao("secundario", "text-sm")}>
                  {l.texto}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {resultado?.ok && resultado.mensagem ? <Aviso tipo="sucesso">{resultado.mensagem}</Aviso> : null}
      <button type="submit" disabled={pendente} aria-busy={pendente} className={classeBotao(variante, "w-full")}>
        {pendente ? textoEnviando : textoBotao}
      </button>
    </form>
  );
}
