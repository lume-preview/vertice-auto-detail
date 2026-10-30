
-- ==========================================
-- LUME AGENDA UNIVERSAL
-- BANCO DE DADOS CLOUDFLARE D1 / SQLite
--
-- Uma instalacao Cloudflare e um banco D1
-- independente para cada cliente.
--
-- Este arquivo cria apenas as tabelas.
-- Nao insere dados ficticios.
-- ==========================================

PRAGMA foreign_keys = ON;

-- ==========================================
-- 1. DADOS DO ESTABELECIMENTO
-- ==========================================

CREATE TABLE IF NOT EXISTS business_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),

  business_name TEXT NOT NULL
    CHECK (length(trim(business_name)) BETWEEN 1 AND 150),

  business_type TEXT NOT NULL DEFAULT 'outro',

  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',

  phone TEXT,
  email TEXT,
  address TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. CONFIGURACOES DE AGENDAMENTO
-- ==========================================

CREATE TABLE IF NOT EXISTS scheduling_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),

  capacity INTEGER NOT NULL DEFAULT 1
    CHECK (capacity BETWEEN 1 AND 100),

  slot_interval_minutes INTEGER NOT NULL DEFAULT 60
    CHECK (slot_interval_minutes IN (15, 30, 60)),

  booking_horizon_days INTEGER NOT NULL DEFAULT 90
    CHECK (booking_horizon_days BETWEEN 1 AND 730),

  minimum_notice_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (minimum_notice_minutes >= 0),

  approval_required INTEGER NOT NULL DEFAULT 1
    CHECK (approval_required IN (0, 1)),

  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 3. DIAS E HORARIOS DE FUNCIONAMENTO
--
-- 0 = Domingo
-- 1 = Segunda
-- 2 = Terca
-- 3 = Quarta
-- 4 = Quinta
-- 5 = Sexta
-- 6 = Sabado
-- ==========================================

CREATE TABLE IF NOT EXISTS weekly_hours (
  weekday INTEGER PRIMARY KEY
    CHECK (weekday BETWEEN 0 AND 6),

  is_open INTEGER NOT NULL DEFAULT 0
    CHECK (is_open IN (0, 1)),

  opens_at TEXT NOT NULL DEFAULT '09:00'
    CHECK (
      opens_at GLOB '[0-2][0-9]:[0-5][0-9]'
      AND substr(opens_at, 1, 2) BETWEEN '00' AND '23'
    ),

  closes_at TEXT NOT NULL DEFAULT '18:00'
    CHECK (
      closes_at GLOB '[0-2][0-9]:[0-5][0-9]'
      AND substr(closes_at, 1, 2) BETWEEN '00' AND '23'
    ),

  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (opens_at < closes_at)
);

-- ==========================================
-- 4. CATALOGO DE SERVICOS
-- ==========================================

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY NOT NULL,

  name TEXT NOT NULL
    CHECK (length(trim(name)) BETWEEN 1 AND 150),

  description TEXT,

  price_cents INTEGER NOT NULL DEFAULT 0
    CHECK (price_cents >= 0),

  duration_minutes INTEGER NOT NULL
    CHECK (duration_minutes BETWEEN 1 AND 1440),

  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_services_active_name
ON services(is_active, name);

-- ==========================================
-- 5. BLOQUEIOS DA AGENDA
--
-- Horarios nulos = bloqueio do dia inteiro.
-- Horarios preenchidos = bloqueio parcial.
-- ==========================================

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id TEXT PRIMARY KEY NOT NULL,

  block_date TEXT NOT NULL
    CHECK (
      block_date GLOB
      '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
    ),

  start_time TEXT,
  end_time TEXT,

  reason TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (
    (
      start_time IS NULL
      AND end_time IS NULL
    )
    OR
    (
      start_time IS NOT NULL
      AND end_time IS NOT NULL

      AND start_time GLOB '[0-2][0-9]:[0-5][0-9]'
      AND end_time GLOB '[0-2][0-9]:[0-5][0-9]'

      AND substr(start_time, 1, 2) BETWEEN '00' AND '23'
      AND substr(end_time, 1, 2) BETWEEN '00' AND '23'

      AND start_time < end_time
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_date
ON schedule_blocks(block_date);

-- ==========================================
-- 6. AGENDAMENTOS
--
-- Cada reserva preserva o nome, duracao
-- e preco do servico naquele momento.
-- ==========================================

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY NOT NULL,

  service_id TEXT
    REFERENCES services(id)
    ON DELETE SET NULL,

  service_name TEXT NOT NULL,

  service_duration_minutes INTEGER NOT NULL
    CHECK (service_duration_minutes BETWEEN 1 AND 1440),

  service_price_cents INTEGER NOT NULL
    CHECK (service_price_cents >= 0),

  customer_name TEXT NOT NULL
    CHECK (length(trim(customer_name)) BETWEEN 1 AND 150),

  customer_phone TEXT NOT NULL
    CHECK (length(trim(customer_phone)) >= 5),

  customer_email TEXT,

  -- Pode armazenar informacoes especificas
  -- como veiculo, profissional ou pet.
  customer_details TEXT,

  appointment_date TEXT NOT NULL
    CHECK (
      appointment_date GLOB
      '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
    ),

  start_time TEXT NOT NULL
    CHECK (
      start_time GLOB '[0-2][0-9]:[0-5][0-9]'
      AND substr(start_time, 1, 2) BETWEEN '00' AND '23'
    ),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'confirmed',
        'completed',
        'cancelled',
        'rejected'
      )
    ),

  source TEXT NOT NULL DEFAULT 'public'
    CHECK (source IN ('public', 'admin')),

  notes TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appointments_date_status_time
ON appointments(appointment_date, status, start_time);

CREATE INDEX IF NOT EXISTS idx_appointments_customer_phone
ON appointments(customer_phone);

-- ==========================================
-- REGRAS IMPLEMENTADAS FUTURAMENTE NA API
--
-- 1. Calcular horarios conforme funcionamento.
-- 2. Respeitar a duracao de cada servico.
-- 3. Respeitar a capacidade simultanea.
-- 4. Impedir conflitos de agendamento.
-- 5. Considerar agendamentos pendentes.
-- 6. Respeitar dias e horarios bloqueados.
-- 7. Validar o fuso horario da empresa.
-- 8. Proteger o dashboard com autenticacao.
-- 9. Salvar agendamentos de forma atomica.
-- 10. Proteger os dados pessoais conforme LGPD.
-- 11. Aplicar migracoes em cada instalacao.
-- ==========================================
