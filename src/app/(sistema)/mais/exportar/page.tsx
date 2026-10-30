import { Cartao, TituloPagina, classeBotao, BotaoVoltar } from "@/componentes/ui";
import { exigirParticipante } from "@/servicos/sessao";
import { listarParticipantes } from "@/servicos/participantes";
import { listarCustosVariacoes } from "@/servicos/catalogo";
import { EXPORTACOES } from "@/servicos/exportacao";
import { obterDesafioAtual } from "@/servicos/desafios";

const campo = "min-h-toque w-full rounded-xl border border-borda bg-superficie px-3 text-base";

// Exportar (Seção 4.8): tipo, período, produto, participante → XLSX ou CSV.
// O arquivo é montado com os dados do Supabase, não com o que está na tela.
export default async function Exportar() {
  await exigirParticipante();
  const [pessoas, variacoes, desafio] = await Promise.all([listarParticipantes(), listarCustosVariacoes(), obterDesafioAtual()]);

  return (
    <>
      <BotaoVoltar href="/mais">Mais</BotaoVoltar>
      <TituloPagina apoio="Planilha com os dados do banco: números como número, datas como data e o ID de cada registro.">Exportar</TituloPagina>
      <Cartao>
        <form method="get" action="/exportar" className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            O que exportar
            <select name="tipo" defaultValue="vendas" className={campo}>
              {Object.entries(EXPORTACOES).map(([chave, def]) => (
                <option key={chave} value={chave}>
                  {def.titulo}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-1 text-sm font-medium">Período (opcional)</legend>
            <label className="flex flex-col gap-1 text-sm">
              De
              <input type="date" name="de" defaultValue={desafio?.inicio ?? ""} className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Até
              <input type="date" name="ate" defaultValue={desafio?.fim ?? ""} className={campo} />
            </label>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Produto (opcional)
            <select name="produto" defaultValue="" className={campo}>
              <option value="">Todos</option>
              {variacoes.map((v) => (
                <option key={v.variacao_id} value={v.variacao_id ?? ""}>
                  {v.variacao === "Única" ? v.produto : `${v.produto} · ${v.variacao}`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Participante (opcional)
            <select name="participante" defaultValue="" className={campo}>
              <option value="">Todos</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome ?? "Sem nome"}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-texto-suave">
            Os filtros valem onde fazem sentido: período nas listas com data, produto nas vendas, itens, estoque e produção,
            participante nas vendas, compras, despesas e reembolsos. O período vem preenchido com as datas do desafio.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="submit" name="formato" value="xlsx" className={classeBotao("primario")}>
              Baixar XLSX
            </button>
            <button type="submit" name="formato" value="csv" className={classeBotao("secundario")}>
              Baixar CSV
            </button>
          </div>
        </form>
      </Cartao>
    </>
  );
}
