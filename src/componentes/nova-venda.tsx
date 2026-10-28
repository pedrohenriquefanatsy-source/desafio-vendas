"use client";

import { useMemo, useState } from "react";
import { CircleHelp, Minus, Plus, Search, UserRound } from "lucide-react";
import { Formulario } from "./formulario";
import { lerNumero, formatarReais, formatarQuantidade } from "@/lib/numeros";
import type { Resultado } from "@/servicos/erros";

export type ProdutoGrade = { id: string; nome: string; preco: number; estoque: number; kit: boolean; busca: string };
export type FormaGrade = { id: string; nome: string; taxa: number };
export type VendaInicial = {
  itens: { id: string; quantidade: number }[];
  forma?: string;
  cliente?: string;
  bairro?: string;
  desconhecido?: boolean;
  observacao?: string;
};
export type ClienteConhecido = { nome: string; bairro: string | null };

type Tipo = "venda" | "encomenda" | "doacao";
type Pagamento = "paga" | "pendente" | "parcial";

const chip = (ativo: boolean) =>
  `inline-flex min-h-toque items-center justify-center rounded-full border px-4 text-sm font-medium ${
    ativo ? "border-acao bg-acao text-acao-texto" : "border-borda bg-superficie text-texto"
  }`;
const campo = "min-h-toque w-full rounded-xl border border-borda bg-superficie px-3 text-base";

// Nova venda (Seção 3.2): grade de produtos → quantidade → pagamento → confirmar.
// O total aqui é só prévia; preço, desconto, custo e margem oficiais vêm do banco.
export function NovaVenda({
  produtos,
  formas,
  formaPadrao,
  hoje,
  inicial,
  clientes,
  bairros,
  acao,
}: {
  produtos: ProdutoGrade[];
  formas: FormaGrade[];
  formaPadrao: string | null;
  hoje: string;
  inicial?: VendaInicial;
  clientes: ClienteConhecido[];
  bairros: string[];
  acao: (anterior: Resultado | null, dados: FormData) => Promise<Resultado>;
}) {
  const [quantidades, setQuantidades] = useState<Record<string, number>>(() =>
    Object.fromEntries((inicial?.itens ?? []).filter((i) => produtos.some((p) => p.id === i.id)).map((i) => [i.id, i.quantidade])),
  );
  const [ordem, setOrdem] = useState<string[]>(() => Object.keys(quantidades));
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<Tipo>("venda");
  const [pagamento, setPagamento] = useState<Pagamento>("paga");
  const [forma, setForma] = useState(inicial?.forma ?? formaPadrao ?? formas[0]?.id ?? "");
  const [desconto, setDesconto] = useState("");
  const [maisOpcoes, setMaisOpcoes] = useState(Boolean(inicial?.observacao));
  // Cliente: "desconhecido" já vem marcado (a venda de rua é o caso comum e continua em 3 toques);
  // quem quer anotar o cliente toca em "Informar cliente". Pendente ou parcial sempre pede o nome.
  const [modoCliente, setModoCliente] = useState<"informar" | "desconhecido">(inicial?.cliente || inicial?.desconhecido === false ? "informar" : "desconhecido");
  const [nomeCliente, setNomeCliente] = useState(inicial?.cliente ?? "");
  const [bairro, setBairro] = useState(inicial?.bairro ?? "");

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const visiveis = busca.trim()
    ? produtos.filter((p) => p.busca.includes(busca.trim().toLocaleLowerCase("pt-BR")))
    : produtos;
  const escolhidos = ordem.filter((id) => (quantidades[id] ?? 0) > 0);
  const doacao = tipo === "doacao";
  const precisaNome = !doacao && pagamento !== "paga";
  const desconhecido = modoCliente === "desconhecido" && !precisaNome;
  const precoDe = (id: string) => (precos[id] ? (lerNumero(precos[id]) ?? 0) : (porId.get(id)?.preco ?? 0));
  const subtotal = doacao ? 0 : escolhidos.reduce((t, id) => t + Math.round(precoDe(id) * quantidades[id] * 100) / 100, 0);
  const total = Math.max(0, subtotal - (doacao ? 0 : (lerNumero(desconto) ?? 0)));

  function somar(id: string, delta: number) {
    setQuantidades((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + delta) }));
    setOrdem((o) => (o.includes(id) ? o : [...o, id]));
  }

  const itens = JSON.stringify(
    escolhidos.map((id) => ({ variacao_id: id, quantidade: quantidades[id], ...(precos[id] && !doacao ? { preco: precos[id] } : {}) })),
  );
  const textoBotao = escolhidos.length === 0
    ? "Escolha um produto"
    : doacao
      ? "Registrar doação"
      : `${tipo === "encomenda" ? "Confirmar encomenda" : "Confirmar"} ${formatarReais(total)}`;

  return (
    <Formulario acao={acao} textoBotao={textoBotao} textoEnviando="Registrando…" desabilitado={escolhidos.length === 0} botaoFixo>
      <input type="hidden" name="itens" value={itens} />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="forma" value={doacao ? "" : forma} />
      <input type="hidden" name="pagamento" value={pagamento} />
      <input type="hidden" name="cliente_desconhecido" value={desconhecido ? "1" : ""} />

      {produtos.length > 8 ? (
        <label className="relative block">
          <span className="sr-only">Buscar produto</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-texto-suave" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto ou apelido"
            className={`${campo} pl-10`}
          />
        </label>
      ) : null}

      <ul className="grid grid-cols-2 gap-2" aria-label="Produtos">
        {visiveis.map((p) => {
          const qtd = quantidades[p.id] ?? 0;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => somar(p.id, 1)}
                aria-label={`${p.nome}, ${formatarReais(p.preco)}${qtd ? `, ${qtd} escolhido(s)` : ""}. Tocar adiciona 1.`}
                className={`relative flex min-h-20 w-full flex-col items-start justify-between gap-1 rounded-cartao border p-3 text-left ${
                  qtd ? "border-acao bg-superficie ring-2 ring-acao" : "border-borda bg-superficie"
                }`}
              >
                <span className="font-medium leading-tight">{p.nome}</span>
                <span className="flex w-full flex-wrap items-end justify-between gap-x-2">
                  <span className="tabular-nums">{formatarReais(p.preco)}</span>
                  <span className={`whitespace-nowrap text-xs ${p.estoque <= 0 ? "text-alerta" : "text-texto-suave"}`}>
                    {p.estoque <= 0 ? "sem estoque" : `${formatarQuantidade(p.estoque)} ${p.kit ? "possíveis" : "prontos"}`}
                  </span>
                </span>
                {qtd ? (
                  <span className="absolute -right-1 -top-1 flex size-7 items-center justify-center rounded-full bg-acao text-sm font-semibold text-acao-texto">
                    {qtd}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {visiveis.length === 0 ? <p className="text-sm text-texto-suave">Nenhum produto com “{busca}”.</p> : null}

      {escolhidos.length ? (
        <section aria-label="Itens da venda" className="rounded-cartao border border-borda bg-superficie p-3">
          <ul className="flex flex-col divide-y divide-borda">
            {escolhidos.map((id) => {
              const p = porId.get(id);
              return (
                <li key={id} className="flex items-center gap-2 py-2">
                  <span className="flex-1">
                    <span className="block font-medium leading-tight">{p?.nome}</span>
                    {!doacao ? (
                      <span className="text-sm tabular-nums text-texto-suave">{formatarReais(precoDe(id) * quantidades[id])}</span>
                    ) : null}
                  </span>
                  <button type="button" onClick={() => somar(id, -1)} aria-label={`Tirar 1 ${p?.nome}`} className="flex size-11 items-center justify-center rounded-xl border border-borda">
                    <Minus aria-hidden className="size-5" />
                  </button>
                  <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{quantidades[id]}</span>
                  <button type="button" onClick={() => somar(id, 1)} aria-label={`Mais 1 ${p?.nome}`} className="flex size-11 items-center justify-center rounded-xl border border-borda">
                    <Plus aria-hidden className="size-5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!doacao ? (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Forma de pagamento</legend>
            <div className="flex flex-wrap gap-2">
              {formas.map((f) => (
                <button key={f.id} type="button" aria-pressed={forma === f.id} onClick={() => setForma(f.id)} className={chip(forma === f.id)}>
                  {f.nome}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Pagamento</legend>
            <div className="grid grid-cols-3 gap-2">
              {(["paga", "pendente", "parcial"] as const).map((p) => (
                <button key={p} type="button" aria-pressed={pagamento === p} onClick={() => setPagamento(p)} className={chip(pagamento === p)}>
                  {p === "paga" ? "Paga" : p === "pendente" ? "Pendente" : "Parcial"}
                </button>
              ))}
            </div>
            {pagamento === "parcial" ? (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Quanto recebeu agora (R$)
                <input name="valor_recebido" inputMode="decimal" required placeholder="0,00" className={campo} />
              </label>
            ) : null}
          </fieldset>
        </>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Cliente</legend>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={!desconhecido} onClick={() => setModoCliente("informar")} className={`${chip(!desconhecido)} gap-2`}>
            <UserRound aria-hidden className="size-4" /> Informar cliente
          </button>
          <button
            type="button"
            aria-pressed={desconhecido}
            disabled={precisaNome}
            onClick={() => setModoCliente("desconhecido")}
            className={`${chip(desconhecido)} gap-2 disabled:opacity-50`}
          >
            <CircleHelp aria-hidden className="size-4" /> Desconhecido
          </button>
        </div>
        {!desconhecido ? (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nome do cliente{precisaNome ? "" : " (opcional)"}
            <input
              name="cliente"
              list="clientes-conhecidos"
              value={nomeCliente}
              onChange={(e) => {
                setNomeCliente(e.target.value);
                const achado = clientes.find((c) => c.nome.toLocaleLowerCase("pt-BR") === e.target.value.trim().toLocaleLowerCase("pt-BR"));
                if (achado?.bairro && !bairro.trim()) setBairro(achado.bairro);
              }}
              maxLength={60}
              required={precisaNome}
              autoComplete="off"
              placeholder="Nome de quem comprou"
              className={campo}
            />
          </label>
        ) : (
          <p className="text-xs text-texto-suave">Cliente desconhecido: a venda conta normalmente, só não fica ligada a um nome.</p>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Bairro (opcional)
          <input
            name="bairro"
            list="bairros-conhecidos"
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            maxLength={60}
            autoComplete="off"
            placeholder="Ex.: Aldeota"
            className={campo}
          />
        </label>
        {precisaNome ? <p className="text-xs text-texto-suave">Venda pendente ou parcial precisa do nome do cliente, para saber de quem cobrar.</p> : null}
        <datalist id="clientes-conhecidos">
          {clientes.map((c) => (
            <option key={c.nome} value={c.nome} />
          ))}
        </datalist>
        <datalist id="bairros-conhecidos">
          {bairros.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </fieldset>

      <details open={maisOpcoes} onToggle={(e) => setMaisOpcoes(e.currentTarget.open)} className="rounded-cartao border border-borda bg-superficie">
        <summary className="flex min-h-toque cursor-pointer list-none items-center px-4 font-medium [&::-webkit-details-marker]:hidden">
          Mais opções: encomenda, doação, desconto, preço…
        </summary>
        <div className="flex flex-col gap-3 border-t border-borda p-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Tipo</legend>
            <div className="grid grid-cols-3 gap-2">
              {(["venda", "encomenda", "doacao"] as const).map((t) => (
                <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)} className={chip(tipo === t)}>
                  {t === "venda" ? "Venda" : t === "encomenda" ? "Encomenda" : "Doação"}
                </button>
              ))}
            </div>
            {tipo === "encomenda" ? (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Data de entrega
                <input name="entrega" type="date" min={hoje} required className={campo} />
                <span className="text-xs font-normal text-texto-suave">O estoque só baixa quando você marcar como entregue.</span>
              </label>
            ) : null}
            {doacao ? <p className="text-xs text-texto-suave">Doação ou brinde: sai do estoque e o custo entra no resultado, sem receita.</p> : null}
          </fieldset>
          {!doacao ? (
            <>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Desconto na venda (R$)
                <input name="desconto" inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0,00" className={campo} />
              </label>
              {escolhidos.length ? (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium">Preço de cada um (R$)</legend>
                  {escolhidos.map((id) => (
                    <label key={id} className="grid grid-cols-[1fr_7rem] items-center gap-2 text-sm">
                      {porId.get(id)?.nome}
                      <input
                        inputMode="decimal"
                        value={precos[id] ?? ""}
                        onChange={(e) => setPrecos((p) => ({ ...p, [id]: e.target.value }))}
                        placeholder={String(porId.get(id)?.preco.toFixed(2)).replace(".", ",")}
                        aria-label={`Preço de ${porId.get(id)?.nome}`}
                        className={campo}
                      />
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </>
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-medium">
            Observação (opcional)
            <input name="observacao" defaultValue={inicial?.observacao} maxLength={300} className={campo} />
          </label>
        </div>
      </details>

      {escolhidos.length && !doacao ? (
        <p className="flex items-baseline justify-between">
          <span className="text-texto-suave">Total</span>
          <span className="text-2xl font-semibold tabular-nums">{formatarReais(total)}</span>
        </p>
      ) : null}
    </Formulario>
  );
}
