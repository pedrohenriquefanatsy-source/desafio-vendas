-- Limpa o projeto Supabase de TESTE (dfzawglgkgconblqrmwf) para uso pelo desafio-vendas.
-- Opção B, confirmada pelo usuário em 27/10/2026, depois de ver o conteúdo:
-- outro sistema (cobrança), com dados, sem cópia possível. Irreversível.
-- NUNCA rodar no projeto principal: o bloco abaixo confere o projeto antes de apagar.
do $$
declare
  r record;
begin
  if current_setting('app.confirmar_limpeza', true) is distinct from 'dfzawglgkgconblqrmwf' then
    raise exception 'Limpeza bloqueada. Rode antes: set app.confirmar_limpeza = ''dfzawglgkgconblqrmwf'';';
  end if;

  -- Views e views materializadas
  for r in select c.oid::regclass as obj, c.relkind from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('v', 'm')
             and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    execute format('drop %s if exists %s cascade',
                   case r.relkind when 'm' then 'materialized view' else 'view' end, r.obj);
  end loop;

  -- Tabelas (as políticas, gatilhos e índices vão junto)
  for r in select c.oid::regclass as obj from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'f')
             and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    execute format('drop table if exists %s cascade', r.obj);
  end loop;

  -- Funções e procedimentos (exceto os que pertencem a extensões)
  for r in select p.oid::regprocedure as obj, p.prokind from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute format('drop %s if exists %s cascade',
                   case r.prokind when 'p' then 'procedure' when 'a' then 'aggregate' else 'function' end, r.obj);
  end loop;

  -- Sequências avulsas
  for r in select c.oid::regclass as obj from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'S'
             and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype in ('e', 'a')) loop
    execute format('drop sequence if exists %s cascade', r.obj);
  end loop;

  -- Tipos (enums, domínios, compostos avulsos)
  for r in select t.oid::regtype as obj from pg_type t
           join pg_namespace n on n.oid = t.typnamespace
           where n.nspname = 'public' and t.typtype in ('e', 'd', 'c')
             and not exists (select 1 from pg_class c where c.reltype = t.oid)
             and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e') loop
    execute format('drop type if exists %s cascade', r.obj);
  end loop;

  -- Usuários do sistema anterior e histórico de migrations dele
  if to_regclass('auth.users') is not null then
    delete from auth.users;
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations;
  end if;
end
$$;
