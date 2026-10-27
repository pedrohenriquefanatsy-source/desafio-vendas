-- Decisão D2 (aprovada em 27/10/2026, docs/plano.md).
-- Remove a tabela de teste "bancogestão", criada antes deste projeto: vazia e com
-- uma política que liberava leitura e escrita para qualquer pessoa, mesmo sem login.
-- Por segurança, a migration para se a tabela tiver alguma linha.
do $$
begin
  if to_regclass('public."bancogestão"') is not null then
    if exists (select 1 from public."bancogestão") then
      raise exception 'A tabela "bancogestão" tem dados. Migration interrompida para não apagar nada.';
    end if;
    drop table public."bancogestão";
  end if;
end
$$;
