import { BotaoVoltar, Cartao, EstadoVazio, LinkBotao, Selecao, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { formatarDataHora } from "@/lib/datas";
import { formatarQuantidade } from "@/lib/numeros";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { listarParticipantes } from "@/servicos/participantes";
import { listarEstoquePessoas, listarEstoqueProdutos, type EstoqueProduto } from "@/servicos/estoque";
import { moverEstoquePessoa } from "../acoes";

// Estoque de cada pessoa: quem pega potinhos para vender registra aqui. Sai do estoque geral e fica com a pessoa;
// quando ela vende, sai do que está com ela; o que sobrar ela devolve.
const campo = "min-h-toque w-24 rounded-xl border border-borda bg-superficie px-3 text-right text-base tabular-nums";

const nomeSabor = (produto: string | null, variacao: string | null) =>
  !variacao || variacao === "Única" ? (produto ?? "") : `${produto} · ${variacao}`;

export default async function EstoquePessoas() {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const [produtos, comPessoas, pessoas] = await Promise.all([
    listarEstoqueProdutos(),
    listarEstoquePessoas(),
    admin ? listarParticipantes() : Promise.resolve([]),
  ]);
  const meus = comPessoas.filter((c) => c.participante_id === perfil.id);
  const porPessoa = new Map<string, typeof comPessoas>();
  for (const c of comPessoas) porPessoa.set(c.participante ?? "—", [...(porPessoa.get(c.participante ?? "—") ?? []), c]);
  const ativos = pessoas.filter((p) => p.ativo);
  // Para pegar, só o que tem no estoque geral; para devolver, só o que está com alguém.
  const paraPegar = produtos.filter((p) => Number(p.no_estoque) > 0);
  const paraDevolver = produtos.filter((p) => Number(p.com_pessoas) > 0);

  return (
    <>
      <BotaoVoltar href="/estoque">Estoque</BotaoVoltar>
      <TituloPagina apoio="Pegou potinhos para vender? Registre aqui: saem do estoque geral e ficam com você. Quando você vende, sai do que está com você. O que sobrar, devolva.">
        Estoque de cada pessoa
      </TituloPagina>

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

          {paraPegar.length ? (
            <FormularioMover tipo="retirada" produtos={paraPegar} pessoas={admin ? ativos : []} eu={perfil.id} />
          ) : (
            <Cartao>
              <h2 className="mb-1 font-semibold">Peguei para vender</h2>
              <p className="text-sm text-texto-suave">Não tem potinho no estoque geral. Registre a produção primeiro.</p>
            </Cartao>
          )}
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
        {pegar ? "Quantos potinhos de cada sabor você levou. Deixe em branco o que não pegou." : "Quantos potinhos voltaram para o estoque geral."}
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
