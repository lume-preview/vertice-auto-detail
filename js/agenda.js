
/* ==========================================
   LUME AGENDA UNIVERSAL
   VÉRTICE AUTO DETAIL

   ARQUIVO: js/agenda.js

   AGENDAMENTO PÚBLICO DEMONSTRATIVO

   - Serviços configuráveis
   - Horários semanais
   - Dias fechados
   - Bloqueios
   - Capacidade simultânea
   - Duração dos serviços
   - Agendamentos fictícios
   - Estado isolado por navegador
   - Sem gravação no Cloudflare D1
========================================== */

document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  /* ========================================
     1. ELEMENTOS E ESTADO
  ======================================== */

  const $ = id => document.getElementById(id);

  const demo = window.LumeDemo;
  const form = $("agenda-form");

  if (!form || !demo) {
    console.error(
      "Lume Agenda: formulário ou demo-state.js não encontrado."
    );
    return;
  }

  const serviceGrid = $("agenda-service-grid");
  const calendarDays = $("agenda-calendar-days");
  const hoursGrid = $("agenda-hours-grid");

  const phoneInput = $("agenda-phone");
  function formatBrazilPhone(value) {
    const digits = String(value).replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : "";
    const ddd = digits.slice(0, 2);
    const local = digits.slice(2);
    const prefixLen = digits.length > 10 ? 5 : 4;
    const prefix = local.slice(0, prefixLen);
    const suffix = local.slice(prefixLen);
    return `(${ddd}) ${prefix}${suffix ? `-${suffix}` : ""}`;
  }
  if (phoneInput) {
    phoneInput.setAttribute("inputmode", "tel");
    phoneInput.setAttribute("autocomplete", "tel");
    phoneInput.addEventListener("input", () => {
      phoneInput.value = formatBrazilPhone(phoneInput.value);
    });
  }

  function ensureDateChoiceSummary() {
    let node = $("agenda-date-choice-summary");
    if (node) return node;
    node = document.createElement("div");
    node.id = "agenda-date-choice-summary";
    node.className = "agenda-choice-summary";
    node.setAttribute("aria-live", "polite");
    const hoursContainer = hoursGrid.parentElement;
    hoursContainer.appendChild(node);
    return node;
  }

  function updateDateChoiceSummary() {
    const node = ensureDateChoiceSummary();
    node.replaceChildren();
    if (!selectedService || !selectedDate || !selectedHour) {
      node.hidden = true;
      return;
    }
    node.hidden = false;
    const label = document.createElement("strong");
    label.textContent = "Sua escolha";
    const content = document.createElement("p");
    content.textContent = `${selectedService.name} · ${dateFormat.format(selectedDate)} · ${selectedHour} às ${timeString(minutes(selectedHour) + Number(selectedService.duration))} · ${durationString(selectedService.duration)}`;
    node.append(label, content);
  }


  await demo.ready();
  let state = demo.getState();

  let selectedService = null;
  let selectedDate = null;
  let selectedHour = null;
  let currentStep = 1;

  const now = new Date();

  let visibleMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  /* ========================================
     2. UTILITÁRIOS
  ======================================== */

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
    const [year, month, day] = key
      .split("-")
      .map(Number);

    return new Date(year, month - 1, day);
  }

  function minutes(time) {
    const [hours, mins] = time
      .split(":")
      .map(Number);

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

  function durationString(value) {
    const hours = Math.floor(value / 60);
    const mins = value % 60;

    if (!hours) return `${mins} minutos`;

    if (!mins) {
      return hours === 1
        ? "1 hora"
        : `${hours} horas`;
    }

    return `${hours}h ${mins}min`;
  }

  const dateFormat = new Intl.DateTimeFormat(
    "pt-BR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  );

  const monthFormat = new Intl.DateTimeFormat(
    "pt-BR",
    {
      month: "long",
      year: "numeric"
    }
  );

  function showError(step, message) {
    const node = $(`agenda-error-${step}`);

    if (!node) return;

    node.textContent = message;
    node.hidden = !message;
  }

  function showCurrentStep() {
    [1, 2, 3].forEach(number => {
      const panel = $(`agenda-step-${number}`);

      panel.hidden = number !== currentStep;

      showError(number, "");
    });

    const progress = $("agenda-progress");

    Array.from(progress.children).forEach(
      (item, index) => {
        const active = index === currentStep - 1;

        item.classList.toggle(
          "is-active",
          active
        );

        item.classList.toggle(
          "is-done",
          index < currentStep - 1
        );

        if (active) {
          item.setAttribute(
            "aria-current",
            "step"
          );
        } else {
          item.removeAttribute("aria-current");
        }
      }
    );
  }

  function changeStep(number) {
    currentStep = number;

    showCurrentStep();

    // Em telas pequenas, mantém a próxima etapa visível sem rolagem manual.
    if (window.matchMedia("(max-width: 600px)").matches) {
      requestAnimationFrame(() => {
        const shell = $("agenda-shell");
        if (shell) {
          const targetTop = shell.getBoundingClientRect().top + window.scrollY - 14;
          window.scrollTo({
            top: Math.max(0, targetTop),
            left: 0,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant" : "smooth"
          });
        }
      });
    }

    if (number === 2) {
      renderCalendar();
      renderHours();
    }

    if (number === 3) {
      renderSummary();
    }

    const legend = $(`agenda-step-${number}`)
      .querySelector(".agenda-step-title");

    if (legend) {
      legend.setAttribute("tabindex", "-1");
      legend.focus({ preventScroll: true });
    }
  }

  /* ========================================
     3. SERVIÇOS
  ======================================== */

  function activeServices() {
    return state.services.filter(
      service => service.active
    );
  }

  function findService(id) {
    return activeServices().find(
      service => service.id === id
    );
  }

  function selectService(id) {
    const found = findService(id);

    if (!found) return;

    if (
      !selectedService ||
      selectedService.id !== found.id
    ) {
      selectedHour = null;
    }

    selectedService = found;

    serviceGrid.querySelectorAll(
      ".agenda-service-option"
    ).forEach(button => {
      const active = button.dataset.id === id;

      button.classList.toggle(
        "is-selected",
        active
      );

      button.setAttribute(
        "aria-checked",
        String(active)
      );
    });

    showError(1, "");
  }

  function renderServices() {
    serviceGrid.replaceChildren();

    const services = activeServices();

    if (!services.length) {
      const message = document.createElement("p");

      message.textContent =
        "Nenhum serviço disponível nesta demonstração.";

      serviceGrid.appendChild(message);
      return;
    }

    services.forEach(service => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "agenda-service-option";
      button.dataset.id = service.id;

      button.setAttribute("role", "radio");
      button.setAttribute(
        "aria-checked",
        String(selectedService?.id === service.id)
      );

      button.classList.toggle(
        "is-selected",
        selectedService?.id === service.id
      );

      const indicator = document.createElement("span");
      indicator.className = "agenda-service-radio";
      indicator.setAttribute("aria-hidden", "true");

      const description = document.createElement("span");
      description.className = "agenda-service-text";

      const name = document.createElement("strong");
      name.textContent = service.name;

      const duration = document.createElement("small");
      duration.textContent =
        `Duração: ${durationString(service.duration)}`;

      description.append(name, duration);

      const price = document.createElement("span");
      price.className = "agenda-service-price";
      price.textContent = money(service.price);

      button.append(
        indicator,
        description,
        price
      );

      button.addEventListener("click", () => {
        selectService(service.id);
      });

      serviceGrid.appendChild(button);
    });
  }

  /* ========================================
     4. CONFIGURAÇÃO DO DIA
  ======================================== */

  function daySettings(date) {
    return state.weekly.find(
      day => day.day === date.getDay()
    );
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && aEnd > bStart;
  }

  function occupiesTime(booking) {
    return ["pending", "confirmed"].includes(
      booking.status
    );
  }

  function isBlocked(key, begin, finish) {
    return state.blocks.some(block => {
      if (block.date !== key) return false;

      if (
        block.type === "day" ||
        block.is_full_day === 1
      ) {
        return true;
      }

      const start = block.start || block.starts_at;
      const end = block.end || block.ends_at;

      if (!start || !end) return false;

      return overlaps(
        begin,
        finish,
        minutes(start),
        minutes(end)
      );
    });
  }

  /* ========================================
     5. CAPACIDADE E DISPONIBILIDADE
  ======================================== */

  function canSchedule(date, start, duration) {
    if (!date || !start || !duration) {
      return false;
    }

    const day = daySettings(date);

    if (!day || !day.open) {
      return false;
    }

    const key = dateKey(date);

    if (key < dateKey(today())) {
      return false;
    }

    const begin = minutes(start);
    const finish = begin + duration;

    if (
      begin < minutes(day.start) ||
      finish > minutes(day.end)
    ) {
      return false;
    }

    if (key === dateKey(today())) {
      const current = new Date();

      const currentMinutes =
        current.getHours() * 60 +
        current.getMinutes();

      if (begin <= currentMinutes) {
        return false;
      }
    }

    if (isBlocked(key, begin, finish)) {
      return false;
    }

    const overlapping = state.bookings.filter(
      booking => {
        if (
          booking.date !== key ||
          !occupiesTime(booking)
        ) {
          return false;
        }

        const bookedStart = minutes(
          booking.start
        );

        const bookedEnd =
          bookedStart + Number(booking.duration);

        return overlaps(
          begin,
          finish,
          bookedStart,
          bookedEnd
        );
      }
    );

    const checkpoints = [begin, finish];

    overlapping.forEach(booking => {
      const bookedStart = minutes(booking.start);

      const bookedEnd =
        bookedStart + Number(booking.duration);

      checkpoints.push(
        Math.max(begin, bookedStart),
        Math.min(finish, bookedEnd)
      );
    });

    const points = [...new Set(checkpoints)]
      .sort((a, b) => a - b);

    const capacity = Math.max(
      1,
      Number(state.capacity) || 1
    );

    for (let i = 0; i < points.length - 1; i++) {
      const segmentStart = points[i];
      const segmentEnd = points[i + 1];

      const concurrent = overlapping.filter(
        booking => {
          const bookedStart = minutes(
            booking.start
          );

          const bookedEnd =
            bookedStart + Number(booking.duration);

          return overlaps(
            segmentStart,
            segmentEnd,
            bookedStart,
            bookedEnd
          );
        }
      ).length;

      if (concurrent >= capacity) {
        return false;
      }
    }

    return true;
  }

  function availableHours(date, service) {
    if (!date || !service) return [];

    const day = daySettings(date);

    if (!day || !day.open) return [];

    const opening = minutes(day.start);
    const closing = minutes(day.end);

    const interval = Math.max(
      1,
      Number(state.interval) || 60
    );

    const results = [];

    for (
      let begin = opening;
      begin + service.duration <= closing;
      begin += interval
    ) {
      const start = timeString(begin);

      if (
        canSchedule(
          date,
          start,
          service.duration
        )
      ) {
        results.push(start);
      }
    }

    return results;
  }

  /* ========================================
     6. CALENDÁRIO
  ======================================== */

  function renderCalendar() {
    const first = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1
    );

    $("agenda-month-label").textContent =
      monthFormat.format(first);

    const currentMonth = new Date(
      today().getFullYear(),
      today().getMonth(),
      1
    );

    $("agenda-month-prev").disabled =
      first <= currentMonth;

    calendarDays.replaceChildren();

    for (let i = 0; i < first.getDay(); i++) {
      const blank = document.createElement("span");
      blank.className = "agenda-calendar-blank";

      calendarDays.appendChild(blank);
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

      const button = document.createElement("button");

      button.type = "button";
      button.className = "agenda-calendar-day";
      button.textContent = String(day);

      button.setAttribute(
        "aria-label",
        dateFormat.format(date)
      );

      const dayConfig = daySettings(date);

      const unavailable =
        date < today() ||
        !dayConfig?.open ||
        !selectedService ||
        availableHours(date, selectedService).length === 0;

      button.disabled = unavailable;
      const isPast = date < today();
      const isClosed = !dayConfig?.open;
      const dateHours = selectedService && !isPast && !isClosed
        ? availableHours(date, selectedService) : [];
      const isFull = !isPast && !isClosed && selectedService && dateHours.length === 0;
      button.classList.toggle("is-unavailable-past", isPast);
      button.classList.toggle("is-unavailable-closed", isClosed && !isPast);
      button.classList.toggle("is-unavailable-full", Boolean(isFull));
      if (isPast) button.title = "Data anterior a hoje";
      else if (isClosed) button.title = "Estabelecimento fechado";
      else if (isFull) button.title = "Sem horários disponíveis";
      else button.title = "Horários disponíveis";

      const isSelected =
        selectedDate &&
        dateKey(selectedDate) === dateKey(date);

      button.classList.toggle(
        "is-selected",
        Boolean(isSelected)
      );

      button.setAttribute(
        "aria-pressed",
        String(Boolean(isSelected))
      );

      button.addEventListener("click", () => {
        // Valida novamente a disponibilidade antes de aceitar uma data.
        state = demo.getState();
        if (!selectedService || availableHours(date, selectedService).length === 0) {
          selectedDate = null;
          selectedHour = null;
          renderCalendar();
          renderHours();
          showError(2, "Esta data não possui horários disponíveis. Selecione outro dia.");
          return;
        }
        selectedDate = date;
        selectedHour = null;

        renderCalendar();
        renderHours();
        showError(2, "");
      });

      calendarDays.appendChild(button);
    }
  }

  /* ========================================
     7. HORÁRIOS
  ======================================== */

  function renderHours() {
    hoursGrid.replaceChildren();
    updateDateChoiceSummary();

    const intro = $("agenda-hours-intro");

    if (!selectedDate) {
      intro.textContent =
        "Selecione uma data no calendário.";
      return;
    }

    if (!selectedService) {
      intro.textContent =
        "Selecione um serviço primeiro.";
      return;
    }

    const hours = availableHours(
      selectedDate,
      selectedService
    );

    if (!hours.length) {
      intro.textContent =
        "Não há horários disponíveis para " +
        dateFormat.format(selectedDate) +
        ". Selecione outra data.";

      return;
    }

    intro.textContent =
      "Horários demonstrativos para " +
      dateFormat.format(selectedDate) +
      ".";

    hours.forEach(hour => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "agenda-hour";
      button.textContent = hour;

      const isSelected = selectedHour === hour;

      button.classList.toggle(
        "is-selected",
        isSelected
      );

      button.setAttribute(
        "aria-pressed",
        String(isSelected)
      );

      button.addEventListener("click", () => {
        selectedHour = hour;

        renderHours();
        showError(2, "");
      });

      hoursGrid.appendChild(button);
    });
    updateDateChoiceSummary();
  }

  /* ========================================
     8. NAVEGAÇÃO
  ======================================== */

  $("agenda-month-prev").addEventListener(
    "click",
    () => {
      visibleMonth = new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth() - 1,
        1
      );

      selectedDate = null;
      selectedHour = null;

      renderCalendar();
      renderHours();
    }
  );

  $("agenda-month-next").addEventListener(
    "click",
    () => {
      visibleMonth = new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth() + 1,
        1
      );

      selectedDate = null;
      selectedHour = null;

      renderCalendar();
      renderHours();
    }
  );

  $("agenda-next-1").addEventListener(
    "click",
    () => {
      if (!selectedService) {
        showError(
          1,
          "Escolha um serviço para continuar."
        );
        return;
      }

      changeStep(2);
    }
  );

  $("agenda-back-2").addEventListener(
    "click",
    () => changeStep(1)
  );

  $("agenda-next-2").addEventListener(
    "click",
    () => {
      if (!selectedDate || !selectedHour) {
        showError(
          2,
          "Selecione uma data e um horário para continuar."
        );
        return;
      }

      state = demo.getState();

      if (
        !availableHours(
          selectedDate,
          selectedService
        ).includes(selectedHour)
      ) {
        selectedHour = null;

        renderCalendar();
        renderHours();

        showError(
          2,
          "Este horário não está mais disponível."
        );

        return;
      }

      changeStep(3);
    }
  );

  $("agenda-back-3").addEventListener(
    "click",
    () => changeStep(2)
  );

  /* ========================================
     9. RESUMO
  ======================================== */

  function addSummaryRow(parent, label, value) {
    const row = document.createElement("div");
    row.className = "agenda-summary-row";
    if (["Horário", "Valor inicial"].includes(label)) {
      row.classList.add("is-highlighted");
    }

    const term = document.createElement("dt");
    term.textContent = label;

    const description = document.createElement("dd");
    description.textContent = value;

    row.append(term, description);
    parent.appendChild(row);
  }

  function renderSummary() {
    const list = $("agenda-summary-list");

    list.replaceChildren();

    addSummaryRow(
      list,
      "Serviço",
      selectedService?.name || "—"
    );

    addSummaryRow(
      list,
      "Data",
      selectedDate
        ? dateFormat.format(selectedDate)
        : "—"
    );

    addSummaryRow(
      list,
      "Horário",
      selectedHour || "—"
    );

    addSummaryRow(
      list,
      "Duração",
      selectedService
        ? durationString(selectedService.duration)
        : "—"
    );

    const end =
      selectedHour && selectedService
        ? minutes(selectedHour) +
          selectedService.duration
        : null;

    addSummaryRow(
      list,
      "Término previsto",
      end === null ? "—" : timeString(end)
    );

    addSummaryRow(
      list,
      "Valor inicial",
      selectedService
        ? money(selectedService.price)
        : "—"
    );
  }

  /* ========================================
     10. CONCLUSÃO DEMONSTRATIVA
  ======================================== */

  function validPhone(value) {
    const digits = value.replace(/\D/g, "");

    return (
      digits.length === 10 ||
      digits.length === 11
    );
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const name = $("agenda-name");
    const phone = $("agenda-phone");
    const vehicle = $("agenda-vehicle");
    const consent = $("agenda-consent");

    if (name.value.trim().length < 2) {
      showError(3, "Informe um nome fictício.");
      name.focus();
      return;
    }

    if (!validPhone(phone.value)) {
      showError(
        3,
        "Informe um telefone fictício com DDD."
      );

      phone.focus();
      return;
    }

    if (vehicle.value.trim().length < 2) {
      showError(3, "Informe um veículo.");
      vehicle.focus();
      return;
    }

    if (!consent.checked) {
      showError(
        3,
        "Confirme que esta é uma demonstração."
      );

      consent.focus();
      return;
    }

    state = demo.getState();

    const service = findService(
      selectedService?.id
    );

    if (
      !service ||
      !selectedDate ||
      !selectedHour ||
      !availableHours(
        selectedDate,
        service
      ).includes(selectedHour)
    ) {
      changeStep(2);

      showError(
        2,
        "O horário selecionado não está mais disponível."
      );

      return;
    }

    const ids = state.bookings.map(
      booking => Number(booking.id) || 0
    );

    const nextId = Math.max(
      1006,
      ...ids
    ) + 1;

    /*
      Não guardamos o nome, telefone,
      veículo ou observações digitados.

      Apenas um agendamento fictício
      é compartilhado com o dashboard.
    */

    state.bookings.push({
      id: nextId,
      name: "Cliente demonstrativo",
      phone: "00000000000",
      vehicle: "Veículo demonstrativo",
      serviceId: service.id,
      date: dateKey(selectedDate),
      start: selectedHour,
      duration: service.duration,
      price: service.price,
      status: "pending",
      origin: "site",
      notes: "",
      demoPublic: true
    });

    try {
      await demo.saveStateAsync(state);
    } catch (error) {
      showError(3, "Não foi possível salvar o agendamento: " + error.message);
      return;
    }

    showError(3, "");

    form.hidden = true;
    $("agenda-shell")?.classList.add("is-complete");
    $("agenda-progress").hidden = true;
    $("agenda-success").hidden = false;

    const summaryBox = $(
      "agenda-success-summary"
    );

    summaryBox.replaceChildren();

    const list = document.createElement("dl");

    addSummaryRow(
      list,
      "Serviço",
      service.name
    );

    addSummaryRow(
      list,
      "Data",
      dateFormat.format(selectedDate)
    );

    addSummaryRow(
      list,
      "Horário",
      selectedHour
    );

    addSummaryRow(
      list,
      "Término previsto",
      timeString(
        minutes(selectedHour) + service.duration
      )
    );

    addSummaryRow(
      list,
      "Duração",
      durationString(service.duration)
    );

    addSummaryRow(
      list,
      "Valor inicial",
      money(service.price)
    );

    summaryBox.appendChild(list);

    const heading = $("agenda-success")
      .querySelector("h2");

    heading.setAttribute("tabindex", "-1");

    heading.focus({
      preventScroll: true
    });
  });

  /* ========================================
     11. NOVA SIMULAÇÃO
  ======================================== */

  $("agenda-restart").addEventListener(
    "click",
    () => {
      form.reset();
      form.hidden = false;
      $("agenda-shell")?.classList.remove("is-complete");

      $("agenda-progress").hidden = false;
      $("agenda-success").hidden = true;

      selectedService = null;
      selectedDate = null;
      selectedHour = null;

      state = demo.getState();

      visibleMonth = new Date(
        today().getFullYear(),
        today().getMonth(),
        1
      );

      renderServices();
      updateDateChoiceSummary();
      changeStep(1);
    }
  );

  /* ========================================
     12. SINCRONIZAÇÃO ENTRE ABAS
  ======================================== */

  window.addEventListener("storage", event => {
    if (event.key !== demo.KEY) {
      return;
    }

    state = demo.getState();

    if (
      selectedService &&
      !findService(selectedService.id)
    ) {
      selectedService = null;
      selectedHour = null;
    } else if (selectedService) {
      selectedService = findService(
        selectedService.id
      );
    }

    renderServices();

    if (currentStep === 2) {
      renderCalendar();
      renderHours();
    }

    if (currentStep === 3) {
      renderSummary();
    }
  });

  /* ========================================
     13. INICIALIZAÇÃO
  ======================================== */

  renderServices();

  const params = new URLSearchParams(
    window.location.search
  );

  const serviceFromUrl = params.get("servico");

  if (serviceFromUrl) {
    selectService(serviceFromUrl);
  }

  showCurrentStep();
});