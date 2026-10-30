
/* VÉRTICE AUTO DETAIL — LUME | MENU E GALERIA, INTERVALO 2s */

document.addEventListener('DOMContentLoaded', () => {
  /* CABEÇALHO E MENU RESPONSIVO */
  const header = document.getElementById('header');
  const menu = document.getElementById('menu');
  const menuToggle = document.getElementById('menu-toggle');

  function atualizarHeader() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 40);
  }

  atualizarHeader();
  window.addEventListener('scroll', atualizarHeader, {passive: true});

  function fecharMenu() {
    if (!menu || !menuToggle) return;
    menu.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Abrir menu');
  }

  if (menu && menuToggle) {
    menuToggle.addEventListener('click', () => {
      const aberto = menu.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(aberto));
      menuToggle.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    });

    menu.querySelectorAll('a').forEach(link =>
      link.addEventListener('click', fecharMenu)
    );

    document.addEventListener('click', event => {
      if (
        menu.classList.contains('open') &&
        header &&
        !header.contains(event.target)
      ) fecharMenu();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') fecharMenu();
    });

    const desktopQuery = window.matchMedia('(min-width: 1101px)');
    const conferirTela = event => {
      if (event.matches) fecharMenu();
    };

    if (desktopQuery.addEventListener) {
      desktopQuery.addEventListener('change', conferirTela);
    } else {
      desktopQuery.addListener(conferirTela);
    }

    const links = menu.querySelectorAll('.nav-link');
    links.forEach(link => link.addEventListener('click', () => {
      links.forEach(item => item.classList.remove('active'));
      link.classList.add('active');
    }));
  }

  /* GALERIA: LOOP INFINITO */
  const viewport = document.getElementById('gallery-viewport');
  const track = document.getElementById('gallery-track');

  if (!viewport || !track) return;

  const prevButton = document.getElementById('gallery-prev');
  const nextButton = document.getElementById('gallery-next');
  const dots = Array.from(
    document.querySelectorAll('#gallery-dots .gallery-dot')
  );

  const playToggle = document.getElementById('gallery-play-toggle');
  const playIcon = document.getElementById('gallery-play-icon');
  const playText = document.getElementById('gallery-play-text');
  const originais = Array.from(track.querySelectorAll('.gallery-slide'));
  const total = originais.length;

  if (!total) return;

  const INTERVALO = 2000;
  const DURACAO = 650;
  const SEGURANCA = 850;

  const movimentoReduzido = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );

  let indice = total;
  let automatico = null;
  let seguranca = null;
  let emTransicao = false;
  let reproduzindo = !movimentoReduzido.matches;
  let mouseSobre = false;
  let tocando = false;
  let lightboxAberto = false;
  let indiceLightbox = 0;
  let focoAnterior = null;
  let toqueInicial = null;
  let ignorarClique = false;

  function clonar(slide) {
    const clone = slide.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');

    clone.querySelectorAll('button,a').forEach(elemento => {
      elemento.tabIndex = -1;
    });

    return clone;
  }

  const antes = document.createDocumentFragment();
  const depois = document.createDocumentFragment();

  originais.forEach(slide => {
    antes.appendChild(clonar(slide));
    depois.appendChild(clonar(slide));
  });

  track.prepend(antes);
  track.appendChild(depois);

  const slides = Array.from(track.querySelectorAll('.gallery-slide'));

  const indiceReal = () => ((indice % total) + total) % total;

  function atualizarIndicadores() {
    const atual = indiceReal();

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === atual);

      if (i === atual) {
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.removeAttribute('aria-current');
      }
    });
  }

  function posicionar(animar = true) {
    const slide = slides[indice];
    if (!slide) return;

    track.style.transition = animar
      ? `transform ${DURACAO}ms ease`
      : 'none';

    track.style.transform = `translate3d(-${slide.offsetLeft}px,0,0)`;
    atualizarIndicadores();
  }

  function limparSeguranca() {
    if (seguranca !== null) {
      clearTimeout(seguranca);
      seguranca = null;
    }
  }

  function finalizarTransicao() {
    if (!emTransicao) return;

    limparSeguranca();
    emTransicao = false;

    if (indice < total || indice >= total * 2) {
      indice = total + indiceReal();
      posicionar(false);
      void track.offsetWidth;
    }
  }

  function moverPara(novo) {
    if (
      emTransicao ||
      novo < 0 ||
      novo >= slides.length ||
      novo === indice
    ) return;

    emTransicao = true;
    indice = novo;
    posicionar(true);
    limparSeguranca();
    seguranca = setTimeout(finalizarTransicao, SEGURANCA);
  }

  track.addEventListener('transitionend', event => {
    if (
      event.target === track &&
      event.propertyName === 'transform'
    ) finalizarTransicao();
  });

  const avancar = () => moverPara(indice + 1);
  const voltar = () => moverPara(indice - 1);

  function limparAutomatico() {
    if (automatico !== null) {
      clearTimeout(automatico);
      automatico = null;
    }
  }

  function podeReproduzir() {
    return (
      reproduzindo &&
      !mouseSobre &&
      !tocando &&
      !lightboxAberto &&
      !document.hidden &&
      !movimentoReduzido.matches
    );
  }

  function iniciarAutomatico() {
    limparAutomatico();
    if (!podeReproduzir()) return;

    automatico = setTimeout(() => {
      automatico = null;

      if (!podeReproduzir()) return;

      if (!emTransicao) avancar();
      iniciarAutomatico();
    }, INTERVALO);
  }

  function atualizarBotao() {
    if (!playToggle) return;

    const pausado = !reproduzindo || movimentoReduzido.matches;

    playToggle.setAttribute('aria-pressed', String(pausado));
    playToggle.setAttribute(
      'aria-label',
      pausado ? 'Iniciar reprodução automática' : 'Pausar reprodução automática'
    );

    if (playIcon) playIcon.textContent = pausado ? '▶' : '❚❚';
    if (playText) playText.textContent = pausado ? 'Reproduzir' : 'Pausar';
  }

  if (playToggle) {
    playToggle.addEventListener('click', () => {
      reproduzindo = !reproduzindo;
      atualizarBotao();
      iniciarAutomatico();
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => {
      avancar();
      iniciarAutomatico();
    });
  }

  if (prevButton) {
    prevButton.addEventListener('click', () => {
      voltar();
      iniciarAutomatico();
    });
  }

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      if (!emTransicao) moverPara(total + i);
      iniciarAutomatico();
    });
  });

  viewport.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') {
      mouseSobre = true;
      limparAutomatico();
    }
  });

  viewport.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse') {
      mouseSobre = false;
      iniciarAutomatico();
    }
  });

  viewport.addEventListener('touchstart', event => {
    if (!event.changedTouches.length) return;

    toqueInicial = event.changedTouches[0].clientX;
    tocando = true;
    limparAutomatico();
  }, {passive: true});

  viewport.addEventListener('touchend', event => {
    if (toqueInicial !== null && event.changedTouches.length) {
      const diferenca = toqueInicial - event.changedTouches[0].clientX;

      if (Math.abs(diferenca) > 50) {
        ignorarClique = true;

        if (diferenca > 0) avancar();
        else voltar();

        setTimeout(() => ignorarClique = false, 350);
      }
    }

    toqueInicial = null;
    tocando = false;
    iniciarAutomatico();
  }, {passive: true});

  viewport.addEventListener('touchcancel', () => {
    toqueInicial = null;
    tocando = false;
    iniciarAutomatico();
  }, {passive: true});

  let largura = viewport.clientWidth;

  window.addEventListener('resize', () => {
    if (largura === viewport.clientWidth) return;

    largura = viewport.clientWidth;
    limparSeguranca();
    emTransicao = false;
    indice = total + indiceReal();
    posicionar(false);
    iniciarAutomatico();
  }, {passive: true});

  document.addEventListener('visibilitychange', iniciarAutomatico);

  function atualizarPreferencia() {
    if (movimentoReduzido.matches) {
      limparSeguranca();
      emTransicao = false;
      indice = total + indiceReal();
      posicionar(false);
    }

    atualizarBotao();
    iniciarAutomatico();
  }

  if (movimentoReduzido.addEventListener) {
    movimentoReduzido.addEventListener('change', atualizarPreferencia);
  } else {
    movimentoReduzido.addListener(atualizarPreferencia);
  }

  /* VISUALIZAÇÃO AMPLIADA */
  const lightbox = document.getElementById('gallery-lightbox');
  const lightboxImage = document.getElementById('lightbox-image');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxPrev = document.getElementById('lightbox-prev');
  const lightboxNext = document.getElementById('lightbox-next');

  function atualizarLightbox() {
    if (!lightboxImage || !lightboxCaption) return;

    const slide = originais[indiceLightbox];
    const imagem = slide.querySelector('img');
    const legenda = slide.querySelector('figcaption strong');

    if (!imagem) return;

    lightboxImage.src = imagem.src;
    lightboxImage.alt = imagem.alt;
    lightboxCaption.textContent = legenda
      ? legenda.textContent.trim()
      : '';
  }

  function abrirLightbox(i) {
    if (!lightbox) return;

    focoAnterior = document.activeElement;
    indiceLightbox = i;
    atualizarLightbox();

    lightbox.hidden = false;
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-open');
    lightboxAberto = true;
    limparAutomatico();

    if (lightboxClose) lightboxClose.focus();
  }

  function fecharLightbox() {
    if (!lightbox || lightbox.hidden) return;

    lightbox.hidden = true;
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-open');
    lightboxAberto = false;

    if (focoAnterior && typeof focoAnterior.focus === 'function') {
      focoAnterior.focus();
    }

    iniciarAutomatico();
  }

  track.addEventListener('click', event => {
    if (ignorarClique) return;

    const botao = event.target.closest('.gallery-image-button');
    if (!botao || !track.contains(botao)) return;

    const slide = botao.closest('.gallery-slide');
    const i = slides.indexOf(slide);

    if (i >= 0) abrirLightbox(i % total);
  });

  const proxima = () => {
    indiceLightbox = (indiceLightbox + 1) % total;
    atualizarLightbox();
  };

  const anterior = () => {
    indiceLightbox = (indiceLightbox - 1 + total) % total;
    atualizarLightbox();
  };

  if (lightboxClose) {
    lightboxClose.addEventListener('click', fecharLightbox);
  }

  if (lightboxNext) {
    lightboxNext.addEventListener('click', proxima);
  }

  if (lightboxPrev) {
    lightboxPrev.addEventListener('click', anterior);
  }

  if (lightbox) {
    lightbox.addEventListener('click', event => {
      if (event.target === lightbox) fecharLightbox();
    });

    lightbox.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        fecharLightbox();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        proxima();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        anterior();
      } else if (event.key === 'Tab') {
        const controles = Array.from(
          lightbox.querySelectorAll('button:not([disabled])')
        );

        const primeiro = controles[0];
        const ultimo = controles[controles.length - 1];

        if (
          event.shiftKey &&
          document.activeElement === primeiro
        ) {
          event.preventDefault();
          ultimo.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === ultimo
        ) {
          event.preventDefault();
          primeiro.focus();
        }
      }
    });
  }

  requestAnimationFrame(() => {
    posicionar(false);
    atualizarBotao();
    iniciarAutomatico();
  });
});


/* Setas do carrossel de serviços — somente mobile; gesto de arrastar permanece nativo. */
document.addEventListener('DOMContentLoaded', () => {
  const trilho = document.querySelector('.services-grid');
  const anterior = document.getElementById('services-prev');
  const proximo = document.getElementById('services-next');
  if (!trilho || !anterior || !proximo) return;
  const mobile = window.matchMedia('(max-width: 600px)');
  const cards = Array.from(trilho.querySelectorAll('.service-card'));
  function atualizarSetas() {
    if (!mobile.matches) return;
    const limite = Math.max(0, trilho.scrollWidth - trilho.clientWidth);
    anterior.disabled = trilho.scrollLeft <= 4;
    proximo.disabled = trilho.scrollLeft >= limite - 4;
  }
  function mover(direcao) {
    if (!mobile.matches || !cards.length) return;
    const atual = trilho.scrollLeft;
    const posicoes = cards.map(card => card.offsetLeft - cards[0].offsetLeft);
    let destino;
    if (direcao > 0) destino = posicoes.find(pos => pos > atual + 8);
    else destino = posicoes.slice().reverse().find(pos => pos < atual - 8);
    if (destino === undefined) destino = direcao > 0 ? trilho.scrollWidth : 0;
    trilho.scrollTo({left: destino, behavior: 'smooth'});
  }
  anterior.addEventListener('click', () => mover(-1));
  proximo.addEventListener('click', () => mover(1));
  trilho.addEventListener('scroll', atualizarSetas, {passive: true});
  window.addEventListener('resize', atualizarSetas, {passive: true});
  atualizarSetas();
});