/* ==========================================
   LUME AGENDA UNIVERSAL
   VÉRTICE AUTO DETAIL
   ARQUIVO: admin/dashboard.js
   PAINEL ADMINISTRATIVO DEMONSTRATIVO
   - Visão geral e indicadores
   - Calendário de atendimentos
   - Solicitações e notificações
   - Agendamentos manuais
   - Serviços e edição
   - Configurações semanais
   - Capacidade simultânea
   - Bloqueios de horários
   - Restauração da demonstração
   - Sincronização entre abas
   Não grava alterações no Cloudflare D1.
========================================== */
document.addEventListener("DOMContentLoaded", async () => {
  "use strict";
  /* ========================================
     1. INICIALIZAÇÃO
  ======================================== */
  const $ = id => document.getElementById(id);
  const demo = window.LumeDemo;
  if (!$("view-overview")) return;
  if (!demo) {
    console.error(
      "Lume Agenda: demo-state.js não foi carregado."
    );
    return;
  }
  const weekdayNames = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado"
  ];
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
  const statusNames = {
    pending: "Pendente",
    confirmed: "Confirmado",
    completed: "Finalizado",
    cancelled: "Cancelado",
    rejected: "Recusado"
  };
  const viewNames = [
    "overview",
    "agenda",
    "requests",
    "new",
    "services",
    "settings"
  ];
  await demo.ready();
  let state = demo.getState();
  let selectedCalendarDate = dateKey(today());
  let calendarMonth = new Date(
    today().getFullYear(),
    today().getMonth(),
    1
  );
  let activeView = "overview";
  let overviewFilter = window.matchMedia("(max-width: 600px)").matches ? "pending" : "recent";
  let requestsFilter = "all";
  let editingServiceId = null;
  let editingBookingId = null;
  let toastTimer = null;
  /* ========================================
     2. UTILITÁRIOS
  ======================================== */
  function element(tag, className = "", content = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = content;
    return node;
  }
  function button(label, className, action) {
    const node = element("button", className, label);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }
  function today() {
    const date = new Date();
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
  }
  function dateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }
  function dateFromKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  function validDate(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key || "")) {
      return false;
    }
    const date = dateFromKey(key);
    return (
      !Number.isNaN(date.getTime()) &&
      dateKey(date) === key
    );
  }
  function validTime(value) {
    if (!/^\d{2}:\d{2}$/.test(value || "")) {
      return false;
    }
    const [hour, minute] = value.split(":").map(Number);
    return (
      hour >= 0 &&
      hour < 24 &&
      minute >= 0 &&
      minute < 60
    );
  }
  function minutes(time) {
    const [hours, mins] = time.split(":").map(Number);
    return hours * 60 + mins;
  }
  function timeString(total) {
    return (
      String(Math.floor(total / 60)).padStart(2, "0") +
      ":" +
      String(total % 60).padStart(2, "0")
    );
  }
  function money(value) {
    return Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }
  function parsePrice(value) {
    const clean = String(value)
      .trim()
      .replace(/^R\$\s*/i, "")
      .replace(/\s/g, "");
    if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(clean)) {
      return Number(
        clean.replace(/\./g, "").replace(",", ".")
      );
    }
    if (/^\d+(,\d{1,2})?$/.test(clean)) {
      return Number(clean.replace(",", "."));
    }
    if (/^\d+(\.\d{1,2})?$/.test(clean)) {
      return Number(clean);
    }
    return NaN;
  }
  function durationString(value) {
    const duration = Number(value);
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    if (!hours) return `${mins} minutos`;
    if (!mins) {
      return hours === 1 ? "1 hora" : `${hours} horas`;
    }
    return `${hours}h ${mins}min`;
  }
  function formatDate(key) {
    if (!validDate(key)) return "Data inválida";
    return new Intl.DateTimeFormat("pt-BR").format(
      dateFromKey(key)
    );
  }
  function monthLabel(date) {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric"
    }).format(date);
  }
  function addDays(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
  }
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && aEnd > bStart;
  }
  function normalizeName(name) {
    return String(name)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("pt-BR");
  }
  function showError(id, message) {
    const node = $(id);
    if (!node) return;
    node.textContent = message;
    node.hidden = !message;
  }
  function showToast(message) {
    const toast = $("dashboard-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      toast.hidden = true;
      toastTimer = null;
    }, 4500);
  }
  function save() {
    if (!demo.saveState(state)) {
      showToast(
        "Não foi possível salvar a demonstração neste navegador."
      );
      return false;
    }
    state = demo.getState();
    return true;
  }
  function refreshState() {
    state = demo.getState();
  }
  function nextId(items, minimum = 0) {
    const ids = items.map(item => Number(item.id) || 0);
    return Math.max(minimum, ...ids) + 1;
  }
  function findService(id) {
    return state.services.find(
      service => service.id === id
    );
  }
  function serviceName(booking) {
    return (
      findService(booking.serviceId)?.name ||
      booking.serviceName ||
      "Serviço indisponível"
    );
  }
  function sortedBookings(bookings) {
    return [...bookings].sort((a, b) => (
      a.date.localeCompare(b.date) ||
      a.start.localeCompare(b.start) ||
      Number(a.id) - Number(b.id)
    ));
  }
  /* ========================================
     3. AGENDAMENTOS INICIAIS FICTÍCIOS
  ======================================== */
  function createInitialBookings() {
    const base = today();
    const samples = [
      {
        id: 1001,
        name: "Cliente demonstrativo 01",
        vehicle: "Volkswagen Polo",
        serviceId: "vitrificacao",
        offset: 1,
        start: "07:00",
        duration: 360,
        price: 600,
        status: "pending",
        origin: "site"
      },
      {
        id: 1002,
        name: "Cliente demonstrativo 02",
        vehicle: "Honda Civic",
        serviceId: "lavagem-detalhada",
        offset: 0,
        start: "07:00",
        duration: 120,
        price: 120,
        status: "confirmed",
        origin: "site"
      },
      {
        id: 1003,
        name: "Cliente demonstrativo 03",
        vehicle: "Toyota Corolla",
        serviceId: "polimento-tecnico",
        offset: 2,
        start: "08:00",
        duration: 240,
        price: 350,
        status: "pending",
        origin: "site"
      },
      {
        id: 1004,
        name: "Cliente demonstrativo 04",
        vehicle: "Hyundai HB20",
        serviceId: "higienizacao-interna",
        offset: 0,
        start: "10:00",
        duration: 180,
        price: 250,
        status: "confirmed",
        origin: "manual"
      },
      {
        id: 1005,
        name: "Cliente demonstrativo 05",
        vehicle: "Fiat Argo",
        serviceId: "limpeza-motor",
        offset: 3,
        start: "14:00",
        duration: 60,
        price: 100,
        status: "cancelled",
        origin: "site"
      },
      {
        id: 1006,
        name: "Cliente demonstrativo 06",
        vehicle: "Jeep Renegade",
        serviceId: "revitalizacao-farois",
        offset: 1,
        start: "14:00",
        duration: 120,
        price: 150,
        status: "pending",
        origin: "site"
      }
    ];
    return samples.map(item => ({
      id: item.id,
      name: item.name,
      phone: "00000000000",
      vehicle: item.vehicle,
      serviceId: item.serviceId,
      date: dateKey(addDays(base, item.offset)),
      start: item.start,
      duration: item.duration,
      price: item.price,
      status: item.status,
      origin: item.origin,
      notes: "",
      demoSeed: true
    }));
  }
  function initializeDemoBookings() {
    if (demo.online) return;
    const hasExistingState =
      localStorage.getItem(demo.KEY) !== null;
    if (hasExistingState) return;
    state.bookings = createInitialBookings();
    save();
  }
  /* ========================================
     4. DISPONIBILIDADE
  ======================================== */
  function getDaySettings(key, weekly = state.weekly) {
    if (!validDate(key)) return null;
    const day = dateFromKey(key).getDay();
    return weekly.find(item => item.day === day) || null;
  }
  function occupiesTime(booking) {
    return ["pending", "confirmed"].includes(
      booking.status
    );
  }
  function bookingEnd(booking) {
    return (
      minutes(booking.start) +
      Number(booking.duration)
    );
  }
  function blockOverlaps(key, begin, end) {
    return state.blocks.some(block => {
      if (block.date !== key) return false;
      if (
        block.type === "day" ||
        block.is_full_day === 1
      ) {
        return true;
      }
      const start = block.start || block.starts_at;
      const finish = block.end || block.ends_at;
      if (!validTime(start) || !validTime(finish)) {
        return false;
      }
      return overlaps(
        begin,
        end,
        minutes(start),
        minutes(finish)
      );
    });
  }
  function canSchedule(
    key,
    start,
    duration,
    ignoreId = null,
    capacity = state.capacity,
    weekly = state.weekly
  ) {
    if (
      !validDate(key) ||
      !validTime(start) ||
      !Number.isFinite(Number(duration)) ||
      Number(duration) <= 0 ||
      !Number.isInteger(Number(capacity)) ||
      Number(capacity) < 1
    ) {
      return false;
    }
    const day = getDaySettings(key, weekly);
    if (!day || !day.open) return false;
    const begin = minutes(start);
    const finish = begin + Number(duration);
    if (
      begin < minutes(day.start) ||
      finish > minutes(day.end)
    ) {
      return false;
    }
    if (blockOverlaps(key, begin, finish)) {
      return false;
    }
    const overlapping = state.bookings.filter(item => (
      item.id !== ignoreId &&
      item.date === key &&
      occupiesTime(item) &&
      overlaps(
        begin,
        finish,
        minutes(item.start),
        bookingEnd(item)
      )
    ));
    const checkpoints = [begin, finish];
    overlapping.forEach(item => {
      checkpoints.push(
        Math.max(begin, minutes(item.start)),
        Math.min(finish, bookingEnd(item))
      );
    });
    const points = [...new Set(checkpoints)]
      .sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
      const left = points[i];
      const right = points[i + 1];
      const concurrent = overlapping.filter(item =>
        overlaps(
          left,
          right,
          minutes(item.start),
          bookingEnd(item)
        )
      ).length;
      if (concurrent >= Number(capacity)) {
        return false;
      }
    }
    return true;
  }
  function availableTimes(key, serviceId) {
    const service = findService(serviceId);
    if (
      !service ||
      !service.active ||
      !validDate(key) ||
      key < dateKey(today())
    ) {
      return [];
    }
    const day = getDaySettings(key);
    if (!day || !day.open) return [];
    const opening = minutes(day.start);
    const closing = minutes(day.end);
    const interval = Number(state.interval) || 60;
    const results = [];
    for (
      let current = opening;
      current + service.duration <= closing;
      current += interval
    ) {
      const start = timeString(current);
      if (key === dateKey(today())) {
        const now = new Date();
        const currentMinutes =
          now.getHours() * 60 + now.getMinutes();
        if (current <= currentMinutes) continue;
      }
      if (canSchedule(key, start, service.duration)) {
        results.push(start);
      }
    }
    return results;
  }
  /* ========================================
     5. NAVEGAÇÃO
  ======================================== */
  function closeMenu() {
    $("dashboard-sidebar")?.classList.remove(
      "is-open"
    );
    if ($("sidebar-overlay")) {
      $("sidebar-overlay").hidden = true;
    }
    $("dashboard-menu-button")?.setAttribute(
      "aria-expanded",
      "false"
    );
    document.body.classList.remove(
      "is-menu-open"
    );
  }
  function openMenu() {
    $("dashboard-sidebar")?.classList.add(
      "is-open"
    );
    if ($("sidebar-overlay")) {
      $("sidebar-overlay").hidden = false;
    }
    $("dashboard-menu-button")?.setAttribute(
      "aria-expanded",
      "true"
    );
    document.body.classList.add(
      "is-menu-open"
    );
  }
  function closeNotifications() {
    if ($("notification-panel")) {
      $("notification-panel").hidden = true;
    }
    $("notification-button")?.setAttribute(
      "aria-expanded",
      "false"
    );
  }
  function showView(name) {
    if (!viewNames.includes(name)) return;
    activeView = name;
    viewNames.forEach(view => {
      const section = $(`view-${view}`);
      if (section) {
        section.hidden = view !== name;
      }
    });
    document.querySelectorAll(
      ".sidebar-link[data-view]"
    ).forEach(item => {
      const active = item.dataset.view === name;
      item.classList.toggle("is-active", active);
      if (active) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
    const title = $(`view-${name}`)?.dataset.title;
    if ($("dashboard-page-name")) {
      $("dashboard-page-name").textContent =
        title || "Visão geral";
    }
    closeMenu();
    closeNotifications();
    if (name === "overview") {
      renderOverview();
    }
    if (name === "agenda") {
      renderCalendar();
      renderDayBookings();
      renderBlocks();
    }
    if (name === "requests") {
      renderRequests();
    }
    if (name === "new") {
      populateManualServices();
      updateManualTimes();
    }
    if (name === "services") {
      renderServices();
    }
    if (name === "settings") {
      populateSettings();
    }
    window.scrollTo({
      top: 0,
      behavior: "auto"
    });
  }
  document.querySelectorAll("[data-view]").forEach(
    item => {
      item.addEventListener("click", () => {
        showView(item.dataset.view);
      });
    }
  );
  document.querySelectorAll("[data-go]").forEach(
    item => {
      item.addEventListener("click", () => {
        showView(item.dataset.go);
      });
    }
  );
  $("dashboard-menu-button")?.addEventListener(
    "click",
    openMenu
  );
  $("sidebar-close")?.addEventListener(
    "click",
    closeMenu
  );
  $("sidebar-overlay")?.addEventListener(
    "click",
    closeMenu
  );
  /* ========================================
     6. INDICADORES E FILTROS
  ======================================== */
  function matchesFilter(booking, filter) {
    const currentDate = dateKey(today());
    switch (filter) {
      case "today":
        return (
          booking.status === "confirmed" &&
          booking.date === currentDate
        );
      case "pending":
        return booking.status === "pending";
      case "confirmed":
        return (
          booking.status === "confirmed" &&
          booking.date >= currentDate
        );
      case "completed":
        return booking.status === "completed";
      case "cancelled":
        return booking.status === "cancelled";
      case "rejected":
        return booking.status === "rejected";
      case "cancelled-rejected":
        return (
          booking.status === "cancelled" ||
          booking.status === "rejected"
        );
      default:
        return true;
    }
  }
  function countFilter(filter) {
    return state.bookings.filter(
      booking => matchesFilter(booking, filter)
    ).length;
  }
  function updateStatistics() {
    const statistics = {
      "stat-today": "today",
      "stat-pending": "pending",
      "stat-confirmed": "confirmed",
      "stat-cancelled": "cancelled-rejected",
      "stat-completed": "completed"
    };
    Object.entries(statistics).forEach(
      ([id, filter]) => {
        if ($(id)) {
          $(id).textContent = String(
            countFilter(filter)
          ).padStart(2, "0");
        }
      }
    );
    const pending = countFilter("pending");
    if ($("sidebar-pending-count")) {
      $("sidebar-pending-count").textContent =
        pending;
    }
    if ($("notification-counter")) {
      $("notification-counter").textContent =
        pending;
      $("notification-counter").hidden =
        pending === 0;
    }
    const currentDay = getDaySettings(
      dateKey(today())
    );
    if ($("overview-today-hours")) {
      $("overview-today-hours").textContent =
        currentDay?.open
          ? `${currentDay.start} às ${currentDay.end}`
          : "Fechado";
    }
    if ($("overview-open-days")) {
      const openDays = state.weekly.filter(
        day => day.open
      ).length;
      $("overview-open-days").textContent =
        `${openDays} de 7 dias`;
    }
    if ($("overview-capacity")) {
      $("overview-capacity").textContent =
        state.capacity === 1
          ? "1 atendimento"
          : `${state.capacity} atendimentos`;
    }
  }
  /* ========================================
     7. LINHAS DE AGENDAMENTO
  ======================================== */
  function createBookingRow(booking, overviewCompact = false) {
    const row = element("article", "admin-request-row");
    const main = element("div", "admin-request-primary");
    main.appendChild(element("strong", "", booking.name));
    main.appendChild(element("p", "", `${serviceName(booking)} · ${formatDate(booking.date)}`));
    const time = element("span", "lume-request-time", booking.start);
    time.setAttribute("aria-label", `Horário ${booking.start}`);
    main.appendChild(time);
    const secondary = element("div", "admin-request-secondary");
    secondary.appendChild(element("span", `admin-status admin-status-${booking.status}`, statusNames[booking.status] || booking.status));
    secondary.appendChild(button("Detalhes", "admin-row-button", () => openBookingModal(booking.id)));
    row.append(main, secondary);
    if (overviewCompact) {
      row.classList.add("overview-booking-row");
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-label", `Ver detalhes de ${booking.name}, ${serviceName(booking)}, ${formatDate(booking.date)} às ${booking.start}`);
      row.addEventListener("click", event => {
        if (!event.target.closest("button")) openBookingModal(booking.id);
      });
      row.addEventListener("keydown", event => {
        if (event.target === row && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          openBookingModal(booking.id);
        }
      });
    }
    return row;
  }
  function renderBookingList(
    containerId,
    bookings,
    emptyMessage,
    overviewCompact = false
  ) {
    const list = $(containerId);
    if (!list) return;
    list.replaceChildren();
    if (!bookings.length) {
      list.appendChild(
        element(
          "p",
          "dashboard-empty",
          emptyMessage
        )
      );
      return;
    }
    bookings.forEach(booking => {
      list.appendChild(createBookingRow(booking, overviewCompact));
    });
  }
  /* ========================================
     8. VISÃO GERAL
  ======================================== */
  function renderOverview() {
    updateStatistics();
    document.querySelectorAll(
      "[data-overview-filter]"
    ).forEach(card => {
      const active =
        card.dataset.overviewFilter === overviewFilter;
      card.classList.toggle("is-active", active);
      card.setAttribute(
        "aria-pressed",
        String(active)
      );
    });
    const mobileOverview = window.matchMedia("(max-width: 600px)").matches;
    let recent;
    if (overviewFilter === "recent") {
      recent = [...state.bookings]
        .sort((a, b) => Number(b.id) - Number(a.id))
        .slice(0, 5);
    } else {
      recent = sortedBookings(
        state.bookings.filter(
          booking => matchesFilter(
            booking,
            overviewFilter
          )
        )
      );
    }
    const titles = {
      recent: "Solicitações recentes",
      today: "Agendamentos de hoje",
      pending: "Solicitações pendentes",
      confirmed: "Agendamentos confirmados",
      "cancelled-rejected": "Cancelados e recusados",
      completed: "Agendamentos finalizados"
    };
    if ($("overview-requests-title")) {
      $("overview-requests-title").textContent =
        titles[overviewFilter] ||
        "Solicitações recentes";
    }
    if ($("overview-requests-description")) {
      $("overview-requests-description").textContent =
        overviewFilter === "recent"
          ? "Confira as últimas movimentações da agenda demonstrativa."
          : "Agendamentos encontrados para o filtro selecionado.";
    }
    if ($("overview-reset-filter")) {
      $("overview-reset-filter").hidden =
        overviewFilter === "recent";
    }
    if ($("overview-view-all")) {
      $("overview-view-all").hidden =
        !mobileOverview && overviewFilter !== "recent";
    }
    if ($("overview-results-count")) {
      $("overview-results-count").hidden =
        overviewFilter === "recent";
      $("overview-results-count").textContent =
        `${recent.length} agendamento(s) encontrado(s)`;
    }
    renderBookingList(
      "overview-requests",
      mobileOverview ? recent.slice(0, 3) : recent,
      "Nenhuma solicitação encontrada.",
      true
    );
    const upcoming = sortedBookings(
      state.bookings.filter(booking => (
        booking.status === "confirmed" &&
        booking.date >= dateKey(today())
      ))
    ).slice(0, 5);
    renderBookingList(
      "overview-upcoming",
      mobileOverview ? upcoming.slice(0, 3) : upcoming,
      "Nenhum atendimento confirmado para os próximos dias.",
      true
    );
  }
  document.querySelectorAll(
    "[data-overview-filter]"
  ).forEach(card => {
    card.addEventListener("click", () => {
      overviewFilter = card.dataset.overviewFilter;
      renderOverview();
    });
  });
  // A listagem completa mantém o filtro selecionado na Visão geral.
  $("overview-view-all")?.addEventListener("click", () => {
    requestsFilter = overviewFilter === "recent" ? "all" : overviewFilter;
    const select = $("requests-filter");
    if (select) {
      select.value = requestsFilter;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    renderRequests();
  });
  $("overview-upcoming-all")?.addEventListener("click", () => {
    requestsFilter = "confirmed";
    const select = $("requests-filter");
    if (select) {
      select.value = "confirmed";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    showView("requests");
  });
  $("overview-reset-filter")?.addEventListener(
    "click",
    () => {
      overviewFilter = "recent";
      renderOverview();
    }
  );
  /* ========================================
     9. NOTIFICAÇÕES
  ======================================== */
  function renderNotifications() {
    const list = $("notification-list");
    if (!list) return;
    list.replaceChildren();
    const pending = sortedBookings(
      state.bookings.filter(
        booking => booking.status === "pending"
      )
    );
    if (!pending.length) {
      list.appendChild(
        element(
          "p",
          "dashboard-empty",
          "Nenhuma solicitação pendente."
        )
      );
      return;
    }
    pending.slice(0, 8).forEach(booking => {
      list.appendChild(
        button(
          `${booking.name} · ${formatDate(booking.date)}`,
          "notification-item",
          () => {
            closeNotifications();
            openBookingModal(booking.id);
          }
        )
      );
    });
  }
  $("notification-button")?.addEventListener(
    "click",
    () => {
      const panel = $("notification-panel");
      if (!panel) return;
      const opening = panel.hidden;
      panel.hidden = !opening;
      $("notification-button").setAttribute(
        "aria-expanded",
        String(opening)
      );
      if (opening) renderNotifications();
    }
  );
  $("notification-close")?.addEventListener(
    "click",
    closeNotifications
  );
  $("notification-view-all")?.addEventListener(
    "click",
    () => {
      requestsFilter = "pending";
      if ($("requests-filter")) {
        $("requests-filter").value = "pending";
      }
      showView("requests");
    }
  );
  /* ========================================
     10. SOLICITAÇÕES
  ======================================== */
  function renderRequests() {
    const search = normalizeName(
      $("requests-search")?.value || ""
    );
    const filtered = sortedBookings(
      state.bookings.filter(booking => {
        if (!matchesFilter(booking, requestsFilter)) {
          return false;
        }
        if (!search) return true;
        const text = normalizeName(
          `${booking.name} ` +
          `${booking.vehicle} ` +
          `${serviceName(booking)}`
        );
        return text.includes(search);
      })
    );
    const headings = {
      all: "Todas as solicitações",
      pending: "Solicitações pendentes",
      confirmed: "Agendamentos confirmados",
      completed: "Agendamentos finalizados",
      cancelled: "Agendamentos cancelados",
      rejected: "Solicitações recusadas",
      "cancelled-rejected": "Cancelados e recusados"
    };
    if ($("requests-heading")) {
      $("requests-heading").textContent =
        headings[requestsFilter] ||
        "Todas as solicitações";
    }
    if ($("requests-description")) {
      $("requests-description").textContent =
        "Consulte e gerencie os agendamentos fictícios.";
    }
    if ($("requests-count")) {
      $("requests-count").textContent =
        `${filtered.length} ${filtered.length === 1 ? "agendamento encontrado" : "agendamentos encontrados"}`;
    }
    renderBookingList(
      "requests-list",
      filtered,
      "Nenhuma solicitação corresponde aos filtros."
    );
  }
  function setupRequestFilterMenu() {
    const select = $("requests-filter");
    if (!select || select.dataset.lumeEnhanced) return;
    select.dataset.lumeEnhanced = "true";
    select.classList.add("lume-requests-native-select");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "lume-requests-trigger";
    trigger.setAttribute("aria-label", "Filtrar por situação");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    select.after(trigger);
    let menu = null;
    function refresh() {
      trigger.textContent = select.selectedOptions[0]?.textContent.trim() || "Todas as solicitações";
    }
    function close() {
      if (!menu) return;
      menu.remove();
      menu = null;
      trigger.setAttribute("aria-expanded", "false");
    }
    select.addEventListener("change", refresh);
    trigger.addEventListener("click", () => {
      if (menu) {close(); return;}
      menu = document.createElement("div");
      menu.className = "lume-requests-menu";
      menu.setAttribute("role", "listbox");
      const rect = trigger.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 5}px`;
      menu.style.width = `${rect.width}px`;
      for (const choice of select.options) {
        const opt = document.createElement("button");
        opt.type = "button";
        opt.className = "lume-requests-option";
        opt.textContent = choice.textContent.trim();
        opt.setAttribute("role", "option");
        opt.setAttribute("aria-selected", String(choice.value === select.value));
        opt.addEventListener("click", () => {
          select.value = choice.value;
          select.dispatchEvent(new Event("change", {bubbles:true}));
          close();
          trigger.focus();
        });
        menu.appendChild(opt);
      }
      document.body.appendChild(menu);
      menu.style.maxHeight = `${Math.max(80, Math.min(300, window.innerHeight - rect.bottom - 12))}px`;
      trigger.setAttribute("aria-expanded", "true");
    });
    trigger.addEventListener("keydown", event => {
      if (event.key === "Escape") close();
    });
    document.addEventListener("pointerdown", event => {
      if (menu && !menu.contains(event.target) && !trigger.contains(event.target)) close();
    });
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    refresh();
  }
  setupRequestFilterMenu();
  $("requests-filter")?.addEventListener(
    "change",
    event => {
      requestsFilter = event.target.value;
      renderRequests();
    }
  );
  $("requests-search")?.addEventListener(
    "input",
    renderRequests
  );
  /* ========================================
     11. CALENDÁRIO ADMINISTRATIVO
  ======================================== */
  function renderCalendar() {
    const label = $("calendar-month-label");
    const days = $("calendar-days");
    if (!label || !days) return;
    const monthText = monthLabel(calendarMonth);
    label.textContent = monthText.charAt(0).toUpperCase() + monthText.slice(1);
    days.replaceChildren();
    const first = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1
    );
    for (let i = 0; i < first.getDay(); i++) {
      days.appendChild(
        element("span", "dashboard-calendar-blank")
      );
    }
    const lastDay = new Date(
      first.getFullYear(),
      first.getMonth() + 1,
      0
    ).getDate();
    for (let day = 1; day <= lastDay; day++) {
      const date = new Date(
        first.getFullYear(),
        first.getMonth(),
        day
      );
      const key = dateKey(date);
      const bookings = state.bookings.filter(
        item => (
          item.date === key &&
          occupiesTime(item)
        )
      );
      const dayButton = button(
        String(day),
        "dashboard-calendar-day",
        () => {
          selectedCalendarDate = key;
          renderCalendar();
          renderDayBookings();
        }
      );
      dayButton.classList.toggle(
        "is-selected",
        key === selectedCalendarDate
      );
      dayButton.classList.toggle(
        "has-bookings",
        bookings.length > 0
      );
      const dateBlocks = state.blocks.filter(block => block.date === key);
      const isFullBlocked = dateBlocks.some(block =>
        block.type === "day" || block.is_full_day === 1
      );
      const isPartBlocked = !isFullBlocked && dateBlocks.length > 0;
      dayButton.classList.toggle("is-blocked-full", isFullBlocked);
      dayButton.classList.toggle("is-blocked-partial", isPartBlocked);
      dayButton.classList.toggle("is-today", key === dateKey(today()));
      if (isFullBlocked || isPartBlocked) {
        const symbol = element(
          "span",
          "lume-calendar-block-symbol " +
            (isFullBlocked ? "lume-block-full" : "lume-block-partial")
        );
        symbol.setAttribute("aria-hidden", "true");
        dayButton.appendChild(symbol);
      }
      const settings = getDaySettings(key);
      dayButton.classList.toggle(
        "is-closed",
        !settings?.open
      );
      dayButton.setAttribute(
        "aria-label",
        `${formatDate(key)}: ` +
        `${bookings.length} atendimento(s)` +
        (isFullBlocked ? ", bloqueado o dia inteiro" :
          isPartBlocked ? ", com bloqueio parcial" : "")
      );
      if (key === selectedCalendarDate) {
        dayButton.setAttribute(
          "aria-pressed",
          "true"
        );
      }
      days.appendChild(dayButton);
    }
    let legend = $("lume-agenda-calendar-legend");
    if (!legend) {
      legend = element("div", "lume-agenda-legend");
      legend.id = "lume-agenda-calendar-legend";
      days.parentElement?.appendChild(legend);
    }
    legend.replaceChildren();
    const legendItems = [
      ["lume-legend-dot", "Com agendamentos"],
      ["lume-legend-full", "Dia bloqueado"],
      ["lume-legend-partial", "Horário bloqueado"],
      ["lume-legend-today", "Hoje"],
      ["lume-legend-selected", "Selecionado"]
    ];
    legendItems.forEach(([symbolClass, label]) => {
      const item = element("span", "lume-legend-item");
      const symbol = element("span", "lume-legend-symbol " + symbolClass);
      symbol.setAttribute("aria-hidden", "true");
      item.append(symbol, element("span", "", label));
      legend.appendChild(item);
    });
  }
  $("calendar-prev")?.addEventListener(
    "click",
    () => {
      calendarMonth = new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth() - 1,
        1
      );
      renderCalendar();
    }
  );
  $("calendar-next")?.addEventListener(
    "click",
    () => {
      calendarMonth = new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth() + 1,
        1
      );
      renderCalendar();
    }
  );
  function renderDayBookings() {
    const day = getDaySettings(
      selectedCalendarDate
    );
    if ($("agenda-selected-date-title")) {
      $("agenda-selected-date-title").textContent =
        `Atendimentos de ${formatDate(selectedCalendarDate)}`;
    }
    if ($("agenda-selected-date-description")) {
      $("agenda-selected-date-description").textContent =
        day?.open
          ? `Funcionamento: ${day.start} às ${day.end}`
          : "Estabelecimento fechado nesta data.";
    }
    const bookings = sortedBookings(
      state.bookings.filter(
        booking => booking.date === selectedCalendarDate
      )
    );
    const dayList = $("agenda-day-bookings");
    if (dayList) {
      dayList.replaceChildren();
      if (!bookings.length) {
        dayList.appendChild(element(
          "p", "dashboard-empty", "Nenhum agendamento para esta data."
        ));
      } else {
        bookings.forEach(booking => {
          const row = element("article", "lume-agenda-booking-row");
          const time = element("time", "lume-agenda-booking-time", booking.start);
          time.dateTime = booking.start;
          const detail = element("div", "lume-agenda-booking-detail");
          detail.appendChild(element("strong", "", booking.name));
          detail.appendChild(element("p", "", serviceName(booking)));
          const actions = element("div", "lume-agenda-booking-actions");
          actions.appendChild(element(
            "span", `admin-status admin-status-${booking.status}`,
            statusNames[booking.status] || booking.status
          ));
          actions.appendChild(button(
            "Detalhes", "admin-row-button", () => openBookingModal(booking.id)
          ));
          row.append(time, detail, actions);
          dayList.appendChild(row);
        });
      }
    }
  }
  /* ========================================
     12. BLOQUEIOS DA AGENDA
  ======================================== */
  function renderBlocks() {
    const list = $("agenda-blocks-list");
    if (!list) return;
    list.replaceChildren();
    const blocks = [...state.blocks].sort(
      (a, b) => (
        a.date.localeCompare(b.date) ||
        String(a.start || "").localeCompare(
          String(b.start || "")
        )
      )
    );
    list.classList.toggle("lume-blocks-empty", blocks.length === 0);
    if (!blocks.length) {
      list.appendChild(element(
        "p", "dashboard-empty", "Nenhum bloqueio cadastrado."
      ));
      return;
    }
    blocks.forEach(block => {
      const row = element(
        "div",
        "admin-request-row"
      );
      const main = element(
        "div",
        "admin-request-primary"
      );
      const description =
        block.type === "day"
          ? "Dia inteiro"
          : `${block.start} às ${block.end}`;
      main.appendChild(
        element(
          "strong",
          "",
          `${formatDate(block.date)} · ${description}`
        )
      );
      main.appendChild(
        element(
          "p",
          "",
          block.reason || "Sem motivo informado"
        )
      );
      const removeButton = button(
        "Remover",
        "admin-row-button",
        () => {
          askConfirmation("Remover bloqueio?", `O bloqueio de ${formatDate(block.date)} (${description}) será removido. A data poderá receber novos agendamentos.`, "Remover bloqueio", () => {
            state.blocks = state.blocks.filter(item => item.id !== block.id);
            if (!save()) return;
            renderAll();
            showToast("Bloqueio removido.");
          });
        }
      );
      row.append(main, removeButton);
      list.appendChild(row);
    });
  }
  // Gerenciamento dos novos modais demonstrativos.
  const modalIds = ["booking-modal", "service-modal", "service-create-modal", "block-modal", "confirm-modal", "reschedule-modal"];
  function modalOpen(id) {
    return Boolean($(id) && !$(id).hidden);
  }
  function syncModalScroll() {
    document.body.classList.toggle("is-modal-open", modalIds.some(modalOpen));
  }
  function openExtraModal(id, focusId) {
    const modal = $(id);
    if (!modal) return;
    modal.hidden = false;
    syncModalScroll();
    $(focusId)?.focus();
  }
  function closeExtraModal(id) {
    if ($(id)) $(id).hidden = true;
    syncModalScroll();
  }
  $("open-block-modal")?.addEventListener("click", () => openExtraModal("block-modal", "block-date"));
  $("block-modal-close")?.addEventListener("click", () => closeExtraModal("block-modal"));
  $("block-modal-cancel")?.addEventListener("click", () => closeExtraModal("block-modal"));
  $("open-service-create-modal")?.addEventListener("click", () => openExtraModal("service-create-modal", "service-name"));
  $("service-create-modal-close")?.addEventListener("click", () => closeExtraModal("service-create-modal"));
  $("service-create-modal-cancel")?.addEventListener("click", () => closeExtraModal("service-create-modal"));
  // Calendario visual proprio para evitar a selecao azul do Chrome.
  // O campo original conserva o valor ISO esperado pela agenda.
  const customDateControls = [];
  let currentDatePopover = null;
  function closeDatePopover() {
    if (!currentDatePopover) return;
    currentDatePopover.popup.remove();
    currentDatePopover.trigger.setAttribute("aria-expanded", "false");
    currentDatePopover = null;
  }
  function dateLabel(iso) {
    if (!validDate(iso)) return "Selecionar data";
    const [year, month, day] = iso.split("-");
    return `${day}/${month}/${year}`;
  }
  function positionDatePopover() {
    if (!currentDatePopover) return;
    const { popup, trigger } = currentDatePopover;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(310, window.innerWidth - 24);
    const estimatedHeight = 345;
    const top = rect.bottom + estimatedHeight + 8 > window.innerHeight && rect.top > estimatedHeight
      ? rect.top - estimatedHeight - 8 : rect.bottom + 8;
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    popup.style.top = `${Math.max(8, top)}px`;
  }
  function showDatePopover(input, trigger) {
    if (currentDatePopover?.trigger === trigger) {
      closeDatePopover();
      return;
    }
    closeDatePopover();
    const popup = document.createElement("div");
    popup.className = "lume-date-popover";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Selecionar data");
    document.body.appendChild(popup);
    trigger.setAttribute("aria-expanded", "true");
    currentDatePopover = { popup, trigger };
    const base = validDate(input.value) ? dateFromKey(input.value) : today();
    let shownYear = base.getFullYear();
    let shownMonth = base.getMonth();
    function render() {
      popup.replaceChildren();
      const heading = document.createElement("div");
      heading.className = "lume-date-heading";
      const previous = document.createElement("button");
      previous.type = "button";
      previous.textContent = "‹";
      previous.setAttribute("aria-label", "Mes anterior");
      const month = document.createElement("strong");
      month.textContent = new Intl.DateTimeFormat("pt-BR", {
        month: "long", year: "numeric"
      }).format(new Date(shownYear, shownMonth, 1));
      const next = document.createElement("button");
      next.type = "button";
      next.textContent = "›";
      next.setAttribute("aria-label", "Proximo mes");
      previous.addEventListener("click", () => {
        const date = new Date(shownYear, shownMonth - 1, 1);
        shownYear = date.getFullYear();
        shownMonth = date.getMonth();
        render();
      });
      next.addEventListener("click", () => {
        const date = new Date(shownYear, shownMonth + 1, 1);
        shownYear = date.getFullYear();
        shownMonth = date.getMonth();
        render();
      });
      heading.append(previous, month, next);
      popup.appendChild(heading);
      const weekdays = document.createElement("div");
      weekdays.className = "lume-date-grid lume-date-weekdays";
      ["D", "S", "T", "Q", "Q", "S", "S"].forEach(label => {
        const item = document.createElement("span");
        item.textContent = label;
        weekdays.appendChild(item);
      });
      popup.appendChild(weekdays);
      const grid = document.createElement("div");
      grid.className = "lume-date-grid";
      const firstWeekday = new Date(shownYear, shownMonth, 1).getDay();
      const daysInMonth = new Date(shownYear, shownMonth + 1, 0).getDate();
      for (let offset = 0; offset < firstWeekday; offset++) {
        grid.appendChild(document.createElement("span"));
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const iso = dateKey(new Date(shownYear, shownMonth, day));
        const choice = document.createElement("button");
        choice.type = "button";
        choice.textContent = String(day);
        choice.className = "lume-date-day";
        choice.disabled = Boolean(input.min && iso < input.min) ||
          Boolean(input.max && iso > input.max) ||
          (input.id === "reschedule-date" && !rescheduleDateAvailable(iso));
        if (iso === input.value) choice.classList.add("is-selected");
        if (iso === dateKey(today())) choice.classList.add("is-today");
        choice.addEventListener("click", () => {
          input.value = iso;
          trigger.textContent = dateLabel(iso);
          trigger.classList.add("has-date");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          closeDatePopover();
          trigger.focus();
        });
        grid.appendChild(choice);
      }
      popup.appendChild(grid);
      const footer = document.createElement("div");
      footer.className = "lume-date-footer";
      const clear = document.createElement("button");
      clear.type = "button";
      clear.textContent = "Limpar";
      clear.addEventListener("click", () => {
        input.value = "";
        trigger.textContent = dateLabel("");
        trigger.classList.remove("has-date");
        input.dispatchEvent(new Event("change", { bubbles: true }));
        closeDatePopover();
        trigger.focus();
      });
      const todayButton = document.createElement("button");
      todayButton.type = "button";
      todayButton.textContent = "Hoje";
      const todayIso = dateKey(today());
      todayButton.disabled = Boolean(input.min && todayIso < input.min) ||
        (input.id === "reschedule-date" && !rescheduleDateAvailable(todayIso));
      todayButton.addEventListener("click", () => {
        input.value = todayIso;
        trigger.textContent = dateLabel(todayIso);
        trigger.classList.add("has-date");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        closeDatePopover();
        trigger.focus();
      });
      footer.append(clear, todayButton);
      popup.appendChild(footer);
      positionDatePopover();
    }
    render();
  }
  document.querySelectorAll('input[type="date"]').forEach(input => {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "lume-date-trigger";
    trigger.textContent = dateLabel(input.value);
    trigger.classList.toggle("has-date", validDate(input.value));
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-haspopup", "dialog");
    const associatedLabel = input.closest("label")?.querySelector("span")?.textContent;
    trigger.setAttribute("aria-label", associatedLabel || "Selecionar data");
    input.type = "hidden";
    input.insertAdjacentElement("afterend", trigger);
    trigger.addEventListener("click", event => {
      event.preventDefault();
      showDatePopover(input, trigger);
    });
    input.addEventListener("change", () => {
      trigger.textContent = dateLabel(input.value);
      trigger.classList.toggle("has-date", validDate(input.value));
    });
    customDateControls.push({ input, trigger });
  });
  document.addEventListener("pointerdown", event => {
    if (!currentDatePopover) return;
    if (currentDatePopover.popup.contains(event.target) ||
        currentDatePopover.trigger.contains(event.target)) return;
    closeDatePopover();
  });
  window.addEventListener("resize", positionDatePopover);
  window.addEventListener("scroll", () => {
    if (currentDatePopover) closeDatePopover();
  }, true);
  document.addEventListener("reset", event => {
    if (!event.target?.querySelector) return;
    requestAnimationFrame(() => {
      customDateControls.forEach(({ input, trigger }) => {
        trigger.textContent = dateLabel(input.value);
        trigger.classList.toggle("has-date", validDate(input.value));
      });
    });
  });
  /* Menus personalizados do bloqueio, sem seletor nativo azul. */
  const blockMenuControls = [];
  let activeBlockMenu = null;
  function closeBlockMenu() {
    if (!activeBlockMenu) return;
    activeBlockMenu.panel.remove();
    activeBlockMenu.trigger.setAttribute("aria-expanded", "false");
    activeBlockMenu = null;
  }
  function decorateBlockSelect(id, choices) {
    const select = $(id);
    if (!select) return;
    // O select original permanece como fonte do valor para o formulário.
    select.classList.add("lume-block-native-select");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "lume-block-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", id === "block-type" ? "Tipo de bloqueio" : id === "block-start" ? "Horário inicial" : "Horário final");
    const showValue = () => {
      const choice = choices.find(item => item.value === select.value);
      trigger.textContent = choice?.label || select.value;
    };
    showValue();
    select.insertAdjacentElement("afterend", trigger);
    select.addEventListener("change", showValue);
    trigger.addEventListener("click", event => {
      event.preventDefault();
      if (activeBlockMenu?.trigger === trigger) { closeBlockMenu(); return; }
      closeBlockMenu();
      const panel = document.createElement("div");
      panel.className = "lume-block-select-menu";
      panel.setAttribute("role", "listbox");
      panel.setAttribute("aria-label", trigger.getAttribute("aria-label"));
      const rect = trigger.getBoundingClientRect();
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.bottom + 5}px`;
      panel.style.width = `${rect.width}px`;
      choices.forEach(choice => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "lume-block-select-option";
        option.textContent = choice.label;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(select.value === choice.value));
        option.addEventListener("click", () => {
          select.value = choice.value;
          select.dispatchEvent(new Event("change", {bubbles:true}));
          closeBlockMenu();
          trigger.focus();
        });
        panel.appendChild(option);
      });
      document.body.appendChild(panel);
      activeBlockMenu = {panel, trigger};
      trigger.setAttribute("aria-expanded", "true");
      // Abrir sempre para baixo; se não houver espaço, o painel pode rolar.
      const room = Math.max(110, window.innerHeight - rect.bottom - 12);
      panel.style.maxHeight = `${Math.min(210, room)}px`;
      const selectedOption = panel.querySelector('[aria-selected="true"]');
      if (selectedOption) panel.scrollTop = Math.max(0, selectedOption.offsetTop - panel.offsetTop - 40);
    });
    trigger.addEventListener("keydown", event => {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        if (!activeBlockMenu || activeBlockMenu.trigger !== trigger) {
          event.preventDefault(); trigger.click();
        }
      }
    });
    blockMenuControls.push({select, trigger, showValue});
  }
  const blockTimes = [];
  for (let t = 7 * 60; t <= 20 * 60; t += 30) {
    const value = timeString(t);
    blockTimes.push({value, label:value});
  }
  for (const id of ["block-start", "block-end"]) {
    const input = $(id);
    if (!input) continue;
    const select = document.createElement("select");
    select.id = id;
    select.className = input.className;
    for (const choice of blockTimes) select.add(new Option(choice.label, choice.value));
    select.value = blockTimes.some(choice => choice.value === input.value)
      ? input.value : (id === "block-start" ? "08:00" : "09:00");
    input.replaceWith(select);
  }
  decorateBlockSelect("block-type", [
    {value:"day",label:"Dia inteiro"},
    {value:"period",label:"Período específico"}
  ]);
  decorateBlockSelect("block-start", blockTimes);
  decorateBlockSelect("block-end", blockTimes);
  document.addEventListener("pointerdown", event => {
    if (activeBlockMenu && !activeBlockMenu.panel.contains(event.target) &&
        !activeBlockMenu.trigger.contains(event.target)) closeBlockMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeBlockMenu();
  });
  window.addEventListener("resize", closeBlockMenu);
  window.addEventListener("scroll", event => {
    if (activeBlockMenu && !activeBlockMenu.panel.contains(event.target)) closeBlockMenu();
  }, true);
  document.addEventListener("reset", event => {
    if (event.target !== $("block-form")) return;
    closeBlockMenu();
    requestAnimationFrame(() => blockMenuControls.forEach(item => item.showValue()));
  });
  const blockForm = $("block-form");
  function updateBlockType() {
    const period =
      $("block-type")?.value === "period";
    if ($("block-start-field")) {
      $("block-start-field").hidden = !period;
    }
    if ($("block-end-field")) {
      $("block-end-field").hidden = !period;
    }
  }
  $("block-type")?.addEventListener(
    "change",
    updateBlockType
  );
  blockForm?.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      const date = $("block-date").value;
      const type = $("block-type").value;
      const start = $("block-start").value;
      const end = $("block-end").value;
      const reason = $("block-reason").value.trim();
      if (!validDate(date)) {
        showToast("Informe uma data válida.");
        return;
      }
      if (type === "period") {
        if (
          !validTime(start) ||
          !validTime(end) ||
          minutes(start) >= minutes(end)
        ) {
          showToast(
            "O horário final deve ser posterior ao inicial."
          );
          return;
        }
      }
      const begin =
        type === "day" ? 0 : minutes(start);
      const finish =
        type === "day" ? 1440 : minutes(end);
      const conflictingBookings =
        state.bookings.filter(booking => (
          booking.date === date &&
          occupiesTime(booking) &&
          overlaps(
            begin,
            finish,
            minutes(booking.start),
            bookingEnd(booking)
          )
        ));
      if (conflictingBookings.length) {
        showToast(
          "Existem agendamentos ativos neste período. " +
          "Analise-os antes de criar o bloqueio."
        );
        return;
      }
      state.blocks.push({
        id: nextId(state.blocks),
        date,
        type,
        start: type === "period" ? start : null,
        end: type === "period" ? end : null,
        reason
      });
      if (!save()) return;
      blockForm.reset();
      updateBlockType();
      closeExtraModal("block-modal");
      renderAll();
      showToast("Bloqueio criado na demonstração.");
    }
  );
  function installServiceSummary() {
    const serviceSelect = $("manual-service");
    if (!serviceSelect || $("lume-manual-service-summary")) return;
    const summary = element("div", "lume-manual-service-summary");
    summary.id = "lume-manual-service-summary";
    summary.hidden = true;
    serviceSelect.parentElement?.appendChild(summary);
    function update() {
      const service = findService(serviceSelect.value);
      summary.hidden = !service;
      summary.textContent = service ? `${durationString(service.duration)}  ·  ${money(service.price)}` : "";
    }
    serviceSelect.addEventListener("change", update);
    update();
  }
  function installPhoneMask() {
    const input = $("manual-phone");
    if (!input) return;
    input.setAttribute("inputmode", "numeric");
    input.addEventListener("input", () => {
      const digits = input.value.replace(/\D/g, "").slice(0, 11);
      if (!digits) { input.value = ""; return; }
      let formatted = `(${digits.slice(0,2)}`;
      if (digits.length >= 2) formatted += ") ";
      if (digits.length > 2) {
        const size = digits.length > 10 ? 5 : 4;
        formatted += digits.slice(2,2 + size);
        if (digits.length > 2 + size) formatted += "-" + digits.slice(2 + size);
      }
      input.value = formatted;
    });
  }
  function showBookingCreatedSummary(booking) {
    let modal = $("lume-created-modal");
    if (!modal) {
      modal = element("div", "lume-created-modal");
      modal.id = "lume-created-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-label", "Resumo do agendamento criado");
      document.body.appendChild(modal);
    }
    modal.replaceChildren();
    const panel = element("div", "lume-created-panel");
    panel.appendChild(element("h2", "", "✓ Agendamento criado!"));
    panel.appendChild(element("p", "lume-created-intro", "Atendimento registrado nesta demonstração."));
    const details = element("div", "lume-created-details");
    [
      ["Cliente", booking.name],
      ["Serviço", serviceName(booking)],
      ["Data", formatDate(booking.date)],
      ["Horário", `${booking.start} às ${timeString(bookingEnd(booking))}`],
      ["Valor", money(booking.price)],
      ["Situação", statusNames[booking.status] || booking.status]
    ].forEach(([label, value]) => {
      const line = element("div", "lume-created-detail");
      line.append(element("span", "", label), element("strong", "", String(value)));
      details.appendChild(line);
    });
    panel.appendChild(details);
    const actions = element("div", "lume-created-actions");
    actions.appendChild(button("Criar outro agendamento", "dashboard-btn dashboard-btn-outline", () => {
      modal.remove();
      showView("new");
      $("manual-name")?.focus();
    }));
    actions.appendChild(button("Ver na agenda", "dashboard-btn lume-created-primary", () => {
      modal.remove();
      selectedCalendarDate = booking.date;
      calendarMonth = new Date(dateFromKey(booking.date).getFullYear(), dateFromKey(booking.date).getMonth(), 1);
      showView("agenda");
    }));
    panel.appendChild(actions);
    modal.appendChild(panel);
    modal.addEventListener("click", event => { if (event.target === modal) modal.remove(); }, {once:true});
    actions.querySelector("button:last-child")?.focus();
  }
  /* ========================================
     13. AGENDAMENTO MANUAL
  ======================================== */
  function populateManualServices() {
    const select = $("manual-service");
    if (!select) return;
    const previous = select.value;
    select.replaceChildren(
      new Option("Selecione um serviço", "")
    );
    state.services
      .filter(service => service.active)
      .forEach(service => {
        select.add(
          new Option(
            `${service.name} — ${money(service.price)}`,
            service.id
          )
        );
      });
    if ([...select.options].some(
      option => option.value === previous
    )) {
      select.value = previous;
    }
    select.dispatchEvent(new Event("change"));
  }
  function updateManualTimes() {
    const select = $("manual-time");
    if (!select) return;
    const previous = select.value;
    select.replaceChildren(
      new Option("Selecione um horário", "")
    );
    const key = $("manual-date")?.value;
    const serviceId = $("manual-service")?.value;
    if (!key || !serviceId) return;
    availableTimes(key, serviceId).forEach(
      time => {
        select.add(new Option(time, time));
      }
    );
    if ([...select.options].some(
      option => option.value === previous
    )) {
      select.value = previous;
    }
    select.dispatchEvent(new Event("change"));
  }
  $("manual-service")?.addEventListener(
    "change",
    updateManualTimes
  );
  $("manual-date")?.addEventListener(
    "change",
    updateManualTimes
  );
  const manualForm = $("manual-booking-form");
  manualForm?.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      showError("manual-booking-error", "");
      const serviceId = $("manual-service").value;
      const date = $("manual-date").value;
      const start = $("manual-time").value;
      const status = $("manual-status").value;
      const service = findService(serviceId);
      if (
        !service ||
        !service.active ||
        !["pending", "confirmed"].includes(status)
      ) {
        showError(
          "manual-booking-error",
          "Selecione um serviço e uma situação válidos."
        );
        return;
      }
      if (
        !validDate(date) ||
        !validTime(start) ||
        !canSchedule(date, start, service.duration)
      ) {
        showError(
          "manual-booking-error",
          "O horário selecionado não está disponível."
        );
        updateManualTimes();
        return;
      }
      /*
        A versão demonstrativa não armazena
        informações pessoais digitadas.
      */
      const createdBooking = {
        id: nextId(state.bookings, 1006),
        name: "Cliente demonstrativo",
        phone: "00000000000",
        vehicle: "Veículo demonstrativo",
        serviceId: service.id,
        serviceName: service.name,
        date,
        start,
        duration: service.duration,
        price: service.price,
        status,
        origin: "manual",
        notes: "",
        demoPublic: true
      };
      state.bookings.push(createdBooking);
      if (!save()) return;
      manualForm.reset();
      showError("manual-booking-error", "");
      selectedCalendarDate = date;
      calendarMonth = new Date(
        dateFromKey(date).getFullYear(),
        dateFromKey(date).getMonth(),
        1
      );
      renderAll();
      showBookingCreatedSummary(createdBooking);
    }
  );
  manualForm?.addEventListener(
    "reset",
    () => {
      setTimeout(updateManualTimes, 0);
    }
  );
  /* ========================================
     14. LISTAGEM DE SERVIÇOS
  ======================================== */
  function renderServices() {
    const list = $("services-list");
    if (!list) return;
    list.replaceChildren();
    if (!state.services.length) {
      list.appendChild(
        element(
          "p",
          "dashboard-empty",
          "Nenhum serviço cadastrado."
        )
      );
      return;
    }
    state.services.forEach(service => {
      const row = element(
        "article",
        "admin-request-row"
      );
      const main = element(
        "div",
        "admin-request-primary"
      );
      main.appendChild(
        element("strong", "", service.name)
      );
      main.appendChild(
        element(
          "p",
          "",
          `${money(service.price)}  ·  ${durationString(service.duration)}`
        )
      );
      const actions = element(
        "div",
        "admin-request-secondary"
      );
      const serviceStatus = element("span", "lume-service-state", service.active ? "Ativo" : "Inativo");
      serviceStatus.classList.toggle("is-inactive", !service.active);
      const editButton = button("Editar", "admin-row-button", () => openServiceModal(service.id));
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "lume-service-switch";
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-label", `Ativar ou desativar ${service.name}`);
      toggle.setAttribute("aria-checked", String(Boolean(service.active)));
      toggle.addEventListener("click", () => {
        const target = findService(service.id);
        if (!target) return;
        const before = target.active;
        target.active = !before;
        if (!save()) { target.active = before; return; }
        renderAll();
        showToast(target.active ? "Serviço ativado." : "Serviço desativado.");
      });
      actions.append(editButton, serviceStatus, toggle);
      row.append(main, actions);
      list.appendChild(row);
    });
  }
  /* ========================================
     15. ADICIONAR SERVIÇO
  ======================================== */
  const serviceForm = $("service-form");
  serviceForm?.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      showError("service-form-error", "");
      const name = $("service-name").value.trim();
      const price = parsePrice(
        $("service-price").value
      );
      const duration = Number(
        $("service-duration").value
      );
      if (name.length < 2 || name.length > 100) {
        showError(
          "service-form-error",
          "Informe um nome entre 2 e 100 caracteres."
        );
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        showError(
          "service-form-error",
          "Informe um valor válido."
        );
        return;
      }
      if (!Number.isInteger(duration) || duration < 1) {
        showError(
          "service-form-error",
          "Selecione uma duração válida."
        );
        return;
      }
      const duplicate = state.services.some(
        item => (
          normalizeName(item.name) ===
          normalizeName(name)
        )
      );
      if (duplicate) {
        showError(
          "service-form-error",
          "Já existe um serviço com esse nome."
        );
        return;
      }
      const fits = state.weekly.some(
        day => (
          day.open &&
          duration <=
            minutes(day.end) - minutes(day.start)
        )
      );
      if (!fits) {
        showError(
          "service-form-error",
          "A duração excede todos os períodos de funcionamento."
        );
        return;
      }
      state.services.push({
        id: `demo-service-${Date.now()}`,
        name,
        price,
        duration,
        active: true
      });
      if (!save()) return;
      serviceForm.reset();
      closeExtraModal("service-create-modal");
      renderAll();
      showToast("Serviço adicionado à demonstração.");
    }
  );
  /* ========================================
     16. EDITAR SERVIÇO
  ======================================== */
  function openServiceModal(id) {
    const service = findService(id);
    if (!service) return;
    editingServiceId = id;
    $("service-edit-id").value = service.id;
    $("service-edit-name").value = service.name;
    $("service-edit-price").value =
      Number(service.price).toLocaleString(
        "pt-BR",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );
    const durationSelect = $("service-edit-duration");
    durationSelect.value = String(service.duration);
    // Sincroniza a legenda do seletor personalizado com o valor cadastrado.
    durationSelect.dispatchEvent(new Event("change", { bubbles: true }));
    showError("service-edit-error", "");
    $("service-modal").hidden = false;
    $("service-edit-name").focus();
  }
  function closeServiceModal() {
    $("service-modal").hidden = true;
    editingServiceId = null;
  }
  $("service-modal-close")?.addEventListener(
    "click",
    closeServiceModal
  );
  $("service-edit-cancel")?.addEventListener(
    "click",
    closeServiceModal
  );
  $("service-edit-form")?.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      const service = findService(editingServiceId);
      if (!service) {
        closeServiceModal();
        return;
      }
      const name = $("service-edit-name").value.trim();
      const price = parsePrice(
        $("service-edit-price").value
      );
      const duration = Number(
        $("service-edit-duration").value
      );
      if (
        name.length < 2 ||
        !Number.isFinite(price) ||
        price < 0 ||
        !Number.isInteger(duration) ||
        duration <= 0
      ) {
        showError(
          "service-edit-error",
          "Confira o nome, valor e duração."
        );
        return;
      }
      const duplicate = state.services.some(
        item => (
          item.id !== service.id &&
          normalizeName(item.name) ===
          normalizeName(name)
        )
      );
      if (duplicate) {
        showError(
          "service-edit-error",
          "Já existe um serviço com esse nome."
        );
        return;
      }
      const fits = state.weekly.some(
        day => (
          day.open &&
          duration <=
            minutes(day.end) - minutes(day.start)
        )
      );
      if (!fits) {
        showError(
          "service-edit-error",
          "A duração excede o funcionamento disponível."
        );
        return;
      }
      /*
        O novo valor vale para novos
        agendamentos. Os anteriores
        preservam preço e duração.
      */
      service.name = name;
      service.price = price;
      service.duration = duration;
      if (!save()) return;
      closeServiceModal();
      renderAll();
      showToast("Serviço atualizado.");
    }
  );
  /* ========================================
     17. MODAL DOS AGENDAMENTOS
  ======================================== */
  function modalDetail(label, value, className = "") {
    const row = element("div", `lume-booking-detail ${className}`.trim());
    row.appendChild(element("span", "lume-booking-detail-label", label));
    row.appendChild(element("strong", "lume-booking-detail-value", String(value)));
    return row;
  }
  function openBookingModal(id) {
    const booking = state.bookings.find(item => item.id === id);
    if (!booking) return;
    editingBookingId = id;
    const body = $("booking-modal-body");
    const actions = $("booking-modal-actions");
    if (!body || !actions) return;
    body.replaceChildren();
    actions.replaceChildren();
    const wrap = element("div", "lume-booking-details");
    wrap.appendChild(modalDetail("Cliente", booking.name, "lume-booking-wide"));
    const grid = element("div", "lume-booking-details-grid");
    grid.appendChild(modalDetail("Veículo", booking.vehicle));
    grid.appendChild(modalDetail("Serviço", serviceName(booking)));
    grid.appendChild(modalDetail("Data", formatDate(booking.date)));
    grid.appendChild(modalDetail("Horário", `${booking.start} – ${timeString(bookingEnd(booking))}`, "lume-booking-accent"));
    grid.appendChild(modalDetail("Duração", durationString(booking.duration)));
    grid.appendChild(modalDetail("Valor", money(booking.price)));
    wrap.appendChild(grid);
    const footer = element("div", "lume-booking-meta");
    const status = element("div", "lume-booking-meta-item");
    status.appendChild(element("span", "lume-booking-detail-label", "Situação atual"));
    status.appendChild(element("span", `admin-status admin-status-${booking.status}`, statusNames[booking.status] || booking.status));
    const origin = modalDetail("Origem", booking.origin === "manual" ? "Painel administrativo" : "Site demonstrativo");
    footer.append(status, origin);
    wrap.appendChild(footer);
    if (booking.notes) wrap.appendChild(modalDetail("Observações", booking.notes, "lume-booking-wide"));
    body.appendChild(wrap);
    const close = button("Fechar", "dashboard-btn dashboard-btn-outline lume-booking-close", closeBookingModal);
    actions.appendChild(close);
    const action = (label, status, className) => {
      actions.appendChild(button(label, `dashboard-btn ${className}`, () => {
        if (["rejected", "cancelled"].includes(status)) {
          const refusing = status === "rejected";
          askConfirmation(refusing ? "Recusar solicitação?" : "Cancelar agendamento?", `${serviceName(booking)} · ${formatDate(booking.date)} · ${booking.start}. O horário será liberado para novos atendimentos.`, refusing ? "Sim, recusar" : "Sim, cancelar", () => updateBookingStatus(booking.id, status));
          return;
        }
        updateBookingStatus(booking.id, status);
      }));
    };
    if (booking.status === "pending") {
      action("Recusar", "rejected", "lume-booking-danger");
      action("Confirmar", "confirmed", "lume-booking-primary");
    } else if (booking.status === "confirmed") {
      actions.appendChild(button("Reagendar", "dashboard-btn lume-booking-reschedule", () => openRescheduleModal(booking.id)));
      action("Cancelar", "cancelled", "lume-booking-danger");
      action("Finalizar", "completed", "lume-booking-complete");
    } else {
      actions.appendChild(element("span", "lume-booking-ended", "Solicitação encerrada."));
    }
    $("booking-modal").hidden = false;
    syncModalScroll();
    $("booking-modal-close")?.focus();
  }
  function closeBookingModal() {
    $("booking-modal").hidden = true;
    editingBookingId = null;
    syncModalScroll();
  }
  function updateBookingStatus(id, newStatus) {
    const booking = state.bookings.find(
      item => item.id === id
    );
    if (!booking) return;
    const transitions = {
      pending: ["confirmed", "rejected"],
      confirmed: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
      rejected: []
    };
    if (
      !transitions[booking.status]?.includes(
        newStatus
      )
    ) {
      showToast("Mudança de situação inválida.");
      return;
    }
    booking.status = newStatus;
    if (!save()) return;
    closeBookingModal();
    renderAll();
    showToast(
      `Agendamento: ${statusNames[newStatus]}.`
    );
  }
  $("booking-modal-close")?.addEventListener(
    "click",
    closeBookingModal
  );
  document.addEventListener(
    "keydown",
    event => {
      if (event.key !== "Escape") return;
      if (modalOpen("confirm-modal")) { closeConfirmation(); return; }
      if (modalOpen("reschedule-modal")) { closeReschedule(); return; }
      if (!$("booking-modal")?.hidden) {
        closeBookingModal();
      }
      if (!$("service-modal")?.hidden) {
        closeServiceModal();
      }
      closeExtraModal("block-modal");
      closeExtraModal("service-create-modal");
      closeNotifications();
      closeMenu();
    }
  );
  document.querySelectorAll(
    ".dashboard-modal-overlay"
  ).forEach(overlay => {
    overlay.addEventListener("click", () => {
      if (overlay.parentElement?.id === "booking-modal") closeBookingModal();
    });
  });
  /* Confirmações personalizadas e reagendamento demonstrativo */
  let confirmationAction = null;
  function askConfirmation(title, message, confirmLabel, callback) {
    $("confirm-modal-title").textContent = title;
    $("confirm-modal-message").textContent = message;
    $("confirm-modal-accept").textContent = confirmLabel;
    confirmationAction = callback;
    openExtraModal("confirm-modal", "confirm-modal-cancel");
  }
  function closeConfirmation() {
    confirmationAction = null;
    closeExtraModal("confirm-modal");
  }
  $("confirm-modal-cancel")?.addEventListener("click", closeConfirmation);
  $("confirm-modal-close")?.addEventListener("click", closeConfirmation);
  $("confirm-modal-accept")?.addEventListener("click", () => {
    const callback = confirmationAction;
    closeConfirmation();
    if (callback) callback();
  });
  let rescheduleId = null;
  function rescheduleDateAvailable(key) {
    const booking = state.bookings.find(item => item.id === rescheduleId);
    if (!booking || !validDate(key) || key < dateKey(today())) return false;
    const day = getDaySettings(key);
    if (!day?.open) return false;
    const step = Number(state.interval) || 60;
    if (!Number.isFinite(step) || step <= 0) return false;
    for (let n = minutes(day.start); n + Number(booking.duration) <= minutes(day.end); n += step) {
      if (key === dateKey(today())) {
        const now = new Date();
        if (n <= now.getHours() * 60 + now.getMinutes()) continue;
      }
      if (canSchedule(key, timeString(n), booking.duration, booking.id)) return true;
    }
    return false;
  }
  function resetRescheduleFields() {
    const date = $("reschedule-date");
    const time = $("reschedule-time");
    if (date) {
      date.value = "";
      date.dispatchEvent(new Event("change", {bubbles:true}));
    }
    if (time) {
      time.replaceChildren(new Option("Selecione uma data primeiro", ""));
      time.value = "";
      time.dispatchEvent(new Event("change", {bubbles:true}));
    }
    showError("reschedule-error", "");
    closeDatePopover();
  }
  function openRescheduleModal(id) {
    const booking = state.bookings.find(item => item.id === id);
    if (!booking || booking.status !== "confirmed") return;
    closeBookingModal(); // Não manter uma segunda janela invisível prendendo a rolagem.
    rescheduleId = id;
    $("reschedule-date").min = dateKey(today());
    $("reschedule-summary").textContent = `${serviceName(booking)} · ${durationString(booking.duration)} · ${formatDate(booking.date)} às ${booking.start}`;
    resetRescheduleFields();
    openExtraModal("reschedule-modal", "reschedule-date");
  }
  function populateRescheduleTimes() {
    const booking = state.bookings.find(item => item.id === rescheduleId);
    const select = $("reschedule-time");
    if (!booking || !select) return;
    select.replaceChildren(new Option("Selecione um horário", ""));
    const key = $("reschedule-date").value;
    if (!rescheduleDateAvailable(key)) {
      select.options[0].textContent = key ? "Nenhum horário disponível" : "Selecione uma data primeiro";
      select.dispatchEvent(new Event("change", {bubbles:true}));
      return;
    }
    const day = getDaySettings(key);
    const interval = Number(state.interval) || 60;
    for (let time = minutes(day.start); time + Number(booking.duration) <= minutes(day.end); time += interval) {
      const start = timeString(time);
      if (key === dateKey(today())) {
        const now = new Date();
        if (time <= now.getHours() * 60 + now.getMinutes()) continue;
      }
      if (canSchedule(key, start, booking.duration, booking.id)) select.add(new Option(start, start));
    }
    select.value = "";
    select.dispatchEvent(new Event("change", {bubbles:true}));
  }
  $("reschedule-date")?.addEventListener("change", () => {
    showError("reschedule-error", "");
    populateRescheduleTimes();
  });
  function closeReschedule() {
    closeExtraModal("reschedule-modal");
    rescheduleId = null;
    resetRescheduleFields();
    syncModalScroll();
  }
  $("reschedule-close")?.addEventListener("click", closeReschedule);
  $("reschedule-cancel")?.addEventListener("click", closeReschedule);
  $("reschedule-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const booking = state.bookings.find(item => item.id === rescheduleId);
    const key = $("reschedule-date").value;
    const start = $("reschedule-time").value;
    if (!key) {
      showError("reschedule-error", "Escolha uma nova data disponível para continuar.");
      return;
    }
    if (!start) {
      showError("reschedule-error", "Escolha um horário disponível para continuar.");
      return;
    }
    if (!booking || booking.status !== "confirmed" || !rescheduleDateAvailable(key) || !validTime(start) || !canSchedule(key, start, booking.duration, booking.id)) {
      showError("reschedule-error", "Esse horário não está mais disponível. Escolha outra data ou horário.");
      populateRescheduleTimes();
      return;
    }
    if (booking.date === key && booking.start === start) {
      showError("reschedule-error", "Escolha um horário diferente do atual.");
      return;
    }
    booking.rescheduleHistory = Array.isArray(booking.rescheduleHistory) ? booking.rescheduleHistory : [];
    booking.rescheduleHistory.push({date: booking.date, start: booking.start});
    booking.date = key;
    booking.start = start;
    if (!save()) return;
    closeReschedule();
    selectedCalendarDate = key;
    calendarMonth = new Date(dateFromKey(key).getFullYear(), dateFromKey(key).getMonth(), 1);
    renderAll();
    showToast("Agendamento reagendado. O horário anterior foi liberado.");
  });
  /* ========================================
     18. CONFIGURAÇÕES
  ======================================== */
  function populateSettings() {
    if ($("settings-capacity")) {
      $("settings-capacity").value =
        String(state.capacity);
    }
    if ($("settings-interval")) {
      $("settings-interval").value =
        String(state.interval);
    }
    renderWeeklyHours();
  }
  $("capacity-form")?.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      const capacity = Number(
        $("settings-capacity").value
      );
      const interval = Number(
        $("settings-interval").value
      );
      if (
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > 10 ||
        ![15, 30, 60].includes(interval)
      ) {
        showError(
          "capacity-error",
          "Escolha uma capacidade e um intervalo válidos."
        );
        return;
      }
      /*
        Não reduzimos a capacidade abaixo
        dos conflitos simultâneos existentes.
      */
      const active = state.bookings.filter(
        occupiesTime
      );
      for (const booking of active) {
        const sameDay = active.filter(
          other => other.date === booking.date
        );
        const points = [...new Set(
          sameDay.flatMap(item => [
            minutes(item.start),
            bookingEnd(item)
          ])
        )].sort((a, b) => a - b);
        for (let i = 0; i < points.length - 1; i++) {
          const concurrent = sameDay.filter(
            item => overlaps(
              points[i],
              points[i + 1],
              minutes(item.start),
              bookingEnd(item)
            )
          ).length;
          if (concurrent > capacity) {
            showError(
              "capacity-error",
              "Existem atendimentos que excedem essa capacidade."
            );
            return;
          }
        }
      }
      state.capacity = capacity;
      state.interval = interval;
      if (!save()) return;
      showError("capacity-error", "");
      renderAll();
      showToast("Capacidade e intervalo atualizados.");
    }
  );
  /* ========================================
     19. HORÁRIOS SEMANAIS
  ======================================== */
  function makeWeeklyTimeSelect(className, currentTime) {
    const select = document.createElement("select");
    select.className = className;
    select.setAttribute("aria-label", className === "weekly-start" ? "Horário de abertura" : "Horário de encerramento");
    for (let total = 7 * 60; total <= 20 * 60; total += 30) {
      const value = timeString(total);
      select.add(new Option(value, value));
    }
    // Mantém um horário antigo fora da grade até o usuário escolher outro.
    if (validTime(currentTime) && ![...select.options].some(option => option.value === currentTime)) {
      select.add(new Option(`${currentTime} (horário atual)`, currentTime), 0);
    }
    select.value = currentTime;
    if (!select.value) select.value = className === "weekly-start" ? "07:00" : "20:00";
    // A seleção continua guardada no select para o formulário existente.
    // O controle visível usa um menu próprio para manter as cores da marca.
    select.classList.add("lume-time-native-value");
    const wrap = document.createElement("div");
    wrap.className = "lume-time-control";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "lume-time-trigger";
    trigger.textContent = select.value;
    trigger.setAttribute("aria-label", select.getAttribute("aria-label"));
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div");
    menu.className = "lume-time-menu";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", select.getAttribute("aria-label"));
    menu.hidden = true;
    for (const option of select.options) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "lume-time-option";
      item.textContent = option.textContent;
      item.dataset.value = option.value;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === select.value));
      item.addEventListener("click", () => {
        select.value = item.dataset.value;
        select.dispatchEvent(new Event("change", {bubbles:true}));
        trigger.textContent = select.value;
        for (const other of menu.children) {
          other.setAttribute("aria-selected", String(other.dataset.value === select.value));
        }
        closeMenu();
        trigger.focus();
      });
      menu.appendChild(item);
    }
    function closeMenu() {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      wrap.classList.remove("is-open");
    }
    trigger.addEventListener("click", () => {
      const shouldOpen = menu.hidden;
      document.querySelectorAll(".lume-time-menu").forEach(other => {
        other.hidden = true;
        other.closest(".lume-time-control")?.classList.remove("is-open");
        other.closest(".lume-time-control")?.querySelector(".lume-time-trigger")?.setAttribute("aria-expanded", "false");
      });
      if (shouldOpen) {
        menu.hidden = false;
        wrap.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
        const selected = [...menu.children].find(item => item.dataset.value === select.value);
        selected?.scrollIntoView({block:"nearest"});
      }
    });
    trigger.addEventListener("keydown", event => {
      if (event.key === "Escape") closeMenu();
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        if (menu.hidden) {
          event.preventDefault();
          trigger.click();
        }
      }
    });
    menu.addEventListener("keydown", event => {
      if (event.key === "Escape") { closeMenu(); trigger.focus(); }
    });
    document.addEventListener("click", event => {
      if (!wrap.contains(event.target)) closeMenu();
    });
    wrap.append(select, trigger, menu);
    return wrap;
  }

  function renderWeeklyHours() {
    const list = $("weekly-hours-list");
    if (!list) return;
    list.replaceChildren();
    weekdayOrder.forEach(dayNumber => {
      const config = state.weekly.find(
        day => day.day === dayNumber
      );
      if (!config) return;
      const row = element(
        "div",
        "dashboard-weekly-row dashboard-weekday-row"
      );
      row.dataset.day = String(dayNumber);
      const openLabel = element(
        "label",
        "dashboard-field dashboard-weekday-open-label"
      );
      const title = element(
        "span",
        "",
        weekdayNames[dayNumber]
      );
      const checkbox = document.createElement(
        "input"
      );
      checkbox.type = "checkbox";
      checkbox.className = "weekly-open dashboard-weekday-checkbox";
      checkbox.checked = Boolean(config.open);
      title.className = "dashboard-weekday-name";
      openLabel.append(title, checkbox);
      const startLabel = element(
        "label",
        "dashboard-field"
      );
      startLabel.appendChild(
        element("span", "", "Abertura")
      );
      const start = makeWeeklyTimeSelect("weekly-start", config.start);
      startLabel.appendChild(start);
      const endLabel = element(
        "label",
        "dashboard-field"
      );
      endLabel.appendChild(
        element("span", "", "Encerramento")
      );
      const end = makeWeeklyTimeSelect("weekly-end", config.end);
      endLabel.appendChild(end);
      checkbox.addEventListener("change", () => {
        row.classList.toggle("is-closed", !checkbox.checked);
      });
      row.classList.toggle("is-closed", !checkbox.checked);
      if (!checkbox.checked) title.textContent = `${weekdayNames[dayNumber]} · Fechado`;
      checkbox.addEventListener("change", () => { title.textContent = checkbox.checked ? weekdayNames[dayNumber] : `${weekdayNames[dayNumber]} · Fechado`; });
      row.append(
        openLabel,
        startLabel,
        endLabel
      );
      list.appendChild(row);
    });
  }
  $("weekly-hours-form")?.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      showError("weekly-hours-error", "");
      const weekly = [];
      document.querySelectorAll(
        "#weekly-hours-list [data-day]"
      ).forEach(row => {
        weekly.push({
          day: Number(row.dataset.day),
          open: row.querySelector(
            ".weekly-open"
          ).checked,
          start: row.querySelector(
            ".weekly-start"
          ).value,
          end: row.querySelector(
            ".weekly-end"
          ).value
        });
      });
      if (weekly.length !== 7) {
        showError(
          "weekly-hours-error",
          "Não foi possível ler os sete dias."
        );
        return;
      }
      for (const day of weekly) {
        if (!day.open) continue;
        if (
          !validTime(day.start) ||
          !validTime(day.end) ||
          minutes(day.start) >= minutes(day.end)
        ) {
          showError(
            "weekly-hours-error",
            `Confira os horários de ${weekdayNames[day.day]}.`
          );
          return;
        }
      }
      /*
        Impede salvar horários que deixariam
        agendamentos ativos fora do expediente.
      */
      const activeBookings = state.bookings.filter(
        occupiesTime
      );
      for (const booking of activeBookings) {
        const day = weekly.find(
          item => (
            item.day === dateFromKey(
              booking.date
            ).getDay()
          )
        );
        if (
          !day ||
          !day.open ||
          minutes(booking.start) <
            minutes(day.start) ||
          bookingEnd(booking) >
            minutes(day.end)
        ) {
          showError(
            "weekly-hours-error",
            "Existem agendamentos ativos incompatíveis " +
            "com os novos horários. Ajuste-os primeiro."
          );
          return;
        }
      }
      state.weekly = weekly;
      if (!save()) return;
      showError("weekly-hours-error", "");
      renderAll();
      showToast("Horários semanais atualizados.");
    }
  );
  /* ========================================
     20. RESTAURAR DEMONSTRAÇÃO
  ======================================== */
  $("demo-reset-button")?.addEventListener(
    "click",
    () => {
      askConfirmation("Restaurar demonstração?", "Todos os dados fictícios desta sessão voltarão ao estado original. Esta ação não poderá ser desfeita.", "Restaurar dados", async () => {
        try {
          await demo.resetAsync();
          window.location.reload();
        } catch (error) {
          showToast("Não foi possível restaurar: " + error.message);
        }
      });
    }
  );
  function enhanceSelectWithOrangeMenu(selectId) {
    const select = $(selectId);
    if (!select || select.dataset.orangeMenu) return;
    select.dataset.orangeMenu = "true";
    select.classList.add("lume-enhanced-native-select");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "lume-enhanced-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", select.getAttribute("aria-label") || selectId);
    select.after(trigger);
    let menu;
    function refresh() { trigger.textContent = select.selectedOptions[0]?.textContent || "Selecione"; }
    function close() {
      menu?.remove(); menu = null;
      trigger.setAttribute("aria-expanded", "false");
    }
    select.addEventListener("change", refresh);
    trigger.addEventListener("click", () => {
      if (menu) { close(); return; }
      const r = trigger.getBoundingClientRect();
      menu = element("div", "lume-enhanced-menu");
      menu.setAttribute("role", "listbox");
      menu.style.position = "fixed";
      menu.style.left = `${r.left}px`;
      menu.style.top = `${r.bottom + 4}px`;
      menu.style.width = `${r.width}px`;
      menu.style.maxHeight = `${Math.max(100, Math.min(260, window.innerHeight - r.bottom - 12))}px`;
      for (const option of select.options) {
        const opt = button(option.textContent, "lume-enhanced-option", () => {
          select.value = option.value;
          select.dispatchEvent(new Event("change", {bubbles:true}));
          close(); trigger.focus();
        });
        opt.setAttribute("role", "option");
        opt.setAttribute("aria-selected", String(select.value === option.value));
        menu.appendChild(opt);
      }
      document.body.appendChild(menu);
      trigger.setAttribute("aria-expanded", "true");
    });
    document.addEventListener("pointerdown", event => {
      if (menu && !menu.contains(event.target) && !trigger.contains(event.target)) close();
    });
    trigger.addEventListener("keydown", event => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowDown") { event.preventDefault(); if (!menu) trigger.click(); }
    });
    window.addEventListener("resize", close);
    // A rolagem do próprio menu não deve fechá-lo.
    window.addEventListener("scroll", event => {
      if (!menu) return;
      if (event.target === menu || menu.contains(event.target)) return;
      close();
    }, true);
    refresh();
  }
  function setupRemainingControls() {
    ["manual-service", "manual-time", "manual-status", "service-duration", "service-edit-duration", "settings-capacity", "settings-interval", "reschedule-time"]
      .forEach(enhanceSelectWithOrangeMenu);
    installServiceSummary();
    installPhoneMask();
    ["service-duration", "service-edit-duration"].forEach(id => {
      const select = $(id);
      if (!select) return;
      const previous = select.value;
      select.replaceChildren(new Option("Selecione a duração", ""));
      for (let n = 30; n <= 720; n += 30) select.add(new Option(durationString(n), String(n)));
      if (previous) select.value = previous;
      select.dispatchEvent(new Event("change"));
    });
    ["service-price", "service-edit-price"].forEach(id => {
      const input = $(id);
      if (!input) return;
      input.setAttribute("inputmode", "numeric");
      input.addEventListener("input", () => {
        const digits = input.value.replace(/\D/g, "").slice(0, 11);
        input.value = digits ? (Number(digits) / 100).toLocaleString("pt-BR", {minimumFractionDigits:2,maximumFractionDigits:2}) : "";
      });
    });
    const resetCard = $("demo-reset-button")?.closest(".dashboard-card") || $("demo-reset-button")?.parentElement;
    resetCard?.classList.add("lume-reset-card");
  }
  /* ========================================
     21. ATUALIZAÇÃO GERAL
  ======================================== */
  function renderAll() {
    updateStatistics();
    renderOverview();
    renderNotifications();
    renderCalendar();
    renderDayBookings();
    renderBlocks();
    renderRequests();
    renderServices();
    populateManualServices();
    updateManualTimes();
    if (activeView === "settings") {
      populateSettings();
    }
  }
  /* ========================================
     22. SINCRONIZAÇÃO ENTRE ABAS
  ======================================== */
  window.addEventListener(
    "storage",
    event => {
      if (event.key !== demo.KEY) {
        return;
      }
      refreshState();
      renderAll();
      showToast(
        "A demonstração foi atualizada em outra aba."
      );
    }
  );
  /* ========================================
     23. PREPARAÇÃO INICIAL
  ======================================== */
  window.addEventListener("lume-demo-sync-error", event => {
    showToast(event.detail.message);
    refreshState();
    renderAll();
  });
  setupRemainingControls();
  initializeDemoBookings();
  if ($("manual-date")) {
    $("manual-date").min = dateKey(today());
  }
  if ($("block-date")) {
    $("block-date").min = dateKey(today());
  }
  updateBlockType();
  renderAll();
  showView("overview");
  console.info(
    "Lume Agenda: dashboard demonstrativo iniciado."
  );
});