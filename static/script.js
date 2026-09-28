const $ = s => document.querySelector(s);
const post = async (u, b) => {
  const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error((data && (data.error || data.detail)) || `Erro no servidor (código ${r.status})`);
  }
  return data;
};
const up = async (u, field, file) => { const f = new FormData(); f.append(field, file); return (await fetch(u, { method: "POST", body: f })).json(); };
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

const S = {
  vid: null, vid2: null, music: null, dur: 0, cuts: [], peaks: [], segs: [],
  tipo: "unica", hl: "bebas_impact", cap: "hormozi", pps: 20,
  framingY: 10, hlStart: 0, hlEnd: 0, hlPos: "topo",
  el: { cutSilence: 1, flash: 1, zoomCuts: 1, tracking: 0, zoomC: 0, music: 0 }
};

const TIPOS = [
  ["unica", "Tela única", "single"],
  ["dividida", "Tela dividida", "div1"],
  ["dividida2", "Tela dividida 2", "div2"]
];

const HL_TXT = "É ASSIM QUE VAI FICAR A HEADLINE";
const HLS = [
  ["bebas_impact", "Impact / Viral", `font-family:Impact,sans-serif;font-size:14px;color:#fff;letter-spacing:1px;text-transform:uppercase;text-shadow:0 0 3px #000`],
  ["neon_cyber", "Cyber Neon", `font-family:'Arial Black',sans-serif;font-weight:900;font-size:12px;color:#00d2b4;text-shadow:0 0 6px #00d2b4,0 0 12px rgba(0,210,180,0.5)`],
  ["contorno", "Contorno Branco", `font-family:'Arial Black',sans-serif;font-weight:900;font-size:12px;color:#fff;text-shadow:0 0 3px #000,0 0 5px #000`],
  ["caixa_preta", "Caixa Preta", `background:#000;color:#fff;font-weight:800;font-size:10px;padding:3px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:0.5px`],
  ["caixa_laranja", "Caixa Laranja", `background:#ff6a00;color:#fff;font-weight:800;font-size:11px;padding:3px 6px;border-radius:3px;text-transform:uppercase`],
  ["laranja_texto", "Texto Laranja", `font-family:'Arial Black',sans-serif;font-weight:900;font-size:12px;color:#ff6a00;text-shadow:0 0 3px #000`],
];

const CAPS = [
  ["hormozi", "Hormozi Viral", `<div class="anim-hormozi"><span>VIRAL</span><span>ESTILO</span><span>HORMOZI</span></div>`],
  ["karaoke_neon", "Karaokê Neon", `<div class="anim-karaoke-neon"><span>É</span><span>ASSIM</span><span>QUE</span><span>FICA</span></div>`],
  ["pop_destaque", "Pop Destaque", `<div class="anim-pop"><span>PALAVRA</span><span>POR</span><span>PALAVRA</span></div>`],
  ["destaque", "Destaque Branco", `<div class="anim-pulse">APARECER</div>`],
  ["karaoke", "Karaokê Laranja", `<div class="anim-karaoke-orange"><span>É</span><span>ASSIM</span><span>QUE</span></div>`],
  ["serif_luxo", "Serifada Luxo", `<div class="anim-shimmer" style="font-family:Georgia,serif;font-style:italic;font-size:11px;color:#fff">Elegância e Autoridade</div>`],
  ["clean_minimal", "Clean Minimal", `<div style="font-family:Arial,sans-serif;font-size:11px;color:#fff;letter-spacing:0.3px">Simplicidade direta</div>`],
  ["pequena", "Pequena Discreta", `<div style="font-family:Arial,sans-serif;font-size:9.5px;color:#94a3b8;font-weight:600">Discreta na base</div>`],
];

const ELS = [
  ["cutSilence", "Recortar respiros e silêncios", "✂"],
  ["flash", "Flash na transição", "⚡"],
  ["zoomCuts", "Zoom in e out nos cortes", "⎚"],
  ["tracking", "Movimento de tracking", "⛶"],
  ["zoomC", "Automação de zoom in contínuo", "🔍"],
  ["music", "Trilha sonora", "♫"],
];

function tab(name) {
  document.querySelectorAll(".pane").forEach(p => p.classList.toggle("on", p.id === "tab-" + name));
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
  const prevP = $("#previewPlayer"), pvP = $("#pv");
  if (name === "visual") {
    if (prevP && !prevP.paused) prevP.pause();
    if (prevP && pvP && !pvP.src && prevP.src) pvP.src = prevP.src;
    if (prevP && pvP && prevP.currentTime) pvP.currentTime = prevP.currentTime;
    drawTL();
  } else if (name === "corte") {
    if (pvP && !pvP.paused) pvP.pause();
    if (prevP && pvP && pvP.currentTime) prevP.currentTime = pvP.currentTime;
  }
}
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => tab(b.dataset.tab));

function drawOptions() {
  const checkSvg = `<svg viewBox="0 0 16 16"><path fill="#fff" d="M6.2 11.2L2.8 7.8l1.1-1.1 2.3 2.3 5.9-5.9 1.1 1.1z"/></svg>`;
  const mountainSvg = `<svg class="ico-landscape" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
  const avatarSvg = `<svg class="ico-speaker" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>`;
  const singleSvg = `<svg class="ico-landscape" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><polygon points="10 8 16 12 10 16 10 8"/></svg>`;

  // 1. TIPO DE EDIÇÃO
  $("#tipoC").innerHTML = TIPOS.map(([id, nome, layout]) => {
    const isSel = (S.tipo === id);
    const radio = `<div class="radio-badge ${isSel ? 'sel' : ''}">${checkSvg}</div>`;

    let innerPhone = "";
    if (layout === "div1") {
      innerPhone = `<div class="notch"></div><div class="half-top" style="background:#20140c">${mountainSvg}</div><div class="div-bar"></div><div class="half-bot" style="background:#11151f">${avatarSvg}</div>`;
    } else if (layout === "div2") {
      innerPhone = `<div class="notch"></div><div class="half-top" style="background:#11151f">${avatarSvg}</div><div class="div-bar"></div><div class="half-bot" style="background:#20140c">${mountainSvg}</div>`;
    } else {
      innerPhone = `<div class="notch"></div><div class="half-top" style="background:#11151f;flex:2">${singleSvg}</div>`;
    }

    return `
      <div class="opt-card ${isSel ? 'sel' : ''}" data-k="tipo" data-id="${id}">
        ${radio}
        <div class="phone-mockup">${innerPhone}</div>
        <span class="opt-card-label">${nome}</span>
      </div>
    `;
  }).join("");

  // 2. ESTILO DE HEADLINE
  $("#hlC").innerHTML = HLS.map(([id, , st]) => {
    const isSel = (S.hl === id);
    const radio = `<div class="radio-badge ${isSel ? 'sel' : ''}">${checkSvg}</div>`;
    return `
      <div class="opt-card ${isSel ? 'sel' : ''}" data-k="hl" data-id="${id}">
        ${radio}
        <span style="${st}">${HL_TXT}</span>
      </div>
    `;
  }).join("");

  // 3. ESTILO DE LEGENDA (Com preview animado em tempo real)
  $("#capC").innerHTML = CAPS.map(([id, nome, previewHtml]) => {
    const isSel = (S.cap === id);
    const radio = `<div class="radio-badge ${isSel ? 'sel' : ''}">${checkSvg}</div>`;
    return `
      <div class="opt-card ${isSel ? 'sel' : ''}" data-k="cap" data-id="${id}" title="${nome}">
        ${radio}
        <div class="cap-preview-box">${previewHtml}</div>
        <span class="cap-name-label">${nome}</span>
      </div>
    `;
  }).join("");

  // 4. ELEMENTOS DA EDIÇÃO (Pills ciano com checkbox)
  $("#elC").innerHTML = ELS.map(([id, nome, ico]) => {
    const isSel = !!S.el[id];
    return `
      <div class="cyan-pill ${isSel ? 'on' : ''}" data-el="${id}">
        <span class="chk-box">${checkSvg}</span>
        <span class="el-ico">${ico}</span>
        <span>${nome}</span>
      </div>
    `;
  }).join("");

  $("#split2").style.display = (S.tipo === "dividida" || S.tipo === "dividida2") ? "block" : "none";
  $("#musicBox").style.display = S.el.music ? "block" : "none";

  const nome = (l, id) => (l.find(x => x[0] === id) || [])[1];
  const ativos = ELS.filter(([id]) => S.el[id]).map(e => e[1].toLowerCase()).join(", ");
  $("#sum").textContent = `${nome(TIPOS, S.tipo)} · headline ${nome(HLS, S.hl).toLowerCase()} · legenda ${nome(CAPS, S.cap).toLowerCase()}${ativos ? " · " + ativos : ""}`;
}

document.addEventListener("click", e => {
  const o = e.target.closest(".opt-card"), p = e.target.closest(".cyan-pill");
  if (o) {
    S[o.dataset.k] = o.dataset.id;
    if (S.tipo !== "unica") S.el.tracking = 0;
    drawOptions();
  }
  if (p) {
    const k = p.dataset.el;
    if (k === "tracking" && S.tipo !== "unica") return alert("Tracking só funciona no modo de tela única.");
    S.el[k] = S.el[k] ? 0 : 1;
    if (k === "zoomC" && S.el.zoomC) S.el.zoomCuts = 0;
    if (k === "zoomCuts" && S.el.zoomCuts) S.el.zoomC = 0;
    drawOptions();
  }
});

// PREVIEW INTERATIVO E SINCRONIZAÇÃO
const prevPlayer = $("#previewPlayer");
const pv = $("#pv");

function updatePlayerTimeDisplay() {
  const pt = $("#playerTime");
  if (pt && prevPlayer) {
    const cur = prevPlayer.currentTime || 0;
    const dur = prevPlayer.duration || S.dur || 0;
    pt.textContent = `${fmt(cur)} / ${fmt(dur)}`;
  }
}

function highlightActiveSegment(currentTime, forceScroll = false) {
  if (!S.segs || !S.segs.length) return;
  let activeIdx = -1;
  for (let i = 0; i < S.segs.length; i++) {
    if (currentTime >= S.segs[i].start && currentTime <= S.segs[i].end) {
      activeIdx = i;
      break;
    }
  }
  const cards = document.querySelectorAll(".sg-card");
  cards.forEach((card, i) => {
    const isActive = (i === activeIdx);
    if (card.classList.contains("active") !== isActive) {
      card.classList.toggle("active", isActive);
      if (isActive && (!userScrollingTranscript || forceScroll)) {
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  });
}

function renderTranscriptList() {
  const list = $("#transcriptList");
  if (!list) return;
  if (!S.segs || S.segs.length === 0) {
    list.innerHTML = `<div class="transcript-empty">Nenhum trecho transcrito ainda. Clique em "Transcrever" acima para iniciar.</div>`;
    const b = $("#segCountBadge"); if (b) b.textContent = "0 trechos";
    return;
  }
  const b = $("#segCountBadge"); if (b) b.textContent = `${S.segs.length} trechos`;
  list.innerHTML = S.segs.map((g, i) => `
    <div class="sg-card" data-idx="${i}" data-start="${g.start}" data-end="${g.end}">
      <div class="sg-header">
        <button type="button" class="sg-time-btn" data-time="${g.start}" title="Pular vídeo para este ponto">
          <span class="sg-play-icon">▶</span>
          <span>${fmt(g.start)} – ${fmt(g.end)}</span>
        </button>
        <span class="sg-dur">${(g.end - g.start).toFixed(1)}s</span>
      </div>
      <textarea class="sg-text" data-idx="${i}" rows="2" title="Clique para editar o texto">${g.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
    </div>
  `).join("");

  const hiddenSegs = $("#segs");
  if (hiddenSegs) {
    hiddenSegs.innerHTML = S.segs.map((g, i) => `<div class="sg"><span>${g.start.toFixed(1)}–${g.end.toFixed(1)}s</span><input data-i="${i}" value="${g.text.replace(/"/g, "&quot;")}"></div>`).join("");
  }
}

let userScrollingTranscript = false;
let scrollTimeout = null;
const transcriptListEl = $("#transcriptList");
if (transcriptListEl) {
  transcriptListEl.addEventListener("scroll", () => {
    userScrollingTranscript = true;
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => { userScrollingTranscript = false; }, 1500);
  });

  transcriptListEl.addEventListener("click", e => {
    const timeBtn = e.target.closest(".sg-time-btn");
    const card = e.target.closest(".sg-card");
    const isTextarea = e.target.tagName && e.target.tagName.toLowerCase() === "textarea";

    if (timeBtn || (card && !isTextarea)) {
      const targetCard = card || timeBtn.closest(".sg-card");
      if (!targetCard) return;
      const start = parseFloat(targetCard.dataset.start);
      if (!isNaN(start) && prevPlayer) {
        prevPlayer.currentTime = start;
        prevPlayer.play().catch(() => {});
        highlightActiveSegment(start, true);
      }
    }
  });

  transcriptListEl.addEventListener("input", e => {
    if (e.target.classList.contains("sg-text")) {
      const idx = parseInt(e.target.dataset.idx, 10);
      if (!isNaN(idx) && S.segs[idx]) {
        S.segs[idx].text = e.target.value;
        S.segs[idx].words = [];
        const inp = $(`#segs input[data-i="${idx}"]`);
        if (inp) inp.value = e.target.value;
      }
    }
  });
}

if (prevPlayer) {
  prevPlayer.addEventListener("timeupdate", () => {
    updatePlayerTimeDisplay();
    highlightActiveSegment(prevPlayer.currentTime);
  });
  prevPlayer.addEventListener("loadedmetadata", updatePlayerTimeDisplay);
}

const btnRewind = $("#btnRewind");
if (btnRewind) {
  btnRewind.onclick = () => {
    if (prevPlayer) {
      prevPlayer.currentTime = Math.max(0, prevPlayer.currentTime - 3);
      highlightActiveSegment(prevPlayer.currentTime, true);
    }
  };
}

const btnForward = $("#btnForward");
if (btnForward) {
  btnForward.onclick = () => {
    if (prevPlayer) {
      prevPlayer.currentTime = Math.min(prevPlayer.duration || S.dur, prevPlayer.currentTime + 3);
      highlightActiveSegment(prevPlayer.currentTime, true);
    }
  };
}

const playbackRateSel = $("#playbackRate");
if (playbackRateSel) {
  playbackRateSel.onchange = e => {
    if (prevPlayer) prevPlayer.playbackRate = parseFloat(e.target.value);
  };
}

$("#videoInput").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  $("#upStatus").textContent = "Enviando...";
  const r = await up("/upload", "video", f);
  if (r.error) { $("#upStatus").textContent = "Erro: " + r.error; return; }
  S.vid = r.video_id;
  $("#projTitle").textContent = f.name;

  const videoUrl = r.url || URL.createObjectURL(f);
  if (prevPlayer) {
    prevPlayer.src = videoUrl;
    $("#previewContainer").style.display = "flex";
    const badge = $("#playerBadge");
    if (badge) badge.textContent = "Original";
  }
  if (pv) pv.src = videoUrl;

  $("#upStatus").textContent = "Analisando cortes e áudio...";
  $("#trStatus").textContent = "Pronto para transcrever";
  const a = await post("/analyze", { video_id: S.vid });
  Object.assign(S, { dur: a.duration, cuts: a.cuts, peaks: a.peaks });
  $("#upStatus").textContent = `Pronto ✓ ${a.cuts.length} cortes detectados`;
  $("#projSub").textContent = `${f.name} · ${a.duration.toFixed(1)}s`;
  updatePlayerTimeDisplay();
};

$("#video2Input").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  $("#up2Status").textContent = "Enviando...";
  const r = await up("/upload", "video2", f);
  S.vid2 = r.video_id;
  const isImg = f.type.startsWith("image/");
  $("#up2Status").textContent = r.error ? "Erro: " + r.error : (isImg ? "Imagem enviada ✓" : "2º vídeo enviado ✓");
};

$("#musicInput").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  S.music = (await up("/upload_music", "music", f)).music_id;
};

// REPRODUZ UM CHIME HARMONIOSO VIA WEB AUDIO API (100% LOCAL E SEM ARQUIVOS EXTERNOS)
function playSuccessChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const freqs = [523.25, 659.25, 783.99, 1046.50]; // Notas: C5, E5, G5, C6 (Acorde Maior de Sucesso)
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      
      const startTime = ctx.currentTime + (idx * 0.11);
      const duration = 0.55;
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  } catch (err) {
    console.warn("Chime Web Audio não pôde ser executado:", err);
  }
}

// NOTIFICAÇÃO COMPLETA: SOM, ALERTA VISUAL NO TÍTULO, MODAL E DOWNLOAD DIRETO
function notifyVideoReady(outUrl) {
  // 1. Toca o chime local
  playSuccessChime();

  // 2. Altera título da aba para alertar o usuário mesmo se estiver navegando em outra janela
  const oldTitle = document.title;
  let toggle = false;
  let flashes = 0;
  const timer = setInterval(() => {
    document.title = toggle ? "🔔 VÍDEO PRONTO! — Edvid" : "✨ Edição Concluída! — Edvid";
    toggle = !toggle;
    flashes++;
    if (flashes >= 14) {
      clearInterval(timer);
      document.title = oldTitle;
    }
  }, 900);

  // 3. Notificação nativa do navegador (se suportada e autorizada)
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification("Edvid — Vídeo Pronto!", {
        body: "Sua edição da Fase 2 foi finalizada com sucesso.",
        silent: true
      });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }

  // 4. Exibe o modal elegante de sucesso
  const modal = $("#modalReady");
  const dlBtn = $("#modalDownloadBtn");
  const viewBtn = $("#modalViewBtn");
  const closeBtn = $("#modalCloseBtn");

  if (modal) {
    if (dlBtn) {
      dlBtn.href = outUrl;
      dlBtn.download = "video_editado.mp4";
    }
    modal.style.display = "flex";

    if (viewBtn) {
      viewBtn.onclick = () => {
        modal.style.display = "none";
        tab("visual");
        if (pv) pv.play();
      };
    }

    if (closeBtn) {
      closeBtn.onclick = () => {
        modal.style.display = "none";
      };
    }

    modal.onclick = (e) => {
      if (e.target === modal) modal.style.display = "none";
    };
  }
}

$("#trBtn").onclick = async () => {
  if (!S.vid) return alert("Envie o vídeo primeiro.");
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  $("#trStatus").textContent = "Transcrevendo (a 1ª vez baixa o modelo)...";
  const r = await post("/transcribe", { video_id: S.vid });
  if (r.error) { $("#trStatus").textContent = "Erro: " + r.error; return; }
  S.segs = r.segments;
  $("#trStatus").textContent = `${S.segs.length} trechos transcritos ✓`;
  renderTranscriptList();
};

$("#renderBtn").onclick = async () => {
  if (!S.vid) return alert("Envie um vídeo na aba Corte primeiro.");
  if ((S.tipo === "dividida" || S.tipo === "dividida2") && !S.vid2) {
    return alert("Envie o segundo vídeo ou imagem fixa (ou selecione a opção 'Tela única').");
  }
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  $("#renderBtn").disabled = true;
  $("#rStatus").textContent = "Renderizando vídeo... (aplicando legendas, headline e efeitos)";
  try {
    const r = await post("/export", {
      video_id: S.vid, video2_id: (S.tipo === "dividida" || S.tipo === "dividida2") ? S.vid2 : null,
      tipo: S.tipo, segments: S.segs, caption_style: S.cap,
      headline: $("#hlText").value, headline_style: S.hl,
      headline_start: S.hlStart || 0,
      headline_end: S.hlEnd || 0,
      headline_pos: S.hlPos || "topo",
      framing_y: (S.framingY !== undefined ? S.framingY : 20) / 100.0,
      cut_silence: !!S.el.cutSilence,
      zoom_continuous: !!S.el.zoomC, zoom_cuts: !!S.el.zoomCuts,
      flash_cuts: !!S.el.flash, tracking: !!S.el.tracking, music_id: S.el.music ? S.music : null, music_volume: $("#musicVol").value,
    });
    if (r.error) {
      $("#rStatus").textContent = "Erro: " + r.error;
      console.error(r.detail);
      return;
    }
    $("#rStatus").textContent = "Pronto ✓";
    const outUrl = "/output/" + r.output;
    if (pv) { pv.src = outUrl; $("#pvLabel").textContent = "Renderizado"; }
    if (prevPlayer) {
      prevPlayer.src = outUrl;
      const badge = $("#playerBadge");
      if (badge) badge.textContent = "Renderizado";
    }
    notifyVideoReady(outUrl);
  } catch (err) {
    $("#rStatus").textContent = "Erro: " + (err.message || err);
    console.error("Falha ao exportar:", err);
  } finally {
    $("#renderBtn").disabled = false;
  }
};

// ========================================================
// TIMELINE PROFISSIONAL DE 7 FAIXAS (IDÊNTICA À IMAGEM 4)
// ========================================================
const SCENE_NAMES = [
  "HOOK - AI", "QUEM", "CONTRASTE", "SOLUÇÃO", "NOBEL",
  "TESIS", "URGÊNCIA", "OFERTA", "BENEFÍCIO", "CTA"
];

function drawTL() {
  const d = S.dur || 10, pps = S.pps, W = Math.max(300, d * pps), tl = $("#tl");
  if (!tl) return;
  tl.style.width = W + "px";

  // 1. Régua de tempo
  const step = pps >= 40 ? 1 : pps >= 15 ? 5 : 10;
  let ruler = "";
  for (let t = 0; t <= d; t += step) {
    ruler += `<span style="left:${t * pps}px">${fmt(t).slice(0, -3)}</span>`;
  }

  const chip = (a, b, txt) => `<u style="left:${a * pps}px;width:${Math.max(3, (b - a) * pps - 2)}px">${txt}</u>`;

  // 2. Subtítulos (chips em ciano translúcido)
  const words = S.segs.flatMap(g => (g.words && g.words.length) ? g.words.map(w => [w.start, w.end, w.word]) : [[g.start, g.end, g.text]]);

  // 3. Cenas / Cortes com nomes de roteiro
  const bounds = [0, ...S.cuts, d];
  const scenesHtml = bounds.slice(0, -1).map((b, i) => {
    const sName = SCENE_NAMES[i % SCENE_NAMES.length] || `Cena ${i + 1}`;
    return chip(b, bounds[i + 1], sName);
  }).join("");

  // 4. Headline
  const hl = $("#hlText") ? $("#hlText").value.trim() : "";

  // 5. Clipes de Mídia / B-roll simulados
  let mediaHtml = "";
  const mediaSamples = ["responda.mp4", "demis_time", "proteinas", "medicos.mp4", "celulas.mp4"];
  let curT = 0;
  mediaSamples.forEach((mName, i) => {
    const segDur = Math.min(6, d / mediaSamples.length);
    if (curT < d) {
      mediaHtml += chip(curT, Math.min(d, curT + segDur), mName);
      curT += segDur + 2;
    }
  });

  tl.innerHTML = `
    <div class="ruler">${ruler}</div>
    <!-- Faixa 1: Flags vermelhas dos cortes -->
    <div class="trk">${S.cuts.map(c => `<b class="flag" style="left:${c * pps}px"></b>`).join("")}</div>
    <!-- Faixa 2: Legendas em ciano -->
    <div class="trk subs">${words.map(w => chip(w[0], w[1], w[2])).join("")}</div>
    <!-- Faixa 3: Cenas / Cortes com rótulos de roteiro -->
    <div class="trk sc">${scenesHtml}</div>
    <!-- Faixa 4: Forma de onda de áudio em amarelo-esverdeado -->
    <div class="trk"><canvas id="wv" width="${W}" height="34"></canvas></div>
    <!-- Faixa 5: Headline em âmbar com barra arrastável -->
    <div class="trk hl" id="trkHl">
      ${hl ? `
        <u class="hl-bar" id="hlBar" style="left:${(S.hlStart || 0) * pps}px;width:${Math.max(24, (((S.hlEnd && S.hlEnd > (S.hlStart || 0)) ? Math.min(d, S.hlEnd) : d) - (S.hlStart || 0)) * pps)}px;cursor:grab;" title="Arraste para mover pela timeline ou puxe as bordas para mudar início/fim">
          <span class="hl-handle hl-handle-l" title="Ajustar tempo inicial"></span>
          <span class="hl-label-text">${hl}</span>
          <span class="hl-handle hl-handle-r" title="Ajustar tempo final"></span>
        </u>
      ` : ""}
    </div>
    <!-- Faixa 6: Mídia B-roll -->
    <div class="trk media">${mediaHtml}</div>
    <!-- Faixa 7: Trilha sonora listrada -->
    <div class="trk mu">${S.el.music ? chip(0, d, "trilha.mp3 - vol: " + ($("#musicVol") ? $("#musicVol").value : "0.15")) : ""}</div>
    <div id="ph"></div>
  `;

  // Desenhar a forma de onda sonora em amarelo-esverdeado (#bbf43d)
  const canvas = $("#wv");
  if (canvas) {
    const c = canvas.getContext("2d");
    c.fillStyle = "#bbf43d";
    if (S.peaks && S.peaks.length > 0) {
      S.peaks.forEach((p, i) => {
        const x = (i / S.peaks.length) * W;
        const h = Math.max(1, p * 30);
        c.fillRect(x, 17 - h / 2, Math.max(1, W / S.peaks.length - 0.5), h);
      });
    } else {
      // Simulação padrão suave caso o áudio não tenha picos gerados ainda
      for (let x = 0; x < W; x += 4) {
        const h = Math.sin(x * 0.05) * 8 + 12;
        c.fillRect(x, 17 - h / 2, 2, h);
      }
    }
  }
}

// INTERAÇÕES DA TIMELINE
const tl_seek = e => {
  if (e.target.closest("#hlBar") || e.target.closest(".hl-handle")) return;
  const tl = $("#tl");
  if (!tl) return;
  const x = e.clientX - tl.getBoundingClientRect().left;
  const seekTime = Math.max(0, x / S.pps);
  if (pv) pv.currentTime = seekTime;
  if (prevPlayer) prevPlayer.currentTime = seekTime;
  highlightActiveSegment(seekTime, true);
};

// CONTROLE DE ENQUADRAMENTO VERTICAL DA CÂMERA (ALTURA DA CABEÇA)
function setFraming(val, updateInputs = true) {
  val = Math.max(0, Math.min(60, parseInt(val) || 0));
  S.framingY = val;
  const label = `${val}% (${val <= 5 ? 'Topo Max' : val <= 15 ? 'Ideal' : val <= 25 ? 'Padrão' : 'Mais baixo'})`;

  const valSpan1 = $("#framingYVal");
  if (valSpan1) valSpan1.textContent = label;

  const valSpan2 = $("#visualFramingYVal");
  if (valSpan2) valSpan2.textContent = label;

  if (updateInputs) {
    if ($("#framingY")) $("#framingY").value = val;
    if ($("#visualFramingY")) $("#visualFramingY").value = val;
  }

  // Atualiza destaque dos botões de predefinição
  document.querySelectorAll(".btn-framing-preset").forEach(btn => {
    const isCur = parseInt(btn.dataset.val) === val;
    btn.classList.toggle("on", isCur);
    btn.classList.toggle("btn-primary", isCur);
    btn.classList.toggle("btn-secondary", !isCur);
  });

  // Aplica em tempo real no vídeo via CSS object-position
  if (prevPlayer) prevPlayer.style.objectPosition = `center ${val}%`;
  if (pv) pv.style.objectPosition = `center ${val}%`;

  // Atualiza badge de overlay no vídeo se visível
  const overlayText = $("#framingOverlayText");
  if (overlayText) overlayText.textContent = `↕ Enquadramento: ${label}`;
}

const framingYInput = $("#framingY");
if (framingYInput) {
  framingYInput.oninput = function() {
    setFraming(this.value, false);
    if ($("#visualFramingY")) $("#visualFramingY").value = this.value;
  };
}

const visualFramingYInput = $("#visualFramingY");
if (visualFramingYInput) {
  visualFramingYInput.oninput = function() {
    setFraming(this.value, false);
    if ($("#framingY")) $("#framingY").value = this.value;
  };
}

// Botões de predefinição de enquadramento
document.querySelectorAll(".btn-framing-preset").forEach(btn => {
  btn.onclick = () => setFraming(parseInt(btn.dataset.val));
});

// Botões de nudge (subir/descer câmera em passos de 5%)
const nudgeUp = () => setFraming((S.framingY !== undefined ? S.framingY : 10) - 5);
const nudgeDown = () => setFraming((S.framingY !== undefined ? S.framingY : 10) + 5);

if ($("#btnNudgeUp")) $("#btnNudgeUp").onclick = nudgeUp;
if ($("#btnNudgeUpEstilo")) $("#btnNudgeUpEstilo").onclick = nudgeUp;
if ($("#btnNudgeDown")) $("#btnNudgeDown").onclick = nudgeDown;
if ($("#btnNudgeDownEstilo")) $("#btnNudgeDownEstilo").onclick = nudgeDown;

// Arrastar verticalmente direto no player de vídeo para ajustar altura
function enableFramingDrag(el) {
  if (!el) return;
  let startY = 0, startFraming = 0, dragging = false, overlayTimer = null;
  const overlay = $("#framingOverlay");

  const onDown = clientY => {
    dragging = true;
    startY = clientY;
    startFraming = S.framingY !== undefined ? S.framingY : 10;
    if (overlay) {
      clearTimeout(overlayTimer);
      overlay.style.display = "block";
    }
  };

  const onMove = clientY => {
    if (!dragging) return;
    const dy = clientY - startY;
    const delta = Math.round(dy / 4);
    setFraming(startFraming + delta);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    if (overlay) {
      overlayTimer = setTimeout(() => { overlay.style.display = "none"; }, 1600);
    }
  };

  el.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    // Não interrompe cliques nos controles nativos se o clique for na barra inferior
    const rect = el.getBoundingClientRect();
    if (e.clientY > rect.bottom - 45) return;
    onDown(e.clientY);
  });
  window.addEventListener("mousemove", e => onMove(e.clientY));
  window.addEventListener("mouseup", onUp);

  el.addEventListener("touchstart", e => {
    if (e.touches.length === 1) {
      const rect = el.getBoundingClientRect();
      if (e.touches[0].clientY > rect.bottom - 45) return;
      onDown(e.touches[0].clientY);
    }
  }, { passive: true });
  window.addEventListener("touchmove", e => {
    if (dragging && e.touches.length === 1) onMove(e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener("touchend", onUp);
}

enableFramingDrag($("#pv"));
enableFramingDrag($("#previewPlayer"));

// Botão de reaplicar enquadramento no vídeo finalizado diretamente na aba Visual
const reapplyBtn = $("#btnReapplyFraming");
if (reapplyBtn) {
  reapplyBtn.onclick = async () => {
    if (!S.vid) return alert("Envie o vídeo primeiro.");
    const status = $("#visualFramingStatus");
    reapplyBtn.disabled = true;
    const originalText = reapplyBtn.textContent;
    reapplyBtn.textContent = "Ajustando enquadramento... ⏳";
    if (status) status.textContent = "Re-renderizando vídeo com o novo enquadramento...";

    try {
      const r = await post("/export", {
        video_id: S.vid,
        video2_id: S.vid2,
        tipo: S.tipo,
        segments: S.segs,
        caption_style: S.cap,
        headline: $("#hlText") ? $("#hlText").value : "",
        headline_style: S.hl,
        headline_start: S.hlStart || 0,
        headline_end: S.hlEnd || 0,
        headline_pos: S.hlPos || "topo",
        framing_y: (S.framingY !== undefined ? S.framingY : 10) / 100.0,
        cut_silence: !!S.el.cutSilence,
        zoom_continuous: !!S.el.zoomC,
        zoom_cuts: !!S.el.zoomCuts,
        flash_cuts: !!S.el.flash,
        tracking: !!S.el.tracking,
        music_id: S.el.music ? S.music : null,
        music_volume: $("#musicVol") ? $("#musicVol").value : 0.15,
      });

      if (r.error) {
        if (status) status.textContent = "Erro: " + r.error;
        return;
      }

      const outUrl = "/output/" + r.output + "?t=" + Date.now();
      const curTime = pv ? pv.currentTime : 0;
      if (pv) {
        pv.src = outUrl;
        pv.onloadedmetadata = () => { pv.currentTime = curTime; };
        $("#pvLabel").textContent = "Enquadrado ✓";
      }
      if (prevPlayer) {
        prevPlayer.src = outUrl;
        const badge = $("#playerBadge");
        if (badge) badge.textContent = "Enquadrado ✓";
      }
      if (status) status.textContent = "✓ Enquadramento atualizado com sucesso!";
      setTimeout(() => { if (status) status.textContent = ""; }, 4000);
      notifyVideoReady(outUrl);
    } catch (err) {
      if (status) status.textContent = "Erro: " + (err.message || err);
    } finally {
      reapplyBtn.disabled = false;
      reapplyBtn.textContent = originalText;
    }
  };
}

// CONTROLES DE DURAÇÃO DA HEADLINE NA ABA ESTILO
document.querySelectorAll(".hl-dur-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".hl-dur-btn").forEach(b => {
      b.classList.remove("on", "btn-primary");
      b.classList.add("btn-secondary");
    });
    btn.classList.add("on", "btn-primary");
    btn.classList.remove("btn-secondary");
    const durType = btn.dataset.dur;
    if (durType === "5") {
      S.hlStart = 0;
      S.hlEnd = 5;
    } else if (durType === "10") {
      S.hlStart = 0;
      S.hlEnd = 10;
    } else {
      S.hlStart = 0;
      S.hlEnd = S.dur || 0;
    }
    if ($("#hlStart")) $("#hlStart").value = S.hlStart;
    if ($("#hlEnd")) $("#hlEnd").value = S.hlEnd;
    drawTL();
  };
});

// CONTROLES DE POSIÇÃO DA HEADLINE (TOPO / CENTRO / BASE)
document.querySelectorAll(".hl-pos-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".hl-pos-btn").forEach(b => {
      b.classList.remove("on", "btn-primary");
      b.classList.add("btn-secondary");
    });
    btn.classList.add("on", "btn-primary");
    btn.classList.remove("btn-secondary");
    S.hlPos = btn.dataset.pos;
  };
});

const hlStartInput = $("#hlStart");
const hlEndInput = $("#hlEnd");
if (hlStartInput) {
  hlStartInput.onchange = function() {
    S.hlStart = Math.max(0, parseFloat(this.value) || 0);
    drawTL();
  };
}
if (hlEndInput) {
  hlEndInput.onchange = function() {
    S.hlEnd = Math.max(0, parseFloat(this.value) || 0);
    drawTL();
  };
}

const hlTextInput = $("#hlText");
if (hlTextInput) {
  hlTextInput.oninput = () => {
    drawTL();
  };
}

// DRAG E RESIZE DA HEADLINE DIRETAMENTE NA TIMELINE
let isDraggingHl = false, dragType = null, dragStartX = 0, initialHlStart = 0, initialHlEnd = 0;

document.addEventListener("mousedown", e => {
  const bar = e.target.closest("#hlBar");
  if (!bar) return;
  const pps = S.pps || 20;
  const d = S.dur || 10;
  isDraggingHl = true;
  dragStartX = e.clientX;
  initialHlStart = S.hlStart || 0;
  initialHlEnd = (S.hlEnd && S.hlEnd > initialHlStart) ? Math.min(d, S.hlEnd) : d;

  if (e.target.classList.contains("hl-handle-l")) {
    dragType = "resize-l";
  } else if (e.target.classList.contains("hl-handle-r")) {
    dragType = "resize-r";
  } else {
    dragType = "move";
    bar.style.cursor = "grabbing";
  }
  e.preventDefault();
});

document.addEventListener("mousemove", e => {
  if (!isDraggingHl) return;
  const pps = S.pps || 20;
  const d = S.dur || 10;
  const dx = (e.clientX - dragStartX) / pps;

  if (dragType === "move") {
    const dur = initialHlEnd - initialHlStart;
    let newStart = Math.max(0, Math.min(d - dur, initialHlStart + dx));
    let newEnd = newStart + dur;
    S.hlStart = Math.round(newStart * 10) / 10;
    S.hlEnd = Math.round(newEnd * 10) / 10;
  } else if (dragType === "resize-l") {
    let newStart = Math.max(0, Math.min(initialHlEnd - 0.5, initialHlStart + dx));
    S.hlStart = Math.round(newStart * 10) / 10;
  } else if (dragType === "resize-r") {
    let newEnd = Math.max(initialHlStart + 0.5, Math.min(d, initialHlEnd + dx));
    S.hlEnd = Math.round(newEnd * 10) / 10;
  }

  if ($("#hlStart")) $("#hlStart").value = S.hlStart;
  if ($("#hlEnd")) $("#hlEnd").value = S.hlEnd;

  const bar = $("#hlBar");
  if (bar) {
    const start = S.hlStart || 0;
    const end = (S.hlEnd && S.hlEnd > start) ? Math.min(d, S.hlEnd) : d;
    bar.style.left = (start * pps) + "px";
    bar.style.width = Math.max(24, (end - start) * pps) + "px";
  }
});

document.addEventListener("mouseup", () => {
  if (isDraggingHl) {
    isDraggingHl = false;
    dragType = null;
    const bar = $("#hlBar");
    if (bar) bar.style.cursor = "grab";
  }
});

const tlEl = $("#tl");
if (tlEl) tlEl.onclick = tl_seek;

const playBtn = $("#playBtn");
if (playBtn) {
  playBtn.onclick = () => {
    if (pv) {
      pv.paused ? pv.play() : pv.pause();
    }
  };
}

const stepBack = $("#stepBackBtn");
if (stepBack) {
  stepBack.onclick = () => {
    if (pv) pv.currentTime = 0;
    if (prevPlayer) prevPlayer.currentTime = 0;
    highlightActiveSegment(0, true);
  };
}

const markerBtn = $("#markerBtn");
if (markerBtn) {
  markerBtn.onclick = () => {
    const t = pv ? pv.currentTime : 0;
    if (!S.cuts.some(c => Math.abs(c - t) < 0.3)) {
      S.cuts.push(t);
      S.cuts.sort((a, b) => a - b);
      drawTL();
    }
  };
}

const zoomInput = $("#zoom");
if (zoomInput) {
  zoomInput.oninput = e => {
    S.pps = +e.target.value;
    drawTL();
  };
}

const fitBtn = $("#fit");
if (fitBtn) {
  fitBtn.onclick = () => {
    const sc = $("#scroll");
    if (sc) {
      S.pps = Math.max(5, (sc.clientWidth - 4) / (S.dur || 10));
      if (zoomInput) zoomInput.value = S.pps;
      drawTL();
    }
  };
}

// LOOP DE ANIMAÇÃO DO PLAYHEAD E CLOCK
(function loop() {
  const v = pv || prevPlayer;
  const ph = $("#ph");
  if (v) {
    if (ph) ph.style.left = (v.currentTime * S.pps) + "px";
    const clk = $("#clock");
    if (clk) clk.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration || S.dur || 0)}`;
    if (playBtn) playBtn.textContent = v.paused ? "▶" : "❚❚";
  }
  requestAnimationFrame(loop);
})();

drawOptions();
tab("corte");
