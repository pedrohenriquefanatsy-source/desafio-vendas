"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { lerNumero, formatarCustoUnidade, formatarQuantidade, formatarReais } from "@/lib/numeros";
import { classeBotao } from "./ui";
import type { OpcaoInsumo } from "./campo-insumo-unidade";

type Linha = { chave: number; insumo_id: string; quantidade: string; valor: string; valorEditado: boolean };

const campo = "min-h-toque w-full rounded-xl border border-borda bg-superficie px-3 text-base";

// Itens de uma compra. A unidade já vem do cadastro do insumo: a embalagem cadastrada (ex.: pacote de
// 500 g), ou a unidade base quando ainda não há embalagem. A pessoa só diz quantas embalagens comprou
// e quanto pagou; o valor já vem sugerido (quantidade × último preço) e pode ser corrigido.
// Comprou em outro tamanho de embalagem? Cadastre como outro insumo.
// O total mostrado é só prévia; o oficial é calculado pelo banco ao salvar.
export function ItensCompra({ insumos, iniciais }: { insumos: OpcaoInsumo[]; iniciais: { insumo_id: string; quantidade: string }[] }) {
  const achar = (id: string) => insumos.find((i) => i.id === id);
  const unidadeDe = (i: OpcaoInsumo) => (i.embalagem ? "embalagem" : i.unidadeBase);
  const sugerir = (i: OpcaoInsumo | undefined, quantidade: string) => {
    const q = lerNumero(quantidade);
    if (!i?.embalagem || i.embalagem.preco == null || q == null || q <= 0) return "";
    return (Math.round(q * i.embalagem.preco * 100) / 100).toFixed(2).replace(".", ",");
  };

  const [linhas, setLinhas] = useState<Linha[]>(() => {
    // Quem vem da lista de compras traz a falta em gramas (ml ou unidades): vira embalagens inteiras.
    const prontas = iniciais
      .filter((i) => achar(i.insumo_id))
      .map((i, n) => {
        const insumo = achar(i.insumo_id);
        const base = lerNumero(i.quantidade) ?? 0;
        const quantidade = insumo?.embalagem ? String(Math.max(1, Math.ceil(base / insumo.embalagem.tamanho))) : i.quantidade;
        return { chave: n, insumo_id: i.insumo_id, quantidade, valor: sugerir(insumo, quantidade), valorEditado: false };
      });
    return prontas.length ? prontas : [{ chave: 0, insumo_id: "", quantidade: "", valor: "", valorEditado: false }];
  });
  const [proxima, setProxima] = useState(linhas.length);

  function mudar(chave: number, mudanca: Partial<Linha>) {
    setLinhas((atual) =>
      atual.map((l) => {
        if (l.chave !== chave) return l;
        const nova = { ...l, ...mudanca };
        if (!nova.valorEditado) nova.valor = sugerir(achar(nova.insumo_id), nova.quantidade);
        return nova;
      }),
    );
  }
  function adicionar() {
    setLinhas((atual) => [...atual, { chave: proxima, insumo_id: "", quantidade: "", valor: "", valorEditado: false }]);
    setProxima((n) => n + 1);
  }
  function remover(chave: number) {
    setLinhas((atual) => atual.filter((l) => l.chave !== chave));
  }

  const total = linhas.reduce((t, l) => t + (lerNumero(l.valor) ?? 0), 0);
  const json = JSON.stringify(
    linhas.map((l) => {
      const insumo = achar(l.insumo_id);
      return { insumo_id: l.insumo_id, quantidade: l.quantidade, unidade: insumo ? unidadeDe(insumo) : "", valor: l.valor };
    }),
  );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="itens" value={json} />
      {linhas.map((l, n) => {
        const insumo = achar(l.insumo_id);
        const emb = insumo?.embalagem;
        const qtd = lerNumero(l.quantidade);
        return (
          <fieldset key={l.chave} aria-label={`Item ${n + 1}`} className="flex flex-col gap-3 rounded-cartao border border-borda p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Item {n + 1}</span>
              {linhas.length > 1 ? (
                <button
                  type="button"
                  onClick={() => remover(l.chave)}
                  aria-label={`Tirar o item ${n + 1}`}
                  className="inline-flex size-11 items-center justify-center rounded-xl text-texto-suave"
                >
                  <X aria-hidden className="size-5" />
                </button>
              ) : null}
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Insumo
              <select
                value={l.insumo_id}
                required
                onChange={(e) => mudar(l.chave, { insumo_id: e.target.value, valorEditado: false })}
                className={campo}
              >
                <option value="">Escolha…</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
            </label>

            {insumo ? (
              <div className="rounded-xl bg-fundo px-3 py-2 text-sm" aria-live="polite">
                {emb ? (
                  <>
                    <p>
                      Embalagem de <strong>{formatarQuantidade(emb.tamanho)} {insumo.unidadeBase}</strong>
                      {emb.preco != null ? (
                        <>
                          {" · "}último preço <strong>{formatarReais(emb.preco)}</strong> ({formatarCustoUnidade(insumo.custoBase, insumo.unidadeBase)})
                        </>
                      ) : (
                        " · sem preço ainda"
                      )}
                    </p>
                  </>
                ) : (
                  <p>
                    Este insumo ainda não tem embalagem cadastrada, então a quantidade é em <strong>{insumo.unidadeBase}</strong>.{" "}
                    <Link href={`/mais/insumos/${insumo.id}`} className="inline-flex min-h-toque items-center font-medium text-acao underline">
                      Cadastrar a embalagem
                    </Link>
                  </p>
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                {emb ? "Quantas embalagens" : insumo ? `Quantidade (${insumo.unidadeBase})` : "Quantidade"}
                <input
                  inputMode="decimal"
                  required
                  value={l.quantidade}
                  onChange={(e) => mudar(l.chave, { quantidade: e.target.value })}
                  className={campo}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Valor pago (R$)
                <input
                  inputMode="decimal"
                  required
                  placeholder="0,00"
                  value={l.valor}
                  onChange={(e) => mudar(l.chave, { valor: e.target.value, valorEditado: true })}
                  className={campo}
                />
              </label>
            </div>
            {emb && qtd != null && qtd > 0 ? (
              <p className="text-xs text-texto-suave">
                = {formatarQuantidade(qtd * emb.tamanho)} {insumo?.unidadeBase} no estoque
              </p>
            ) : null}
          </fieldset>
        );
      })}
      <button type="button" onClick={adicionar} className={classeBotao("secundario", "w-full")}>
        <Plus aria-hidden className="size-5" /> Adicionar item
      </button>
      <p className="text-xs text-texto-suave">Comprou em outro tamanho de embalagem? Cadastre como outro insumo, em Mais → Insumos.</p>
      <p className="flex items-baseline justify-between text-sm">
        <span className="text-texto-suave">Total da compra</span>
        <span className="text-lg font-semibold tabular-nums">{formatarReais(total)}</span>
      </p>
    </div>
  );
}
