-- 042: lista de remitentes bloqueados (spam). Se llena desde "Eliminar correo > Marcar como spam" en Ventas.
-- La sincronizacion de Gmail (WebApp_Backend.gs) NO guarda correos de estas direcciones: ni los pide a Gmail
-- (-from:) ni los inserta si aparecen. Se bloquea por direccion exacta, nunca por dominio.
-- Mismo patron de RLS que bib_remitentes_autorizados / bib_mensajes_ignorados.
create table if not exists public.bib_remitentes_bloqueados (
  email         text primary key check (email = lower(btrim(email)) and email <> ''),
  motivo        text,
  asunto_ejemplo text,
  bloqueado_por text,
  created_at    timestamptz not null default now()
);

alter table public.bib_remitentes_bloqueados enable row level security;

create policy auth_select on public.bib_remitentes_bloqueados for select to authenticated using (true);
create policy auth_insert on public.bib_remitentes_bloqueados for insert to authenticated with check (auth.uid() is not null);
create policy auth_update on public.bib_remitentes_bloqueados for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy auth_delete on public.bib_remitentes_bloqueados for delete to authenticated using (auth.uid() is not null);
