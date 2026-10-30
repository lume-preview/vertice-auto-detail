
/* ==========================================
   LUME AGENDA UNIVERSAL
   CLOUDFLARE WORKERS + D1

   API V1.2.0
   LEITURA PUBLICA + AUTENTICACAO

   INSTALACAO INDEPENDENTE POR CLIENTE
========================================== */

const API_VERSION = "1.2.0";

const COOKIE_NAME = "__Host-lume_session";

const SESSION_SECONDS = 60 * 60 * 8;

const MAX_LOGIN_ATTEMPTS = 5;

const LOCK_MINUTES = 15;

const encoder = new TextEncoder();

/* ==========================================
   1. FUNCOES DE RESPOSTA
========================================== */

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers
      }
    }
  );
}

function errorResponse(message, status = 400) {
  return jsonResponse({
    success: false,
    error: message
  }, status);
}

/* ==========================================
   2. FUNCOES CRIPTOGRAFICAS
========================================== */

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(value) {
  if (
    typeof value !== "string" ||
    value.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(value)
  ) {
    throw new Error("Formato hexadecimal invalido");
  }

  return new Uint8Array(
    value.match(/.{2}/g).map(part => parseInt(part, 16))
  );
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value)
  );

  return bytesToHex(new Uint8Array(digest));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a[i] ^ b[i];
  }

  return difference === 0;
}

async function verifyPassword(password, storedHash) {
  try {
    const parts = storedHash.split("$");

    if (
      parts.length !== 4 ||
      parts[0] !== "pbkdf2_sha256"
    ) {
      return false;
    }

    const iterations = Number(parts[1]);

    if (
      !Number.isInteger(iterations) ||
      iterations < 210000 ||
      iterations > 1000000
    ) {
      return false;
    }

    const salt = hexToBytes(parts[2]);
    const expected = hexToBytes(parts[3]);

    if (
      salt.length !== 16 ||
      expected.length !== 32
    ) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations
      },
      key,
      256
    );

    return constantTimeEqual(
      new Uint8Array(derivedBits),
      expected
    );

  } catch {
    return false;
  }
}

/* ==========================================
   3. COOKIE DE SESSAO
========================================== */

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";

  for (const cookie of header.split(";")) {
    const trimmed = cookie.trim();
    const separator = trimmed.indexOf("=");

    if (separator === -1) continue;

    if (trimmed.slice(0, separator) === name) {
      return trimmed.slice(separator + 1);
    }
  }

  return null;
}

function sessionCookie(token, maxAge) {
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAge}`
  ].join("; ");
}

function clearSessionCookie() {
  return sessionCookie("", 0);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role
  };
}

/* ==========================================
   4. PROTECAO DE ORIGEM
========================================== */

function validRequestOrigin(request) {
  const origin = request.headers.get("Origin");

  if (!origin) return false;

  try {
    return new URL(origin).origin ===
      new URL(request.url).origin;
  } catch {
    return false;
  }
}

/* ==========================================
   5. VERIFICAR SESSAO
========================================== */

async function getAuthenticatedUser(request, db) {
  const token = readCookie(request, COOKIE_NAME);

  if (
    !token ||
    !/^[0-9a-f]{64}$/.test(token)
  ) {
    return null;
  }

  const tokenHash = await sha256Hex(token);

  const user = await db.prepare(`
    SELECT
      u.id,
      u.email,
      u.display_name,
      u.role
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
      AND u.is_active = 1
    LIMIT 1
  `).bind(
    tokenHash,
    new Date().toISOString()
  ).first();

  return user || null;
}

/* ==========================================
   6. LOGIN ADMINISTRATIVO
========================================== */

async function handleLogin(request, db) {

  if (!validRequestOrigin(request)) {
    return errorResponse("Origem nao autorizada", 403);
  }

  let payload;

  try {
    if (
      Number(request.headers.get("Content-Length") || 0)
        > 4096
    ) {
      return errorResponse("Requisicao muito grande", 413);
    }

    const rawBody = await request.text();

    if (rawBody.length > 4096) {
      return errorResponse("Requisicao muito grande", 413);
    }

    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse("JSON invalido", 400);
  }

  const email =
    typeof payload?.email === "string"
      ? payload.email.trim().toLowerCase()
      : "";

  const password =
    typeof payload?.password === "string"
      ? payload.password
      : "";

  if (
    !email ||
    email.length > 254 ||
    !password ||
    password.length > 1024
  ) {
    return errorResponse(
      "Email ou senha invalidos",
      400
    );
  }

  const user = await db.prepare(`
    SELECT *
    FROM admin_users
    WHERE email = ?
    LIMIT 1
  `).bind(email).first();

  const invalidCredentials = () =>
    errorResponse("Email ou senha incorretos", 401);

  if (!user || user.is_active !== 1) {
    return invalidCredentials();
  }

  const now = new Date();

  if (
    user.locked_until &&
    new Date(user.locked_until) > now
  ) {
    return errorResponse(
      "Acesso temporariamente bloqueado",
      429
    );
  }

  const passwordMatches = await verifyPassword(
    password,
    user.password_hash
  );

  if (!passwordMatches) {
    const attempts =
      (user.failed_login_attempts || 0) + 1;

    const lockedUntil =
      attempts >= MAX_LOGIN_ATTEMPTS
        ? new Date(
            now.getTime() + LOCK_MINUTES * 60000
          ).toISOString()
        : null;

    await db.prepare(`
      UPDATE admin_users
      SET failed_login_attempts = ?,
          locked_until = ?
      WHERE id = ?
    `).bind(
      lockedUntil ? 0 : attempts,
      lockedUntil,
      user.id
    ).run();

    return invalidCredentials();
  }

  const token = bytesToHex(
    crypto.getRandomValues(new Uint8Array(32))
  );

  const tokenHash = await sha256Hex(token);

  const expiresAt = new Date(
    now.getTime() + SESSION_SECONDS * 1000
  ).toISOString();

  await db.prepare(`
    INSERT INTO admin_sessions (
      id,
      user_id,
      token_hash,
      expires_at
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    user.id,
    tokenHash,
    expiresAt
  ).run();

  await db.prepare(`
    UPDATE admin_users
    SET failed_login_attempts = 0,
        locked_until = NULL,
        last_login_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    now.toISOString(),
    user.id
  ).run();

  return jsonResponse({
    success: true,
    message: "Login realizado",
    user: publicUser(user)
  }, 200, {
    "Set-Cookie": sessionCookie(
      token,
      SESSION_SECONDS
    )
  });
}

/* ==========================================
   7. USUARIO AUTENTICADO
========================================== */

async function handleMe(request, db) {
  const user = await getAuthenticatedUser(request, db);

  if (!user) {
    return errorResponse("Nao autenticado", 401);
  }

  return jsonResponse({
    success: true,
    user: publicUser(user)
  });
}

/* ==========================================
   8. LOGOUT
========================================== */

async function handleLogout(request, db) {
  if (!validRequestOrigin(request)) {
    return errorResponse("Origem nao autorizada", 403);
  }

  const token = readCookie(request, COOKIE_NAME);

  if (token && /^[0-9a-f]{64}$/.test(token)) {
    const tokenHash = await sha256Hex(token);

    await db.prepare(`
      UPDATE admin_sessions
      SET revoked_at = ?
      WHERE token_hash = ?
        AND revoked_at IS NULL
    `).bind(
      new Date().toISOString(),
      tokenHash
    ).run();
  }

  return jsonResponse({
    success: true,
    message: "Sessao encerrada"
  }, 200, {
    "Set-Cookie": clearSessionCookie()
  });
}

/* ==========================================
   9. CONSULTAR CONFIGURACOES
========================================== */

async function getConfiguration(db) {
  const profile = await db.prepare(`
    SELECT
      business_name,
      business_type,
      timezone,
      phone,
      email,
      address
    FROM business_profile
    WHERE id = 1
  `).first();

  const settings = await db.prepare(`
    SELECT
      capacity,
      slot_interval_minutes,
      booking_horizon_days,
      minimum_notice_minutes,
      approval_required
    FROM scheduling_settings
    WHERE id = 1
  `).first();

  const result = await db.prepare(`
    SELECT
      weekday,
      is_open,
      opens_at,
      closes_at
    FROM weekly_hours
    ORDER BY weekday
  `).all();

  if (
    !profile ||
    !settings ||
    result.results.length !== 7
  ) {
    return null;
  }

  return {
    business: {
      name: profile.business_name,
      type: profile.business_type,
      timezone: profile.timezone,
      phone: profile.phone,
      email: profile.email,
      address: profile.address
    },

    scheduling: {
      capacity: settings.capacity,
      intervalMinutes:
        settings.slot_interval_minutes,
      bookingHorizonDays:
        settings.booking_horizon_days,
      minimumNoticeMinutes:
        settings.minimum_notice_minutes,
      approvalRequired:
        settings.approval_required === 1
    },

    weeklyHours: result.results.map(day => ({
      weekday: day.weekday,
      open: day.is_open === 1,
      start: day.opens_at,
      end: day.closes_at
    }))
  };
}

/* ==========================================
   10. CONSULTAR SERVICOS
========================================== */

async function getServices(db) {
  const result = await db.prepare(`
    SELECT
      id,
      name,
      description,
      price_cents,
      duration_minutes
    FROM services
    WHERE is_active = 1
    ORDER BY name
  `).all();

  return result.results.map(service => ({
    id: service.id,
    name: service.name,
    description: service.description,
    priceCents: service.price_cents,
    durationMinutes: service.duration_minutes
  }));
}

/* ==========================================
   11. WORKER PRINCIPAL
========================================== */

/* ==========================================
   12. OPERACOES DA AGENDA NO D1
   Dados de demonstracao: clientes anonimizados.
========================================== */
const ACTIVE_STATUSES = ["pending", "confirmed"];
const ANY_STATUSES = ["pending", "confirmed", "completed", "cancelled", "rejected"];

function dateValid(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function timeMinutes(v) {
  if (typeof v !== "string" || !/^\d{2}:\d{2}$/.test(v)) return NaN;
  const [h,m] = v.split(":").map(Number);
  return h < 24 && m < 60 ? h*60+m : NaN;
}
function safeString(v, max=150) {
  return typeof v === "string" ? v.trim().slice(0,max) : "";
}
function timeExpression(col) {
  return `(CAST(substr(${col},1,2) AS INTEGER)*60+CAST(substr(${col},4,2) AS INTEGER))`;
}
const startExpr = timeExpression("a.start_time");
function reservationIsValid(slot, service, config, now=new Date()) {
  if (!dateValid(slot.date) || !Number.isFinite(timeMinutes(slot.start))) return false;
  const start = timeMinutes(slot.start), end=start+Number(service.duration_minutes);
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:config.timezone || "America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  if (slot.date < today) return false;
  const weekday=new Date(slot.date+"T12:00:00Z").getUTCDay();
  const rule=config.weeklyHours.find(x=>x.weekday===weekday);
  if (!rule?.open || start<timeMinutes(rule.start) || end>timeMinutes(rule.end)) return false;
  const interval=config.scheduling.intervalMinutes;
  if ((start-timeMinutes(rule.start))%interval !== 0) return false;
  if (slot.date===today) {
    const p=new Intl.DateTimeFormat("en-GB",{timeZone:config.timezone || "America/Sao_Paulo",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
    if (start <= timeMinutes(p)+config.scheduling.minimumNoticeMinutes) return false;
  }
  const horizon=new Date(now);horizon.setUTCDate(horizon.getUTCDate()+config.scheduling.bookingHorizonDays);
  if (slot.date > horizon.toISOString().slice(0,10)) return false;
  return true;
}
async function readConfig(db) {
  const config=await getConfiguration(db);
  if (!config) throw new Error("Configuração inicial ausente");
  config.timezone=config.business.timezone;
  return config;
}
async function readRequest(request,max=16384) {
  const raw=await request.text();
  if (raw.length > max) throw new Error("Requisição muito grande");
  try {return JSON.parse(raw);} catch {throw new Error("JSON inválido");}
}
async function authRequired(request,db) {
  const user=await getAuthenticatedUser(request,db);
  return user;
}
async function listAppointments(db,admin=false) {
  const result=await db.prepare(`SELECT id, service_id, service_name, service_duration_minutes, service_price_cents, customer_name, customer_phone, customer_details, appointment_date, start_time, status, source, notes, created_at FROM appointments ORDER BY appointment_date,start_time`).all();
  return result.results.map(a=>({
    id:a.id, serviceId:a.service_id, serviceName:a.service_name,
    duration:a.service_duration_minutes,price:a.service_price_cents/100,
    date:a.appointment_date,start:a.start_time,status:a.status,
    origin:a.source==="admin"?"manual":"site",
    name:admin?a.customer_name:"Cliente demonstrativo",
    phone:admin?a.customer_phone:undefined,
    vehicle:admin?a.customer_details:undefined,
    notes:admin?a.notes:undefined
  }));
}
async function listBlocks(db) {
  const r=await db.prepare(`SELECT id,block_date,start_time,end_time,reason FROM schedule_blocks ORDER BY block_date`).all();
  return r.results.map(b=>({id:b.id,date:b.block_date,type:b.start_time===null?"day":"period",start:b.start_time,end:b.end_time,reason:b.reason}));
}
async function publicSnapshot(db,admin=false) {
  const [config, serviceRows, blocks, bookings]=await Promise.all([
    readConfig(db),
    db.prepare(`SELECT id,name,description,price_cents,duration_minutes,is_active FROM services ORDER BY name`).all(),
    listBlocks(db),listAppointments(db,admin)
  ]);
  return {capacity:config.scheduling.capacity,interval:config.scheduling.intervalMinutes,
    weekly:config.weeklyHours.map(w=>({day:w.weekday,open:w.open,start:w.start,end:w.end})),
    services:serviceRows.results.filter(s=>admin||s.is_active===1).map(s=>({id:s.id,name:s.name,description:s.description,price:s.price_cents/100,duration:s.duration_minutes,active:s.is_active===1})),
    blocks,bookings};
}
// D1 executes this single INSERT as one atomic statement, including its
// availability condition. Distinct start times are the only occupancy changes.
async function createAppointment(db, payload, origin="public") {
  const config=await readConfig(db);
  const service=await db.prepare(`SELECT * FROM services WHERE id=? AND is_active=1`).bind(payload.serviceId).first();
  if (!service) return {error:"Serviço indisponível",status:404};
  const slot={date:payload.date,start:payload.start};
  if (!reservationIsValid(slot,service,config)) return {error:"Data ou horário inválido",status:422};
  const begin=timeMinutes(slot.start), end=begin+service.duration_minutes;
  const block=await db.prepare(`SELECT 1 FROM schedule_blocks WHERE block_date=? AND (start_time IS NULL OR (${timeExpression("start_time")} < ? AND ${timeExpression("end_time")} > ?)) LIMIT 1`).bind(slot.date,end,begin).first();
  if (block) return {error:"Horário bloqueado",status:409};
  const id=crypto.randomUUID();
  const source=origin==="admin"?"admin":"public";
  const customerName=origin==="admin"?safeString(payload.name,150):"Cliente demonstrativo";
  const phone=origin==="admin"?safeString(payload.phone,32):"00000000000";
  if (!customerName || phone.length<5) return {error:"Dados incompletos",status:422};
  const vehicle=origin==="admin"?safeString(payload.vehicle,150):"Veículo demonstrativo";
  const status=origin==="admin" && payload.status==="confirmed"?"confirmed":"pending";
  const sql=`INSERT INTO appointments(id,service_id,service_name,service_duration_minutes,service_price_cents,customer_name,customer_phone,customer_details,appointment_date,start_time,status,source,notes)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?
    WHERE NOT EXISTS (
      SELECT 1 FROM (
        SELECT ? AS tick
        UNION SELECT ${startExpr} AS tick FROM appointments a
        WHERE a.appointment_date=? AND a.status IN ('pending','confirmed')
          AND ${startExpr} >= ? AND ${startExpr} < ?
      ) points
      WHERE (SELECT count(*) FROM appointments a
        WHERE a.appointment_date=? AND a.status IN ('pending','confirmed')
        AND ${startExpr} <= points.tick
        AND (${startExpr}+a.service_duration_minutes) > points.tick
      ) >= ?
    )
    AND NOT EXISTS (SELECT 1 FROM schedule_blocks b WHERE b.block_date=?
      AND (b.start_time IS NULL OR (${timeExpression("b.start_time")} < ? AND ${timeExpression("b.end_time")} > ?)))`;
  const p=[id,service.id,service.name,service.duration_minutes,service.price_cents,
    customerName,phone,vehicle,slot.date,slot.start,status,source,"",
    begin,slot.date,begin,end,slot.date,config.scheduling.capacity,slot.date,end,begin];
  const result=await db.prepare(sql).bind(...p).run();
  if (!result.meta?.changes) return {error:"Horário indisponível. Escolha outro.",status:409};
  return {data:{id,status,date:slot.date,start:slot.start,serviceName:service.name,duration:service.duration_minutes,price:service.price_cents/100}};
}
async function handleAgendaRoute(request,db,path,method) {
  const admin=path.startsWith("/api/admin/");
  if (!admin) {
    if (path==="/api/public/state" && method==="GET") {
      return jsonResponse({success:true,data:await publicSnapshot(db,false)});
    }
    if (path==="/api/appointments" && method==="POST") {
      if (!validRequestOrigin(request)) return errorResponse("Origem não autorizada",403);
      let payload;try{payload=await readRequest(request);}catch(e){return errorResponse(e.message,400);}
      const result=await createAppointment(db,payload,"public");
      return result.error?errorResponse(result.error,result.status):jsonResponse({success:true,data:result.data},201);
    }
    return null;
  }
  const user=await authRequired(request,db);
  if (!user) return errorResponse("Não autenticado",401);
  if (method!=="GET" && !validRequestOrigin(request)) return errorResponse("Origem não autorizada",403);
  if (path==="/api/admin/state" && method==="GET") {
    return jsonResponse({success:true,data:await publicSnapshot(db,true)});
  }
  let data={};
  if (method!=="GET") {try{data=await readRequest(request);}catch(e){return errorResponse(e.message,400);}}
  if (path==="/api/admin/appointments" && method==="POST") {
    const result=await createAppointment(db,data,"admin");
    return result.error?errorResponse(result.error,result.status):jsonResponse({success:true,data:result.data},201);
  }
  const match=path.match(/^\/api\/admin\/appointments\/([0-9a-f-]{36})$/);
  if (match && method==="PATCH") {
    const current=await db.prepare(`SELECT * FROM appointments WHERE id=?`).bind(match[1]).first();
    if (!current) return errorResponse("Agendamento não encontrado",404);
    if (data.status && !ANY_STATUSES.includes(data.status)) return errorResponse("Status inválido",422);
    if (data.date || data.start) return errorResponse("Reagendamento exige validação dedicada; não disponível nesta etapa",501);
    const next=data.status;
    if (!next) return errorResponse("Informe o status",422);
    if (!["pending","confirmed"].includes(current.status)) return errorResponse("Atendimento encerrado não pode ser alterado",409);
    if (next==="confirmed" && current.status!=="pending") return errorResponse("Transição inválida",409);
    if (next==="completed" && current.status!=="confirmed") return errorResponse("Transição inválida",409);
    const update=await db.prepare(`UPDATE appointments SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?`).bind(next,match[1],current.status).run();
    return update.meta?.changes?jsonResponse({success:true}):errorResponse("Atualizado por outro usuário",409);
  }
  if (path==="/api/admin/services" && method==="POST") {
    const name=safeString(data.name),duration=Number(data.duration),price=Number(data.price);
    if (!name || !Number.isInteger(duration) || duration<1 || duration>1440 || !Number.isFinite(price) || price<0) return errorResponse("Dados de serviço inválidos",422);
    const id=crypto.randomUUID();
    await db.prepare(`INSERT INTO services(id,name,price_cents,duration_minutes,is_active) VALUES (?,?,?,?,1)`).bind(id,name,Math.round(price*100),duration).run();
    return jsonResponse({success:true,data:{id}},201);
  }
  const sm=path.match(/^\/api\/admin\/services\/([a-zA-Z0-9_-]+)$/);
  if (sm && method==="PATCH") {
    const existing=await db.prepare(`SELECT * FROM services WHERE id=?`).bind(sm[1]).first();
    if (!existing) return errorResponse("Serviço não encontrado",404);
    const name=data.name===undefined?existing.name:safeString(data.name);
    const duration=data.duration===undefined?existing.duration_minutes:Number(data.duration);
    const price=data.price===undefined?existing.price_cents/100:Number(data.price);
    const active=data.active===undefined?existing.is_active:Boolean(data.active)?1:0;
    if (!name || !Number.isInteger(duration) || duration<1 || duration>1440 || !Number.isFinite(price) || price<0) return errorResponse("Dados inválidos",422);
    await db.prepare(`UPDATE services SET name=?,duration_minutes=?,price_cents=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(name,duration,Math.round(price*100),active,sm[1]).run();
    return jsonResponse({success:true});
  }
  if (path==="/api/admin/config" && method==="PATCH") {
    const capacity=Number(data.capacity),interval=Number(data.interval);
    if (!Number.isInteger(capacity)||capacity<1||capacity>100||![15,30,60].includes(interval)) return errorResponse("Configuração inválida",422);
    // Não alteramos expediente ou capacidade sem revalidar agendamentos ativos.
    const config=await readConfig(db);
    const active=await db.prepare(`SELECT * FROM appointments WHERE status IN ('pending','confirmed')`).all();
    const proposed={...config,scheduling:{...config.scheduling,capacity,intervalMinutes:interval}};
    for (const b of active.results) {
      const service={duration_minutes:b.service_duration_minutes};
      if(!reservationIsValid({date:b.appointment_date,start:b.start_time},service,proposed,new Date(b.appointment_date+"T00:00:00Z"))) return errorResponse("Existem agendamentos incompatíveis",409);
    }
    await db.prepare(`UPDATE scheduling_settings SET capacity=?,slot_interval_minutes=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`).bind(capacity,interval).run();
    return jsonResponse({success:true});
  }
  if (path==="/api/admin/blocks" && method==="POST") {
    if (!dateValid(data.date)) return errorResponse("Data inválida",422);
    const full=data.type==="day";
    const start=full?null:data.start,end=full?null:data.end;
    if (!full && (!Number.isFinite(timeMinutes(start))||!Number.isFinite(timeMinutes(end))||timeMinutes(start)>=timeMinutes(end))) return errorResponse("Período inválido",422);
    // Não aceitar bloqueios que afetem reservas já existentes.
    const existing=await db.prepare(`SELECT * FROM appointments WHERE appointment_date=? AND status IN ('pending','confirmed')`).bind(data.date).all();
    if (existing.results.some(a=>full || (timeMinutes(a.start_time)<timeMinutes(end) && timeMinutes(a.start_time)+a.service_duration_minutes>timeMinutes(start)))) return errorResponse("Bloqueio conflitante com agendamento",409);
    const id=crypto.randomUUID();
    await db.prepare(`INSERT INTO schedule_blocks(id,block_date,start_time,end_time,reason) VALUES (?,?,?,?,?)`).bind(id,data.date,start,end,safeString(data.reason,250)).run();
    return jsonResponse({success:true,data:{id}},201);
  }
  const bm=path.match(/^\/api\/admin\/blocks\/([0-9a-f-]{36})$/);
  if (bm && method==="DELETE") {
    await db.prepare(`DELETE FROM schedule_blocks WHERE id=?`).bind(bm[1]).run();
    return jsonResponse({success:true});
  }
  return null;
}


/* ==========================================
   DEMONSTRACAO ISOLADA POR SESSAO
   O login admin/1234 e PUBLICO e nao concede
   permissao nas rotas /api/admin do banco principal.
========================================== */
const DEMO_COOKIE = "__Host-lume_demo";
const DEMO_TTL_SECONDS = 8 * 60 * 60;
function demoCookie(value, age) {
  return `${DEMO_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
}
function demoSeedState() {
  return {
    capacity:1, interval:60,
    weekly:[
      {day:0,open:false,start:"08:00",end:"13:00"},
      ...[1,2,3,4,5].map(day=>({day,open:true,start:"07:00",end:"17:00"})),
      {day:6,open:true,start:"08:00",end:"13:00"}
    ],
    services:[
      {id:"lavagem-detalhada",name:"Lavagem detalhada",price:120,duration:120,active:true},
      {id:"polimento-tecnico",name:"Polimento técnico",price:350,duration:240,active:true},
      {id:"higienizacao-interna",name:"Higienização interna",price:250,duration:180,active:true},
      {id:"vitrificacao",name:"Vitrificação",price:600,duration:360,active:true},
      {id:"limpeza-motor",name:"Limpeza de motor",price:100,duration:60,active:true},
      {id:"revitalizacao-farois",name:"Revitalização de faróis",price:150,duration:120,active:true}
    ],blocks:[],bookings:[]
  };
}
function validateDemoState(data) {
  if (!data || typeof data!=="object" || Array.isArray(data)) return null;
  if (!Number.isInteger(data.capacity) || data.capacity<1 || data.capacity>100) return null;
  if (![15,30,60].includes(data.interval)) return null;
  if (!Array.isArray(data.weekly) || data.weekly.length!==7 ||
      !Array.isArray(data.services) || data.services.length>50 ||
      !Array.isArray(data.blocks) || data.blocks.length>300 ||
      !Array.isArray(data.bookings) || data.bookings.length>500) return null;
  const days=new Set();
  for (const day of data.weekly) {
    if (!Number.isInteger(day.day)||day.day<0||day.day>6||days.has(day.day)||
       typeof day.open!=="boolean" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.start)||
       !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.end)|| day.start>=day.end) return null;
    days.add(day.day);
  }
  const cleanServices=[];
  const serviceIds=new Set();
  for (const s of data.services) {
    if (typeof s.id!=="string"||s.id.length>90||!s.id||serviceIds.has(s.id)||
        typeof s.name!=="string"||s.name.length>150||!s.name.trim()||
        !Number.isFinite(s.price)||s.price<0||s.price>1e7||
        !Number.isInteger(s.duration)||s.duration<1||s.duration>1440||
        typeof s.active!=="boolean") return null;
    serviceIds.add(s.id);
    cleanServices.push({id:s.id,name:s.name,price:s.price,duration:s.duration,active:s.active});
  }
  const cleanBlocks=[];
  for (const b of data.blocks) {
    if ((typeof b.id!=="string" && typeof b.id!=="number") ||
        typeof b.date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)||
        !["day","period"].includes(b.type)) return null;
    if (b.type==="period" && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start)||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.end)||b.start>=b.end)) return null;
    cleanBlocks.push({id:b.id,date:b.date,type:b.type,start:b.type==="day"?null:b.start,
      end:b.type==="day"?null:b.end,reason:String(b.reason||"").slice(0,250)});
  }
  const cleanBookings=[];
  for (const b of data.bookings) {
    if ((typeof b.id!=="string" && typeof b.id!=="number") ||
        typeof b.date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start)||
        !Number.isInteger(b.duration)||b.duration<1||b.duration>1440||
        !Number.isFinite(b.price)||b.price<0||
        !["pending","confirmed","completed","cancelled","rejected"].includes(b.status)) return null;
    // Dados inseridos por visitantes nunca devem ser armazenados no sandbox.
    cleanBookings.push({id:b.id,name:"Cliente demonstrativo",phone:"00000000000",
      vehicle:"Veículo demonstrativo",serviceId:String(b.serviceId||"").slice(0,90),
      date:b.date,start:b.start,duration:b.duration,price:b.price,status:b.status,
      origin:b.origin==="manual"?"manual":"site",notes:"",demoPublic:true});
  }
  return {capacity:data.capacity,interval:data.interval,weekly:data.weekly,
    services:cleanServices,blocks:cleanBlocks,bookings:cleanBookings};
}
async function demoRow(request,db) {
  const raw=readCookie(request,DEMO_COOKIE);
  if (!raw||!/^[0-9a-f]{64}$/.test(raw)) return null;
  const hash=await sha256Hex(raw);
  return db.prepare(`SELECT id,state_json,version FROM demo_instances
    WHERE token_hash=? AND expires_at>? LIMIT 1`)
    .bind(hash,new Date().toISOString()).first();
}
async function demoRoute(request,db,path,method) {
  if (!path.startsWith("/api/demo/")) return null;
  if (method!=="GET" && !validRequestOrigin(request)) return errorResponse("Origem nao autorizada",403);
  // Visitantes do formulário público recebem uma sessão isolada,
  // sem acesso às rotas administrativas reais.
  if (path==="/api/demo/start" && method==="POST") {
    const existing=await demoRow(request,db);
    if (existing) return jsonResponse({success:true,version:existing.version});
    const token=bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash=await sha256Hex(token);
    const expires=new Date(Date.now()+DEMO_TTL_SECONDS*1000).toISOString();
    await db.prepare(`INSERT INTO demo_instances(id,token_hash,state_json,version,expires_at)
      VALUES(?,?,?,0,?)`).bind(crypto.randomUUID(),tokenHash,JSON.stringify(demoSeedState()),expires).run();
    return jsonResponse({success:true,version:0},200,{"Set-Cookie":demoCookie(token,DEMO_TTL_SECONDS)});
  }
  if (path==="/api/demo/login" && method==="POST") {
    const raw=await request.text();
    if (raw.length>2048) return errorResponse("Requisicao muito grande",413);
    let body;try{body=JSON.parse(raw);}catch{return errorResponse("JSON invalido",400);}
    if (body?.username!=="admin"||body?.password!=="1234") return errorResponse("Credenciais incorretas",401);
    const existing=await demoRow(request,db);
    if (existing) return jsonResponse({success:true,version:existing.version});
    const token=bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash=await sha256Hex(token);
    const expires=new Date(Date.now()+DEMO_TTL_SECONDS*1000).toISOString();
    await db.prepare(`INSERT INTO demo_instances(id,token_hash,state_json,version,expires_at)
      VALUES(?,?,?,0,?)`).bind(crypto.randomUUID(),tokenHash,JSON.stringify(demoSeedState()),expires).run();
    return jsonResponse({success:true,version:0},200,{"Set-Cookie":demoCookie(token,DEMO_TTL_SECONDS)});
  }
  const row=await demoRow(request,db);
  if (!row) return errorResponse("Sessao demonstrativa expirada ou inexistente",401);
  if (path==="/api/demo/state" && method==="GET") {
    return jsonResponse({success:true,version:row.version,data:JSON.parse(row.state_json)});
  }
  if (path==="/api/demo/state" && method==="PUT") {
    const raw=await request.text();
    if (raw.length>120000) return errorResponse("Estado muito grande",413);
    let body;try{body=JSON.parse(raw);}catch{return errorResponse("JSON invalido",400);}
    const clean=validateDemoState(body?.state);
    if (!clean||!Number.isInteger(body.version)||body.version<0) return errorResponse("Estado invalido",422);
    const result=await db.prepare(`UPDATE demo_instances SET state_json=?,version=version+1,
      updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?`)
      .bind(JSON.stringify(clean),row.id,body.version).run();
    if (!result.meta?.changes) return errorResponse("Dados alterados em outra aba; atualize antes de salvar",409);
    return jsonResponse({success:true,version:body.version+1});
  }
  if (path==="/api/demo/reset" && method==="POST") {
    const raw=await request.text();
    if (raw.length>512) return errorResponse("Requisicao muito grande",413);
    let body;try{body=JSON.parse(raw);}catch{return errorResponse("JSON invalido",400);}
    if (body?.confirm!=="RESTAURAR") return errorResponse("Confirmacao obrigatoria",422);
    await db.prepare(`UPDATE demo_instances SET state_json=?,version=version+1,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(JSON.stringify(demoSeedState()),row.id).run();
    return jsonResponse({success:true,version:row.version+1});
  }
  if (path==="/api/demo/logout" && method==="POST") {
    await db.prepare(`DELETE FROM demo_instances WHERE id=?`).bind(row.id).run();
    return jsonResponse({success:true},200,{"Set-Cookie":demoCookie("",0)});
  }
  return errorResponse("Rota nao encontrada",404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const path = url.pathname;
    const method = request.method;
    const db = env.lume_agenda_db;

    if (path === "/" && method === "GET") {
      return jsonResponse({
        project: "Lume Agenda",
        message: "Backend funcionando!",
        status: "online",
        version: API_VERSION
      });
    }

    if (
      path === "/api/health" &&
      method === "GET"
    ) {
      return jsonResponse({
        success: true,
        status: "online",
        service: "lume-agenda-api",
        version: API_VERSION
      });
    }

    if (!db) {
      return errorResponse(
        "Banco de dados indisponivel",
        503
      );
    }

    try {
      if (path.startsWith("/api/demo/")) {
        return await demoRoute(request,db,path,method);
      }

      if (
        path === "/api/config" &&
        method === "GET"
      ) {
        const config = await getConfiguration(db);

        if (!config) {
          return errorResponse(
            "Configuracoes nao cadastradas",
            404
          );
        }

        return jsonResponse({
          success: true,
          data: config
        });
      }

      if (
        path === "/api/services" &&
        method === "GET"
      ) {
        return jsonResponse({
          success: true,
          data: await getServices(db)
        });
      }

      if (
        path === "/api/auth/login" &&
        method === "POST"
      ) {
        return await handleLogin(request, db);
      }

      if (
        path === "/api/auth/me" &&
        method === "GET"
      ) {
        return await handleMe(request, db);
      }

      if (
        path === "/api/auth/logout" &&
        method === "POST"
      ) {
        return await handleLogout(request, db);
      }

      if (path.startsWith("/api/admin/") || path === "/api/public/state" || path === "/api/appointments") {
        const result = await handleAgendaRoute(request, db, path, method);
        if (result) return result;
      }

      const knownRoutes = [
        "/api/config",
        "/api/services",
        "/api/auth/login",
        "/api/auth/me",
        "/api/auth/logout"
      ];

      if (knownRoutes.includes(path)) {
        return errorResponse(
          "Metodo nao permitido",
          405
        );
      }

      return errorResponse(
        "Rota nao encontrada",
        404
      );

    } catch (error) {
      console.error("Erro na API:", error);

      return errorResponse(
        "Erro interno no servidor",
        500
      );
    }
  }
};