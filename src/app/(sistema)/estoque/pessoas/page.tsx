import { Abas, BotaoVoltar, Cartao, EstadoVazio, ItemLista, LinkBotao, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { formatarData, formatarDataHora, formatarHora, hojeIso } from "@/lib/datas";
import { formatarQuantidade, formatarReais } from "@/lib/numeros";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { listarParticipantes } from "@/servicos/participantes";
import { listarEstoquePessoas, listarEstoqueProdutos, type EstoqueProduto } from "@/servicos/estoque";
import { listarVendas } from "@/servicos/vendas";
import { moverEstoquePessoa } from "../acoes";

// Estoque de cada pessoa: quem pega potinhos para vender registra aqui. Sai do estoque geral e fica com a pessoa;
// quando ela vende, sai do que está com ela; o que sobrar ela devolve.
const campo = "min-h-toque w-24 rounded-xl border border-borda bg-superficie px-3 text-right text-base tabular-nums";

const nomeSabor = (produto: string | null, variacao: string | null) =>
  !variacao || variacao === "Única" ? (produto ?? "") : `${produto} · ${variacao}`;

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EstoquePessoas({ searchParams }: PageProps<"/estoque/pessoas">) {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const { aba, pessoa } = await searchParams;
  const abas = (
    <Abas
      atual={aba === "vendas" ? "vendas" : "estoque"}
      abas={[
        { valor: "estoque", rotulo: "Estoque", href: "/estoque/pessoas" },
        { valor: "vendas", rotulo: "Minhas vendas", href: "/estoque/pessoas?aba=vendas" },
      ]}
    />
  );
  if (aba === "vendas") {
    const escolhida = admin && typeof pessoa === "string" && UUID.test(pessoa) ? pessoa : perfil.id;
    return (
      <>
        <BotaoVoltar href="/estoque">Estoque</BotaoVoltar>
        <TituloPagina apoio="As vendas que você registrou, do mais novo para o mais antigo. Toque numa para ver os detalhes.">Minhas vendas</TituloPagina>
        {abas}
        <MinhasVendas pessoa={escolhida} eu={perfil.id} admin={admin} />
      </>
    );
  }
  const [produtos, comPessoas, pessoas] = await Promise.all([
    listarEstoqueProdutos(),
    listarEstoquePessoas(),
    admin ? listarParticipantes() : Promise.resolve([]),
  ]);
  const meus = comPessoas.filter((c) => c.participante_id === perfil.id);
  const porPessoa = new Map<string, typeof comPessoas>();
  for (const c of comPessoas) porPessoa.set(c.participante ?? "—", [...(porPessoa.get(c.participante ?? "—") ?? []), c]);
  const ativos = pessoas.filter((p) => p.ativo);
  // Para pegar, todos os sabores (o estoque geral pode ficar negativo); para devolver, só o que está com alguém.
  const paraPegar = produtos;
  const paraDevolver = produtos.filter((p) => Number(p.com_pessoas) > 0);

  return (
    <>
      <BotaoVoltar href="/estoque">Estoque</BotaoVoltar>
      <TituloPagina apoio="Pegou potinhos para vender? Registre aqui: saem do estoque geral e ficam com você. Quando você vende, sai do que está com você. O que sobrar, devolva.">
        Estoque de cada pessoa
      </TituloPagina>
      {abas}

      {produtos.length === 0 ? (
        <EstadoVazio titulo="Nenhum produto cadastrado" acao={<LinkBotao href="/mais/produtos" variante="secundario">Ir para Produtos</LinkBotao>}>
          Cadastre os produtos para registrar o que cada pessoa leva.
        </EstadoVazio>
      ) : (
        <div className="flex flex-col gap-4">
          <Cartao>
            <h2 className="mb-2 font-semibold">Com você</h2>
            {meus.length ? (
              <ul className="divide-y divide-borda">
                {meus.map((m) => (
                  <li key={m.variacao_id} className="flex justify-between gap-3 py-2">
                    <span>{nomeSabor(m.produto, m.variacao)}</span>
                    <span className="font-semibold tabular-nums">{formatarQuantidade(m.saldo)} und</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-texto-suave">Nenhum potinho com você agora.</p>
            )}
          </Cartao>

          <FormularioMover tipo="retirada" produtos={paraPegar} pessoas={admin ? ativos : []} eu={perfil.id} />
          {paraDevolver.length ? (
            <FormularioMover tipo="devolucao" produtos={paraDevolver} pessoas={admin ? ativos : []} eu={perfil.id} />
          ) : null}

          <section>
            <h2 className="mb-2 font-semibold">Com cada pessoa</h2>
            {porPessoa.size ? (
              <div className="flex flex-col gap-2">
                {[...porPessoa.entries()].map(([nome, itens]) => (
                  <Cartao key={nome}>
                    <p className="flex justify-between gap-3 font-medium">
                      <span>{nome}</span>
                      <span className="tabular-nums">{formatarQuantidade(itens.reduce((t, i) => t + Number(i.saldo ?? 0), 0))} und</span>
                    </p>
                    <ul className="mt-1 text-sm text-texto-suave">
                      {itens.map((i) => (
                        <li key={i.variacao_id} className="flex justify-between gap-3">
                          <span>{nomeSabor(i.produto, i.variacao)}</span>
                          <span className="tabular-nums">{formatarQuantidade(i.saldo)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-texto-suave">
                      Última movimentação: {formatarDataHora(itens.map((i) => i.ultima_movimentacao ?? "").sort().at(-1))}
                    </p>
                  </Cartao>
                ))}
              </div>
            ) : (
              <p className="text-sm text-texto-suave">Ninguém está com potinhos agora. Tudo está no estoque geral.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function FormularioMover({
  tipo,
  produtos,
  pessoas,
  eu,
}: {
  tipo: "retirada" | "devolucao";
  produtos: EstoqueProduto[];
  pessoas: { id: string; nome: string | null }[];
  eu: string;
}) {
  const pegar = tipo === "retirada";
  return (
    <Cartao>
      <h2 className="mb-1 font-semibold">{pegar ? "Peguei para vender" : "Devolvi ao estoque"}</h2>
      <p className="mb-3 text-sm text-texto-suave">
        {pegar
          ? "Quantos potinhos de cada sabor você levou. Deixe em branco o que não pegou. Se o estoque geral não tiver, ele fica negativo até a contagem do dia."
          : "Quantos potinhos voltaram para o estoque geral."}
      </p>
      <Formulario
        acao={moverEstoquePessoa}
        textoBotao={pegar ? "Registrar o que peguei" : "Registrar a devolução"}
        textoEnviando="Registrando…"
        variante={pegar ? "primario" : "secundario"}
        limparAoSalvar
      >
        <input type="hidden" name="tipo" value={tipo} />
        {pessoas.length ? (
          <Selecao id={`pessoa-${tipo}`} name="participante" rotulo="Quem" defaultValue={eu}>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome ?? "Sem nome"}
              </option>
            ))}
          </Selecao>
        ) : null}
        <div className="divide-y divide-borda">
          {produtos.map((p) => (
            <label key={p.variacao_id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block break-words font-medium">{nomeSabor(p.produto, p.variacao)}</span>
                <span className="block text-xs text-texto-suave">
                  {formatarQuantidade(p.no_estoque)} no estoque geral · {formatarQuantidade(p.com_pessoas)} com as pessoas
                </span>
              </span>
              <input
                name={`q_${p.variacao_id}`}
                inputMode="decimal"
                placeholder="0"
                aria-label={`${pegar ? "Peguei" : "Devolvi"} de ${nomeSabor(p.produto, p.variacao)}`}
                className={campo}
              />
            </label>
          ))}
        </div>
      </Formulario>
    </Cartao>
  );
}

// Vendas de uma pessoa (sem as canceladas), agrupadas por dia, com os totais de hoje e de todas.
async function MinhasVendas({ pessoa, eu, admin }: { pessoa: string; eu: string; admin: boolean }) {
  const hoje = hojeIso();
  const [vendas, pessoas] = await Promise.all([
    listarVendas("todas", { participante: pessoa }, hoje),
    admin ? listarParticipantes() : Promise.resolve([]),
  ]);
  const vendidas = vendas.filter((v) => v.tipo !== "doacao");
  const soma = (lista: typeof vendas) => lista.reduce((t, v) => t + Number(v.total ?? 0), 0);
  const deHoje = vendidas.filter((v) => v.dia === hoje);
  const aReceber = vendas.reduce((t, v) => t + Number(v.a_receber ?? 0), 0);
  const porDia = new Map<string, typeof vendas>();
  for (const v of vendas) porDia.set(v.dia ?? "", [...(porDia.get(v.dia ?? "") ?? []), v]);

  return (
    <div className="flex flex-col gap-4">
      {admin ? (
        <form method="get" action="/estoque/pessoas" className="flex items-end gap-2">
          <input type="hidden" name="aba" value="vendas" />
          <div className="flex-1">
            <Selecao id="pessoa" name="pessoa" rotulo="De quem" defaultValue={pessoa}>
              {pessoas.filter((p) => p.ativo).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === eu ? `${p.nome ?? "Você"} (você)` : (p.nome ?? "Sem nome")}
                </option>
              ))}
            </Selecao>
          </div>
          <button type="submit" className="min-h-toque rounded-xl border border-borda bg-superficie px-4 font-medium">
            Ver
          </button>
        </form>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Cartao>
          <p className="text-sm text-texto-suave">Hoje</p>
          <p className="text-xl font-semibold tabular-nums">{formatarReais(soma(deHoje))}</p>
          <p className="text-xs text-texto-suave">
            {deHoje.length} {deHoje.length === 1 ? "venda" : "vendas"}
          </p>
        </Cartao>
        <Cartao>
          <p className="text-sm text-texto-suave">No total</p>
          <p className="text-xl font-semibold tabular-nums">{formatarReais(soma(vendidas))}</p>
          <p className="text-xs text-texto-suave">
            {vendidas.length} {vendidas.length === 1 ? "venda" : "vendas"}
            {aReceber > 0 ? ` · a receber ${formatarReais(aReceber)}` : ""}
          </p>
        </Cartao>
      </div>
      {vendas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma venda ainda" acao={<LinkBotao href="/vendas/nova">Nova venda</LinkBotao>}>
          As vendas registradas aparecem aqui.
        </EstadoVazio>
      ) : (
        [...porDia.entries()].map(([dia, lista]) => (
          <section key={dia}>
            <h2 className="mb-2 flex justify-between text-sm font-medium text-texto-suave">
              <span>{dia === hoje ? "Hoje" : formatarData(dia)}</span>
              <span className="tabular-nums">{formatarReais(soma(lista.filter((v) => v.tipo !== "doacao")))}</span>
            </h2>
            <Cartao className="divide-y divide-borda p-0">
              {lista.map((v) => (
                <ItemLista
                  key={v.id}
                  href={`/vendas/${v.id}`}
                  titulo={`${v.cliente ?? (v.cliente_desconhecido ? "cliente desconhecido" : "sem cliente")} · ${formatarHora(v.data_hora)}`}
                  apoio={`nº ${v.numero} · ${v.itens_resumo ?? ""}`}
                  direita={
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold tabular-nums">{formatarReais(v.total)}</span>
                      {v.tipo === "doacao" ? (
                        <Selo>Doação</Selo>
                      ) : v.tipo === "encomenda" && v.situacao_entrega !== "entregue" ? (
                        <Selo tom="alerta">Encomenda</Selo>
                      ) : Number(v.a_receber) > 0 ? (
                        <Selo tom="alerta">A receber</Selo>
                      ) : null}
                    </span>
                  }
                />
              ))}
            </Cartao>
          </section>
        ))
      )}
    </div>
  );
}
