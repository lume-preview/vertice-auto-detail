
-- ==========================================
-- LUME AGENDA UNIVERSAL
-- SISTEMA DE AUTENTICACAO
--
-- CLOUDFLARE D1 / SQLite
--
-- Cada cliente real tera seu proprio
-- banco de dados e seus usuarios.
--
-- Este arquivo:
-- 1. Cria a tabela de administradores
-- 2. Cria a tabela de sessoes
-- 3. Cria indices para consultas
--
-- NAO cria usuarios ou senhas ficticias.
-- NAO modifica as tabelas da agenda.
-- ==========================================


-- ==========================================
-- 1. USUARIOS ADMINISTRATIVOS
-- ==========================================

CREATE TABLE IF NOT EXISTS admin_users (

  -- Identificador unico do usuario
  id TEXT PRIMARY KEY NOT NULL,

  -- Email utilizado no login
  email TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (
      length(trim(email)) BETWEEN 3 AND 254
    ),

  -- Nome exibido no dashboard
  display_name TEXT NOT NULL
    CHECK (
      length(trim(display_name)) BETWEEN 1 AND 120
    ),

  -- Hash seguro da senha
  -- A senha original nunca sera armazenada
  password_hash TEXT NOT NULL
    CHECK (length(password_hash) >= 40),

  -- Perfil de permissao
  role TEXT NOT NULL DEFAULT 'owner'
    CHECK (
      role IN ('owner', 'manager')
    ),

  -- Usuario ativo ou desativado
  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0, 1)),

  -- Quantidade de tentativas incorretas
  failed_login_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (failed_login_attempts >= 0),

  -- Bloqueio temporario de login
  locked_until TEXT,

  -- Ultimo acesso
  last_login_at TEXT,

  -- Ultima alteracao de senha
  password_changed_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  -- Datas de controle
  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- 2. SESSOES ADMINISTRATIVAS
--
-- Somente o hash do token sera armazenado.
-- O token original sera enviado ao navegador
-- por um cookie seguro.
-- ==========================================

CREATE TABLE IF NOT EXISTS admin_sessions (

  -- Identificador da sessao
  id TEXT PRIMARY KEY NOT NULL,

  -- Usuario responsavel pela sessao
  user_id TEXT NOT NULL,

  -- Hash SHA-256 do token aleatorio
  -- Representado por 64 caracteres hexadecimais
  token_hash TEXT NOT NULL UNIQUE
    CHECK (length(token_hash) = 64),

  -- Data de criacao
  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  -- Data de expiracao
  expires_at TEXT NOT NULL,

  -- Ultima atividade
  last_seen_at TEXT,

  -- Encerramento ou revogacao
  revoked_at TEXT,

  FOREIGN KEY (user_id)
    REFERENCES admin_users(id)
    ON DELETE CASCADE
);


-- ==========================================
-- 3. INDICES DE CONSULTA
-- ==========================================

CREATE INDEX IF NOT EXISTS
  idx_admin_sessions_user
ON admin_sessions(user_id);


CREATE INDEX IF NOT EXISTS
  idx_admin_sessions_expiry
ON admin_sessions(expires_at);


-- ==========================================
-- REGRAS PARA A FUTURA API
--
-- 1. Utilizar hash de senha resistente,
--    como PBKDF2 configurado adequadamente.
--
-- 2. Gerar tokens criptograficamente seguros.
--
-- 3. Nunca enviar password_hash ao navegador.
--
-- 4. Utilizar cookies HttpOnly e Secure.
--
-- 5. Validar sessao em toda rota protegida.
--
-- 6. Aplicar limites de tentativas de login.
--
-- 7. Verificar expiracao e revogacao.
--
-- 8. Proteger requisicoes contra CSRF.
--
-- 9. Encerrar sessao ao realizar logout.
--
-- 10. Nunca utilizar senha fixa no frontend.
-- ==========================================
