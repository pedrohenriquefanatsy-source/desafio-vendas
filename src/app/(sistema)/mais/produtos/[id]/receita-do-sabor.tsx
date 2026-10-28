import { Aviso, Campo, Selecao } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { CampoInsumoUnidade, type OpcaoInsumo } from "@/componentes/campo-insumo-unidade";
import { ConstrutorReceita } from "@/componentes/construtor-receita";
import { formatarQuantidade, formatarReais } from "@/lib/numeros";
import type { CustoItemReceita, CustoReceita, CustoVariacao } from "@/servicos/catalogo";
import type { Tables } from "@/lib/supabase/tipos-banco";
import {
  adicionarItemReceita,
  alterarItemReceita,
  cadastrarReceitaSabor,
  copiarReceitaSabor,
  removerItemReceita,
  salvarRendimento,
} from "../../acoes-catalogo";

type Unidades = Record<string, { unidade: string | null; quantidade_em_base: number | null }[]>;

// A receita do sabor, dentro da tela do produto: quanto rende uma fornada e quais ingredientes entram.
// Por baixo ela é uma receita ligada ao sabor; quem usa o sistema só vê "a receita deste sabor".
export function ReceitaDoSabor({
  sabor,
  produtoId,
  receita,
  itens,
  custo,
  opcoes,
  unidades,
  origens,
  compartilhada,
}: {
  sabor: CustoVariacao;
  produtoId: string;
  receita: Tables<"receitas"> | undefined;
  itens: CustoItemReceita[];
  custo: CustoReceita | undefined;
  opcoes: OpcaoInsumo[];
  unidades: Unidades;
  origens: { id: string; nome: string }[];
  compartilhada: string[];
}) {
  const id = sabor.variacao_id ?? "";
  const copiar = origens.length ? (
    <ItemEditavel titulo="Copiar a receita de outro sabor" apoio="Ingredientes, rendimento e embalagem; depois você troca o que muda">
      <Formulario acao={copiarReceitaSabor} textoBotao="Copiar receita" textoEnviando="Copiando…">
        <input type="hidden" name="variacao_id" value={id} />
        <input type="hidden" name="produto_id" value={produtoId} />
        <Selecao id={`origem-${id}`} name="origem" rotulo="Copiar de" defaultValue="">
          <option value="">Escolha…</option>
          {origens.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </Selecao>
      </Formulario>
    </ItemEditavel>
  ) : null;

  if (!receita) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <h3 className="text-sm font-medium">Receita (uma fornada)</h3>
        <p className="text-sm text-texto-suave">
          Este sabor ainda não tem receita. Liste os ingredientes e as quantidades de uma fornada para ver o custo; no fim, diga quantas unidades ela rende.
        </p>
        {opcoes.length === 0 ? (
          <Aviso tipo="erro">Cadastre os insumos antes (Mais → Insumos), com embalagem e preço.</Aviso>
        ) : (
          <ConstrutorReceita insumos={opcoes} variacaoId={id} produtoId={produtoId} acao={cadastrarReceitaSabor} />
        )}
        {copiar}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      <h3 className="text-sm font-medium">Receita (uma fornada)</h3>
      {compartilhada.length ? (
        <Aviso tipo="erro">Esta receita também é usada por: {compartilhada.join(", ")}. Mudar aqui muda lá também.</Aviso>
      ) : null}
      <p className="text-sm">
        Rende <strong>{formatarQuantidade(receita.rendimento_unidades)}</strong> unidades
        {custo?.custo_receita != null ? (
          <>
            {" · "}fornada {formatarReais(custo.custo_receita)} · {formatarReais(custo.custo_por_unidade)} cada
          </>
        ) : itens.length ? (
          <span className="text-alerta"> · falta o preço de: {custo?.insumos_sem_preco}</span>
        ) : null}
      </p>

      {itens.length === 0 ? <p className="text-sm text-texto-suave">Nenhum ingrediente ainda.</p> : null}
      {itens.map((it) => {
        const resumo = `${formatarQuantidade(it.quantidade)} ${it.unidade}${it.unidade !== it.unidade_base ? ` = ${formatarQuantidade(it.quantidade_base)} ${it.unidade_base}` : ""}`;
        return (
          <ItemEditavel
            key={it.id}
            titulo={it.insumo}
            apoio={resumo}
            direita={<span className="text-sm tabular-nums">{it.custo == null ? "sem preço" : formatarReais(it.custo)}</span>}
          >
            <Formulario acao={alterarItemReceita} textoBotao="Salvar" className="flex flex-col gap-3">
              <input type="hidden" name="id" value={it.id ?? ""} />
              <input type="hidden" name="receita_id" value={receita.id} />
              <input type="hidden" name="produto_id" value={produtoId} />
              <div className="grid grid-cols-2 gap-3">
                <Campo id={`qtd-${it.id}`} name="quantidade" rotulo="Quantidade" inputMode="decimal" defaultValue={String(it.quantidade).replace(".", ",")} required />
                <Selecao id={`un-${it.id}`} name="unidade" rotulo="Unidade" defaultValue={it.unidade ?? ""}>
                  {(unidades[it.insumo_id ?? ""] ?? []).map((u) => (
                    <option key={u.unidade} value={u.unidade ?? ""}>
                      {u.unidade}
                    </option>
                  ))}
                </Selecao>
              </div>
            </Formulario>
            <div className="mt-3">
              <Formulario acao={removerItemReceita} textoBotao="Tirar da receita" textoEnviando="Removendo…" variante="perigo">
                <input type="hidden" name="id" value={it.id ?? ""} />
                <input type="hidden" name="receita_id" value={receita.id} />
                <input type="hidden" name="produto_id" value={produtoId} />
              </Formulario>
            </div>
          </ItemEditavel>
        );
      })}

      <ItemEditavel titulo="＋ Adicionar ingrediente" aberto={itens.length === 0}>
        {opcoes.filter((o) => !itens.some((i) => i.insumo_id === o.id)).length === 0 ? (
          <p className="text-sm text-texto-suave">Todos os insumos já estão nesta receita. Cadastre outros em Mais → Insumos.</p>
        ) : (
          <Formulario acao={adicionarItemReceita} textoBotao="Adicionar" limparAoSalvar>
            <input type="hidden" name="receita_id" value={receita.id} />
            <input type="hidden" name="produto_id" value={produtoId} />
            <CampoInsumoUnidade
              insumos={opcoes.filter((o) => !itens.some((i) => i.insumo_id === o.id))}
              prefixo={`ing-${id}`}
              rotuloInsumo="Ingrediente"
              rotuloQuantidade="Quanto vai na fornada"
            />
          </Formulario>
        )}
      </ItemEditavel>

      <ItemEditavel titulo="Quantas unidades rende" apoio="Muda o custo de cada unidade">
        <Formulario acao={salvarRendimento} textoBotao="Salvar" className="flex flex-col gap-3">
          <input type="hidden" name="receita_id" value={receita.id} />
          <input type="hidden" name="produto_id" value={produtoId} />
          <Campo id={`rend-${id}`} name="rendimento" rotulo="Uma fornada rende" inputMode="decimal" defaultValue={String(receita.rendimento_unidades).replace(".", ",")} required />
        </Formulario>
      </ItemEditavel>

      {itens.length === 0 ? copiar : null}
    </div>
  );
}
