import type { ReactNode } from "react";
import { Cartao } from "./ui";
import { Formulario } from "./formulario";
import { ItemEditavel } from "./item-editavel";
import type { Resultado } from "@/servicos/erros";

// "Excluir" só aparece quando o banco diz que dá (nunca foi usado). Quando não dá, a tela explica
// por quê e o que fazer no lugar (desativar), em vez de deixar o botão e falhar depois.
export function SecaoExcluir({
  motivo,
  titulo,
  o_que_acontece,
  textoBotao,
  acao,
  campos,
  alternativa,
}: {
  motivo: string | null; // null = pode excluir
  titulo: string;
  o_que_acontece: ReactNode;
  textoBotao: string;
  acao: (anterior: Resultado | null, dados: FormData) => Promise<Resultado>;
  campos: Record<string, string>;
  alternativa: string;
}) {
  if (motivo) {
    return (
      <Cartao>
        <p className="font-medium">{titulo}</p>
        <p className="mt-1 text-sm text-texto-suave">Não dá para excluir: {motivo}</p>
        <p className="mt-1 text-sm text-texto-suave">{alternativa}</p>
      </Cartao>
    );
  }
  return (
    <ItemEditavel titulo={titulo} apoio="Nunca foi usado, então pode ser excluído">
      <p className="mb-3 text-sm text-texto-suave">{o_que_acontece} Não dá para desfazer; fica registrado na Auditoria.</p>
      <Formulario acao={acao} textoBotao={textoBotao} textoEnviando="Excluindo…" variante="perigo">
        {Object.entries(campos).map(([nome, valor]) => (
          <input key={nome} type="hidden" name={nome} value={valor} />
        ))}
      </Formulario>
    </ItemEditavel>
  );
}
