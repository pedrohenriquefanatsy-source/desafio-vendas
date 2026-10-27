import { NextResponse, type NextRequest } from "next/server";
import { gerarCsv, gerarXlsx } from "@/lib/planilha";
import { hojeIso } from "@/lib/datas";
import { obterPerfil } from "@/servicos/sessao";
import { carregarExportacao, EXPORTACOES, type Filtros } from "@/servicos/exportacao";

// Baixa uma exportação: /exportar?tipo=vendas&formato=xlsx&de=2026-10-25&ate=2026-10-31
// &produto=<id>&participante=<id>. Os dados são lidos do Supabase com a permissão de
// quem pediu; usuário não logado ou inativo não recebe nada.
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(pedido: NextRequest) {
  const perfil = await obterPerfil();
  if (!perfil?.ativo) return NextResponse.json({ erro: "Faça login com um participante ativo." }, { status: 401 });

  const p = pedido.nextUrl.searchParams;
  const tipo = p.get("tipo") ?? "";
  const formato = p.get("formato") === "csv" ? "csv" : "xlsx";
  const def = EXPORTACOES[tipo];
  if (!def) return NextResponse.json({ erro: "Tipo de exportação desconhecido." }, { status: 400 });
  const filtros: Filtros = {};
  const de = p.get("de") ?? "";
  const ate = p.get("ate") ?? "";
  if (def.filtros.includes("periodo") && DATA.test(de)) filtros.de = de;
  if (def.filtros.includes("periodo") && DATA.test(ate)) filtros.ate = ate;
  if (def.filtros.includes("produto") && UUID.test(p.get("produto") ?? "")) filtros.produto = p.get("produto") ?? undefined;
  if (def.filtros.includes("participante") && UUID.test(p.get("participante") ?? "")) filtros.participante = p.get("participante") ?? undefined;

  let dados;
  try {
    dados = await carregarExportacao(tipo, filtros);
  } catch (erro) {
    return NextResponse.json({ erro: erro instanceof Error ? erro.message : "Não foi possível ler os dados." }, { status: 500 });
  }
  if (!dados) return NextResponse.json({ erro: "Tipo de exportação desconhecido." }, { status: 400 });

  const periodo = filtros.de || filtros.ate ? `_${filtros.de ?? "inicio"}_a_${filtros.ate ?? "hoje"}` : "";
  const arquivo = `${tipo}${periodo}_gerado_${hojeIso()}.${formato}`;
  const cabecalhos = {
    "Content-Disposition": `attachment; filename="${arquivo}"`,
    "Cache-Control": "no-store",
    "X-Total-Linhas": String(dados.linhas.length),
  };
  if (formato === "csv") {
    return new NextResponse(gerarCsv(dados.colunas, dados.linhas), {
      headers: { ...cabecalhos, "Content-Type": "text/csv; charset=utf-8" },
    });
  }
  const xlsx = gerarXlsx([{ nome: dados.titulo, colunas: dados.colunas, linhas: dados.linhas }]);
  return new NextResponse(Buffer.from(xlsx), {
    headers: { ...cabecalhos, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
}
