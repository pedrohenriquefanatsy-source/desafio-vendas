import { Campo, Selecao } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { hojeIso } from "@/lib/datas";
import { NOMES_SITUACAO, type Desafio } from "@/servicos/desafios";
import { salvarDesafio } from "../acoes";

// Mesmo formulário para criar (sem desafio) e alterar (com desafio).
export function FormularioDesafio({ desafio }: { desafio?: Desafio }) {
  const hoje = hojeIso();
  return (
    <Formulario acao={salvarDesafio} textoBotao={desafio ? "Salvar alterações" : "Cadastrar desafio"}>
      {desafio?.id ? <input type="hidden" name="id" value={desafio.id} /> : null}
      <Campo id="nome" name="nome" rotulo="Nome do desafio" defaultValue={desafio?.nome ?? ""} required maxLength={80} />
      <div className="grid grid-cols-2 gap-3">
        <Campo id="inicio" name="inicio" type="date" rotulo="Início" defaultValue={desafio?.inicio ?? hoje} required />
        <Campo id="fim" name="fim" type="date" rotulo="Fim" defaultValue={desafio?.fim ?? ""} required />
      </div>
      <Campo
        id="meta_resultado"
        name="meta_resultado"
        rotulo="Meta de resultado (R$)"
        inputMode="decimal"
        placeholder="Ex.: 1.500,00"
        dica="O resultado é o que sobra das vendas depois dos custos e despesas. Pode deixar em branco e definir depois."
        defaultValue={desafio?.meta_resultado != null ? String(desafio.meta_resultado).replace(".", ",") : ""}
      />
      <Campo
        id="meta_vendas"
        name="meta_vendas"
        rotulo="Meta de vendas em R$ (opcional)"
        inputMode="decimal"
        placeholder="Ex.: 5.000,00"
        defaultValue={desafio?.meta_vendas != null ? String(desafio.meta_vendas).replace(".", ",") : ""}
      />
      <Selecao id="situacao" name="situacao" rotulo="Situação" defaultValue={desafio?.situacao ?? "planejado"}>
        {Object.entries(NOMES_SITUACAO).map(([valor, nome]) => (
          <option key={valor} value={valor}>
            {nome}
          </option>
        ))}
      </Selecao>
    </Formulario>
  );
}
