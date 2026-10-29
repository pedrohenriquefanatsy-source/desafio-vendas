import { Aviso, Campo, Selecao } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { CampoInsumoUnidade, type OpcaoInsumo } from "@/componentes/campo-insumo-unidade";
import { ConstrutorReceita } from "@/componentes/construtor-receita";
import { formatarCustoUnidade, formatarQuantidade, formatarReais } from "@/lib/numeros";
import { formatarData } from "@/lib/datas";
import type { CusteioPeso, CustoItemReceita, CustoReceita, CustoVariacao } from "@/servicos/catalogo";
import type { Tables } from "@/lib/supabase/tipos-banco";
import {
  adicionarItemReceita,
  alterarItemReceita,
  cadastrarReceitaPeso,
  cadastrarReceitaSabor,
  copiarReceitaSabor,
  removerItemReceita,
  salvarCusteioPeso,
  salvarRendimento,
  voltarCusteioRendimento,
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
  custeioPeso,
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
  custeioPeso: CusteioPeso | undefined;
  opcoes: OpcaoInsumo[];
  unidades: Unidades;
  origens: { id: string; nome: string }[];
  compartilhada: string[];
}) {
  const id = sabor.variacao_id ?? "";
  const peso = Boolean(receita?.custeio_por_peso);
  const coberturas = opcoes.filter((o) => o.unidadeBase === "g");
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
          Este sabor ainda não tem receita. Liste os ingredientes e as quantidades de uma fornada para ver o custo. Escolha se o custo sai do número de unidades que a fornada rende ou do peso (cubos com cobertura).
        </p>
        {opcoes.length === 0 ? (
          <Aviso tipo="erro">Cadastre os insumos antes (Mais → Insumos), com embalagem e preço.</Aviso>
        ) : (
          <ConstrutorReceita insumos={opcoes} variacaoId={id} produtoId={produtoId} acao={cadastrarReceitaSabor} acaoPeso={cadastrarReceitaPeso} />
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
      {peso ? (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            Custeio <strong>por peso</strong> · potinho de <strong>{formatarQuantidade(receita.gramagem_unidade)} g</strong>
            {custeioPeso?.custo_unidade != null ? <> · {formatarReais(custeioPeso.custo_unidade)} de produto (sem a embalagem)</> : null}
          </p>
          {custeioPeso && !custeioPeso.sem_preco ? (
            <>
              <p className="text-texto-suave">
                Custo por grama <strong>{formatarCustoUnidade(custeioPeso.custo_por_grama, "g").replace("/g", "")}</strong> ·{" "}
                {custeioPeso.origem === "ultima_fornada"
                  ? `pela última fornada pesada (${formatarData(custeioPeso.pesada_em)})`
                  : "estimativa: ainda não pesaram nenhuma fornada"}
              </p>
              <p className="text-texto-suave">
                Uma fornada: massa {formatarReais(custeioPeso.custo_massa_fornada)} + {formatarQuantidade(Number(custeioPeso.cobertura_base) / Number(custeioPeso.fornadas_base))} g de{" "}
                {custeioPeso.cobertura} ({formatarReais((Number(custeioPeso.cobertura_base) / Number(custeioPeso.fornadas_base)) * Number(custeioPeso.custo_cobertura_g))})
              </p>
            </>
          ) : itens.length ? (
            <p className="text-alerta">
              Falta o preço de: {[custo?.insumos_sem_preco, custeioPeso?.cobertura_sem_preco ? custeioPeso.cobertura : null].filter(Boolean).join(", ")}
            </p>
          ) : null}
          <p className="text-xs text-texto-suave">Rende cerca de {formatarQuantidade(receita.rendimento_unidades)} potinhos por fornada (estimativa pelo peso).</p>
        </div>
      ) : (
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
      )}

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

      {peso ? (
        <>
          <ItemEditavel titulo="Cobertura, pesos esperados e gramagem" apoio="Muda a estimativa e o tamanho do potinho">
            <Formulario acao={salvarCusteioPeso} textoBotao="Salvar" className="flex flex-col gap-3">
              <input type="hidden" name="receita_id" value={receita.id} />
              <input type="hidden" name="produto_id" value={produtoId} />
              <CamposPeso id={id} coberturas={coberturas} receita={receita} />
            </Formulario>
          </ItemEditavel>
          <ItemEditavel titulo="Voltar a custear por unidades" apoio="Dividir o custo da fornada pelo número de unidades">
            <Formulario acao={voltarCusteioRendimento} textoBotao="Voltar para unidades" className="flex flex-col gap-3">
              <input type="hidden" name="receita_id" value={receita.id} />
              <input type="hidden" name="produto_id" value={produtoId} />
              <Campo id={`vrend-${id}`} name="rendimento" rotulo="Uma fornada rende" inputMode="decimal" placeholder="Ex.: 24" required />
            </Formulario>
          </ItemEditavel>
        </>
      ) : (
        <>
          <ItemEditavel titulo="Quantas unidades rende" apoio="Muda o custo de cada unidade">
            <Formulario acao={salvarRendimento} textoBotao="Salvar" className="flex flex-col gap-3">
              <input type="hidden" name="receita_id" value={receita.id} />
              <input type="hidden" name="produto_id" value={produtoId} />
              <Campo id={`rend-${id}`} name="rendimento" rotulo="Uma fornada rende" inputMode="decimal" defaultValue={String(receita.rendimento_unidades).replace(".", ",")} required />
            </Formulario>
          </ItemEditavel>
          {coberturas.length ? (
            <ItemEditavel titulo="Custear por peso (cubos com cobertura)" apoio="O custo sai do peso dos cubos e do chocolate de cada fornada">
              <Formulario acao={salvarCusteioPeso} textoBotao="Custear por peso" className="flex flex-col gap-3">
                <input type="hidden" name="receita_id" value={receita.id} />
                <input type="hidden" name="produto_id" value={produtoId} />
                <CamposPeso id={id} coberturas={coberturas} receita={null} />
              </Formulario>
            </ItemEditavel>
          ) : null}
        </>
      )}

      {itens.length === 0 ? copiar : null}
    </div>
  );
}

function CamposPeso({ id, coberturas, receita }: { id: string; coberturas: OpcaoInsumo[]; receita: Tables<"receitas"> | null }) {
  const num = (v: number | null | undefined) => (v == null ? "" : String(Number(v)).replace(".", ","));
  return (
    <>
      <Selecao id={`cob-${id}`} name="cobertura_insumo" rotulo="Chocolate da cobertura" defaultValue={receita?.cobertura_insumo_id ?? ""}>
        <option value="">Escolha…</option>
        {coberturas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Selecao>
      <div className="grid grid-cols-2 gap-3">
        <Campo id={`cubos-${id}`} name="peso_cubos" rotulo="Cubos bons (g)" inputMode="decimal" placeholder="Ex.: 2000" defaultValue={num(receita?.peso_cubos_estimado)} required />
        <Campo id={`choc-${id}`} name="cobertura" rotulo="Chocolate gasto (g)" inputMode="decimal" placeholder="Ex.: 700" defaultValue={num(receita?.cobertura_estimada)} required />
      </div>
      <Campo id={`gram-${id}`} name="gramagem" rotulo="Gramagem de cada potinho (g)" inputMode="decimal" placeholder="Ex.: 150" defaultValue={num(receita?.gramagem_unidade)} required />
      <p className="text-xs text-texto-suave">Pesos de uma fornada, como estimativa. Depois da primeira fornada pesada, o sistema usa os números reais.</p>
    </>
  );
}
