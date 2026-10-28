"use client";

import { useState } from "react";
import { formatarCustoUnidade, lerNumero } from "@/lib/numeros";

const campo = "min-h-toque rounded-xl border border-borda bg-superficie px-3 text-base outline-none focus:border-acao";

const MEDIDAS = [
  { codigo: "g", nome: "Gramas (g)", dica: "o que se pesa: chocolate, farinha, açúcar…" },
  { codigo: "ml", nome: "Mililitros (ml)", dica: "o que se mede em volume: leite, óleo…" },
  { codigo: "und", nome: "Unidades (und)", dica: "o que se conta: ovos, caixinhas, adesivos…" },
] as const;

const TEXTOS = {
  g: { tamanho: "Quantos gramas vêm em cada embalagem", exemplo: "500", dica: "Pacote de 500 g → 500. Pacote de 1 kg → 1000." },
  ml: { tamanho: "Quantos ml vêm em cada embalagem", exemplo: "395", dica: "Caixa de 1 litro → 1000." },
  und: { tamanho: "Quantas unidades vêm em cada embalagem", exemplo: "12", dica: "Dúzia de ovos → 12. Se compra uma a uma → 1." },
} as const;

// Embalagem e preço do insumo, do jeito que a pessoa compra: "pacote de 500 g por R$ 16,00".
// O banco calcula o custo de cada grama (ou ml, ou unidade); aqui só se mostra a conta na hora,
// para a pessoa conferir antes de salvar.
export function CamposEmbalagem({
  prefixo,
  unidade,
  tamanhoInicial = "",
  precoInicial = "",
  comMedida = false,
  comEstoque = false,
}: {
  prefixo: string;
  unidade?: "g" | "ml" | "und"; // fixa (insumo que já existe); sem ela, a pessoa escolhe
  tamanhoInicial?: string;
  precoInicial?: string;
  comMedida?: boolean;
  comEstoque?: boolean;
}) {
  const [medida, setMedida] = useState<"g" | "ml" | "und">(unidade ?? "g");
  const [tamanho, setTamanho] = useState(tamanhoInicial);
  const [preco, setPreco] = useState(precoInicial);
  const t = TEXTOS[medida];
  const nTamanho = lerNumero(tamanho);
  const nPreco = lerNumero(preco);
  const conta = nTamanho && nTamanho > 0 && nPreco != null && nPreco >= 0 ? nPreco / nTamanho : null;

  return (
    <div className="flex flex-col gap-3">
      {comMedida ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${prefixo}-medida`} className="text-sm font-medium">
            Como você usa nas receitas
          </label>
          <select
            id={`${prefixo}-medida`}
            name="unidade_base"
            value={medida}
            onChange={(e) => setMedida(e.target.value as "g" | "ml" | "und")}
            className={campo}
          >
            {MEDIDAS.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.nome} — {m.dica}
              </option>
            ))}
          </select>
          <span className="text-xs text-texto-suave">Não muda depois.</span>
        </div>
      ) : (
        <input type="hidden" name="unidade_base" value={medida} />
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefixo}-tamanho`} className="text-sm font-medium">
          {t.tamanho}
        </label>
        <input
          id={`${prefixo}-tamanho`}
          name="tamanho"
          inputMode="decimal"
          placeholder={`Ex.: ${t.exemplo}`}
          value={tamanho}
          onChange={(e) => setTamanho(e.target.value)}
          className={campo}
        />
        <span className="text-xs text-texto-suave">{t.dica}</span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefixo}-preco`} className="text-sm font-medium">
          Preço da embalagem (R$)
        </label>
        <input
          id={`${prefixo}-preco`}
          name="preco"
          inputMode="decimal"
          placeholder="Ex.: 16,00"
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          className={campo}
        />
      </div>

      {conta != null ? (
        <p className="rounded-xl bg-fundo px-3 py-2 text-sm" aria-live="polite">
          Cada {medida === "und" ? "unidade" : medida} custa <strong>{formatarCustoUnidade(conta, medida).replace(`/${medida}`, "")}</strong>. É esse valor que entra no custo das receitas.
        </p>
      ) : null}

      {comEstoque ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${prefixo}-estoque`} className="text-sm font-medium">
            Quanto você tem agora ({medida}) — opcional
          </label>
          <input id={`${prefixo}-estoque`} name="estoque" inputMode="decimal" placeholder="Ex.: 1500" className={campo} />
          <span className="text-xs text-texto-suave">
            Se já tem esse insumo guardado. Entra como contagem inicial do estoque e não mexe no caixa.
          </span>
        </div>
      ) : null}
    </div>
  );
}
