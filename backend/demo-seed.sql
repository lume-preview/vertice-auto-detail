
-- ==========================================
-- LUME AGENDA
-- DADOS DE DEMONSTRACAO
--
-- Ambiente de desenvolvimento da Lume.
-- Estes dados NAO pertencem a um cliente real.
--
-- Nao executar em instalacoes de clientes.
-- ==========================================

-- ==========================================
-- 1. ESTABELECIMENTO DEMONSTRATIVO
-- ==========================================

INSERT INTO business_profile (
  id,
  business_name,
  business_type,
  timezone
)
VALUES (
  1,
  'Vértice Auto Detail - Demonstração',
  'estetica_automotiva',
  'America/Sao_Paulo'
)
ON CONFLICT(id) DO UPDATE SET
  business_name = excluded.business_name,
  business_type = excluded.business_type,
  timezone = excluded.timezone,
  updated_at = CURRENT_TIMESTAMP;

-- ==========================================
-- 2. CONFIGURACOES INICIAIS
-- ==========================================

INSERT INTO scheduling_settings (
  id,
  capacity,
  slot_interval_minutes,
  booking_horizon_days,
  minimum_notice_minutes,
  approval_required
)
VALUES (
  1,
  1,
  60,
  90,
  0,
  1
)
ON CONFLICT(id) DO NOTHING;

-- ==========================================
-- 3. HORARIOS DA DEMONSTRACAO
--
-- Domingo: fechado
-- Segunda a sexta: 07:00 - 17:00
-- Sabado: 08:00 - 13:00
--
-- A API podera alterar esses valores
-- posteriormente pelo dashboard.
-- ==========================================

INSERT INTO weekly_hours (
  weekday,
  is_open,
  opens_at,
  closes_at
)
VALUES
  (0, 0, '08:00', '13:00'),
  (1, 1, '07:00', '17:00'),
  (2, 1, '07:00', '17:00'),
  (3, 1, '07:00', '17:00'),
  (4, 1, '07:00', '17:00'),
  (5, 1, '07:00', '17:00'),
  (6, 1, '08:00', '13:00')
ON CONFLICT(weekday) DO NOTHING;

-- ==========================================
-- 4. SERVICOS FICTICIOS
-- ==========================================

INSERT INTO services (
  id,
  name,
  description,
  price_cents,
  duration_minutes,
  is_active
)
VALUES (
  'lavagem-detalhada',
  'Lavagem detalhada',
  'Servico demonstrativo',
  12000,
  120,
  1
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO services (
  id,
  name,
  description,
  price_cents,
  duration_minutes,
  is_active
)
VALUES (
  'polimento-tecnico',
  'Polimento técnico',
  'Servico demonstrativo',
  35000,
  240,
  1
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO services (
  id,
  name,
  description,
  price_cents,
  duration_minutes,
  is_active
)
VALUES (
  'higienizacao-interna',
  'Higienização interna',
  'Servico demonstrativo',
  25000,
  180,
  1
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO services (
  id,
  name,
  description,
  price_cents,
  duration_minutes,
  is_active
)
VALUES (
  'vitrificacao',
  'Vitrificação',
  'Servico demonstrativo',
  60000,
  360,
  1
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO services (
  id,
  name,
  description,
  price_cents,
  duration_minutes,
  is_active
)
VALUES (
  'limpeza-motor',
  'Limpeza de motor',
  'Servico demonstrativo',
  10000,
  60,
  1
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO services (
  id,
  name,
  description,
  price_cents,
  duration_minutes,
  is_active
)
VALUES (
  'revitalizacao-farois',
  'Revitalização de faróis',
  'Servico demonstrativo',
  15000,
  120,
  1
)
ON CONFLICT(id) DO NOTHING;

-- ==========================================
-- FIM DOS DADOS DEMONSTRATIVOS
--
-- Nenhum cliente ou agendamento foi criado.
-- ==========================================
