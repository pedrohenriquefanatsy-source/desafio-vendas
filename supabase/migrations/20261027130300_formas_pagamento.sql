-- Fatia 1: formas de pagamento com taxa percentual (Seção 4.2). Todas caem no mesmo caixa.
-- Não se apaga: desativa (vendas antigas continuam apontando para ela).

create table public.formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 40),
  taxa_percentual numeric(5, 2) not null default 0
    check (taxa_percentual >= 0 and taxa_percentual < 100),
  ativa boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid
);

create unique index formas_pagamento_nome_unico on public.formas_pagamento (lower(btrim(nome)));

alter table public.formas_pagamento enable row level security;
revoke delete on public.formas_pagamento from authenticated;

create policy formas_pagamento_leitura on public.formas_pagamento
  for select to authenticated using (public.eh_participante());
create policy formas_pagamento_inclusao_admin on public.formas_pagamento
  for insert to authenticated with check (public.eh_admin());
create policy formas_pagamento_alteracao_admin on public.formas_pagamento
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

create trigger formas_pagamento_registro before insert or update on public.formas_pagamento
  for each row execute function public.preencher_registro();
create trigger formas_pagamento_auditoria after insert or update or delete on public.formas_pagamento
  for each row execute function public.registrar_auditoria();

insert into public.formas_pagamento (nome, taxa_percentual, ordem) values ('Pix', 0, 1);
