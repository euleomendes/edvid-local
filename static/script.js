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
  framingX: 50, framingY: 10, framingX2: 50, framingY2: 50,
  hlStart: 0, hlEnd: 0, hlPos: "topo",
  hlPosX: 50, hlPosY: 22.5, hlScale: 1.0, hlMode: "text",
  subPosX: 50, subPosY: 77.0, subScale: 1.0,
  hlBold: true, hlItalic: false, hlUnderline: false, hlUppercase: true,
  hlTextColor: "#ffffff", hlOutlineColor: "#000000",
  hlColor1: "#ffffff", hlColor2: "#ff6a00",
  hlTemplate: null, captionDisabled: false, lastCap: "hormozi",
  safeZoneVisible: false,
  el: { cutSilence: 1, flash: 1, zoomCuts: 1, tracking: 0, zoomC: 0, music: 0 },
  mediaItems: [],
  renderedUrl: null,
  originalUrl: null,
  viewMode: "original",
  activeDrag: null
};

const TIPOS = [
  ["unica", "Tela única", "single"],
  ["dividida", "Dividida (40% / 60%)", "div1"],
  ["dividida2", "Dividida (60% / 40%)", "div2"]
];

const HL_TXT = "É ASSIM QUE VAI FICAR A HEADLINE";
const HLS = [
  ["bebas_impact", "Impact / Viral", `font-family:Impact,sans-serif;font-size:14px;color:#fff;letter-spacing:1px;text-transform:uppercase;text-shadow:0 0 3px #000`],
  ["neon_cyber", "Arial Black (Ciano)", `font-family:'Arial Black',sans-serif;font-weight:900;font-size:12px;color:#00d2b4;text-shadow:0 0 3px #000`],
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
  ["nenhuma", "Sem Legenda (Limpo)", `<div style="color:#ef4444;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:3px"><span>🚫</span> SEM LEGENDA</div>`],
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
    updateHeadlineOverlay();
    updateSubtitleOverlayAtTime(pvP ? pvP.currentTime : 0);
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

  // 1. TIPO DE EDIÇÃO (COM PROPORÇÕES REAIS 60% / 40%)
  $("#tipoC").innerHTML = TIPOS.map(([id, nome, layout]) => {
    const isSel = (S.tipo === id);
    const radio = `<div class="radio-badge ${isSel ? 'sel' : ''}">${checkSvg}</div>`;

    let innerPhone = "";
    if (layout === "div1") {
      innerPhone = `<div class="notch"></div><div class="half-top half-40" style="background:#20140c">${mountainSvg}</div><div class="div-bar"></div><div class="half-bot half-60" style="background:#11151f">${avatarSvg}</div>`;
    } else if (layout === "div2") {
      innerPhone = `<div class="notch"></div><div class="half-top half-60" style="background:#11151f">${avatarSvg}</div><div class="div-bar"></div><div class="half-bot half-40" style="background:#20140c">${mountainSvg}</div>`;
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

  // Sincroniza seletor de estilo de headline na aba visual
  const visHlSel = $("#visualHlStyleSelect");
  if (visHlSel) visHlSel.value = S.hl;

  // 3. ESTILO DE LEGENDA
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

  // Sincroniza seletor de estilo de legenda na aba visual
  const visCapSel = $("#visualCapStyleSelect");
  if (visCapSel) visCapSel.value = S.cap;

  // Sincroniza toggles de legenda
  const isCapOn = !S.captionDisabled && S.cap !== "nenhuma";
  const capTog = $("#captionToggle"), visCapTog = $("#visualCaptionToggle");
  if (capTog) capTog.checked = isCapOn;
  if (visCapTog) visCapTog.checked = isCapOn;
  const capTogTxt = $("#captionToggleText"), visCapTogLbl = $("#visualCaptionToggleLabel");
  if (capTogTxt) capTogTxt.textContent = isCapOn ? "Legendas Ativadas" : "Legendas Desativadas";
  if (visCapTogLbl) visCapTogLbl.textContent = isCapOn ? "Ativada" : "Desativada";

  // Sincroniza controle dedicado de tamanho da legenda na aba visual
  const visSubScaleRange = $("#visualSubScaleRange");
  const visSubScaleVal = $("#visualSubScaleVal");
  const subPct = Math.round((S.subScale || 1.0) * 100);
  if (visSubScaleRange && document.activeElement !== visSubScaleRange) visSubScaleRange.value = subPct;
  if (visSubScaleVal) visSubScaleVal.textContent = `${subPct}%`;

  // Sincroniza controle dedicado de tamanho da headline na aba visual
  const visHlScaleRange = $("#visualHlScaleRange");
  const visHlScaleVal = $("#visualHlScaleVal");
  const hlPct = Math.round((S.hlScale || 1.0) * 100);
  if (visHlScaleRange && document.activeElement !== visHlScaleRange) visHlScaleRange.value = hlPct;
  if (visHlScaleVal) visHlScaleVal.textContent = `${hlPct}%`;

  // Sincroniza botões de formatação clássica da headline (B, I, U, TT)
  ["btnHlBold", "btnVisualHlBold"].forEach(id => { const el = $("#" + id); if (el) el.classList.toggle("on", !!S.hlBold); });
  ["btnHlItalic", "btnVisualHlItalic"].forEach(id => { const el = $("#" + id); if (el) el.classList.toggle("on", !!S.hlItalic); });
  ["btnHlUnderline", "btnVisualHlUnderline"].forEach(id => { const el = $("#" + id); if (el) el.classList.toggle("on", !!S.hlUnderline); });
  ["btnHlUppercase", "btnVisualHlUppercase"].forEach(id => { const el = $("#" + id); if (el) el.classList.toggle("on", !!S.hlUppercase); });

  // Sincroniza pickers de cores da headline (sem glow e sem gradiente)
  ["hlTextColor", "visualHlTextColor", "hlColor1", "visualHlColor1"].forEach(id => { const el = $("#" + id); if (el) el.value = S.hlTextColor || "#ffffff"; });
  ["hlOutlineColor", "visualHlOutlineColor"].forEach(id => { const el = $("#" + id); if (el) el.value = S.hlOutlineColor || "#000000"; });

  // 4. ELEMENTOS DA EDIÇÃO
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

  const isSplit = (S.tipo === "dividida" || S.tipo === "dividida2");
  $("#split2").style.display = isSplit ? "block" : "none";
  if ($("#visualMediaSection")) $("#visualMediaSection").style.display = isSplit ? "block" : "none";

  // Atualiza classe do phoneFrame para ativar layout proporcional correspondente
  const phoneFrame = $("#phoneFrame");
  if (phoneFrame) {
    phoneFrame.className = `phone-frame layout-${S.tipo}`;
  }

  // Guia visual de divisão 60%/40% no player de vídeo
  const guide = $("#splitGuideLine");
  const topTag = $("#guideTagTop");
  const botTag = $("#guideTagBot");
  const medFramingVal = $("#visualMediaFramingYVal");

  if (S.tipo === "dividida") {
    if (guide) {
      guide.style.display = "block";
      guide.className = "split-guide-line split-at-40";
    }
    if (topTag) topTag.textContent = "Mídia 40%";
    if (botTag) botTag.textContent = "Câmera 60%";
    if (medFramingVal) {
      medFramingVal.style.display = "inline-block";
      medFramingVal.textContent = `Mídia 40%: X ${S.framingX2 || 50}% · Y ${S.framingY2 || 50}%`;
    }
  } else if (S.tipo === "dividida2") {
    if (guide) {
      guide.style.display = "block";
      guide.className = "split-guide-line split-at-60";
    }
    if (topTag) topTag.textContent = "Câmera 60%";
    if (botTag) botTag.textContent = "Mídia 40%";
    if (medFramingVal) {
      medFramingVal.style.display = "inline-block";
      medFramingVal.textContent = `Mídia 40%: X ${S.framingX2 || 50}% · Y ${S.framingY2 || 50}%`;
    }
  } else {
    if (guide) guide.style.display = "none";
    if (medFramingVal) medFramingVal.style.display = "none";
  }

  const camFramingVal = $("#visualFramingYVal");
  if (camFramingVal) {
    camFramingVal.textContent = (S.tipo !== 'unica' ? 'Câmera 60%: ' : 'Câmera: ') + `X ${S.framingX || 50}% · Y ${S.framingY || 10}%`;
  }

  // Sincroniza sliders de precisão
  const medSliders = $("#mediaFramingSlidersRow");
  if (medSliders) medSliders.style.display = isSplit ? "flex" : "none";
  if ($("#framingRangeX")) $("#framingRangeX").value = S.framingX || 50;
  if ($("#framingRangeY")) $("#framingRangeY").value = S.framingY || 10;
  if ($("#mediaFramingRangeX")) $("#mediaFramingRangeX").value = S.framingX2 || 50;
  if ($("#mediaFramingRangeY")) $("#mediaFramingRangeY").value = S.framingY2 || 50;
  if ($("#framingValXText")) $("#framingValXText").textContent = `${S.framingX || 50}%`;
  if ($("#framingValYText")) $("#framingValYText").textContent = `${S.framingY || 10}%`;
  if ($("#mediaFramingValXText")) $("#mediaFramingValXText").textContent = `${S.framingX2 || 50}%`;
  if ($("#mediaFramingValYText")) $("#mediaFramingValYText").textContent = `${S.framingY2 || 50}%`;

  $("#musicBox").style.display = S.el.music ? "block" : "none";

  const nome = (l, id) => (l.find(x => x[0] === id) || [])[1];
  const ativos = ELS.filter(([id]) => S.el[id]).map(e => e[1].toLowerCase()).join(", ");
  const capName = S.captionDisabled || S.cap === "nenhuma" ? "sem legenda" : `legenda ${nome(CAPS, S.cap).toLowerCase()}`;
  $("#sum").textContent = `${nome(TIPOS, S.tipo)} · headline ${nome(HLS, S.hl).toLowerCase()} · ${capName}${ativos ? " · " + ativos : ""}`;

  updateHeadlineOverlay();
  const v = (S.viewMode === "rendered") ? $("#pvRenderedFull") : pv;
  updateSubtitleOverlayAtTime(v ? v.currentTime : 0);
  applyObjectPositions();
}

document.addEventListener("click", e => {
  const o = e.target.closest(".opt-card"), p = e.target.closest(".cyan-pill");
  if (o) {
    S[o.dataset.k] = o.dataset.id;
    if (S.tipo !== "unica") S.el.tracking = 0;
    drawOptions();
    drawTL();
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
        S._subChunksValid = false;
        const inp = $(`#segs input[data-i="${idx}"]`);
        if (inp) inp.value = e.target.value;
        const curV = $("#pv");
        if (curV) updateSubtitleOverlayAtTime(curV.currentTime || 0);
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
  $("#upStatus").textContent = "Enviando vídeo principal...";
  const r = await up("/upload", "video", f);
  if (r.error) { $("#upStatus").textContent = "Erro: " + r.error; return; }
  S.vid = r.video_id;
  $("#projTitle").textContent = f.name;

  const videoUrl = r.url || URL.createObjectURL(f);
  S.originalUrl = videoUrl;
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
  if (!S.hlEnd || S.hlEnd <= 0) S.hlEnd = a.duration;
  if ($("#hlEnd")) $("#hlEnd").value = Math.round(a.duration * 10) / 10;
  $("#upStatus").textContent = `Pronto ✓ ${a.cuts.length} cortes detectados`;
  $("#projSub").textContent = `${f.name} · ${a.duration.toFixed(1)}s`;
  updatePlayerTimeDisplay();
  drawTL();
};

// ========================================================
// GERENCIADOR DE MÍDIAS / IMAGENS PARA TELA DIVIDIDA
// ========================================================
async function handleMediaFiles(files) {
  if (!files || !files.length) return;
  const status = $("#mediaUploadStatus");
  if (status) status.textContent = `Enviando ${files.length} arquivo(s)... ⏳`;

  try {
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append("media", f));
    const res = await fetch("/upload_media", { method: "POST", body: fd }).then(r => r.json());

    if (res.items && res.items.length) {
      const curCount = S.mediaItems.length;
      const d = S.dur || 10;
      const totalCount = curCount + res.items.length;
      const slotDur = d / Math.max(1, totalCount);

      res.items.forEach((item, idx) => {
        const newId = "m_" + Math.random().toString(36).substr(2, 9);
        let start = 0, end = d;
        if (totalCount > 1) {
          start = Math.round((curCount + idx) * slotDur * 10) / 10;
          end = Math.round((curCount + idx + 1) * slotDur * 10) / 10;
        }
        S.mediaItems.push({
          id: newId,
          file_id: item.file_id,
          name: item.filename,
          is_img: item.is_image,
          has_audio: !!item.has_audio,
          muted: false,
          volume: 1.0,
          duration: item.duration,
          url: item.url,
          start: start,
          end: end,
          framing_x: S.framingX2 !== undefined ? S.framingX2 : 50,
          framing_y: S.framingY2 !== undefined ? S.framingY2 : 50
        });
      });

      if (status) status.textContent = `✓ ${res.items.length} arquivo(s) adicionado(s) com sucesso!`;
      setTimeout(() => { if (status) status.textContent = ""; }, 3500);

      renderMediaLists();
      drawTL();
    } else if (res.error) {
      if (status) status.textContent = "Erro: " + res.error;
    }
  } catch (err) {
    if (status) status.textContent = "Erro ao enviar: " + (err.message || err);
  }
}

function distributeMediaItems() {
  if (!S.mediaItems.length) return;
  const d = S.dur || 10;
  const slot = d / S.mediaItems.length;
  S.mediaItems.forEach((m, idx) => {
    m.start = Math.round(idx * slot * 10) / 10;
    m.end = Math.round((idx + 1) * slot * 10) / 10;
  });
  renderMediaLists();
  drawTL();
}

function removeMediaItem(id) {
  S.mediaItems = S.mediaItems.filter(m => m.id !== id);
  renderMediaLists();
  drawTL();
}

function renderMediaLists() {
  const html = S.mediaItems.length === 0
    ? `<div style="font-size:11.5px;color:#6b7280;padding:8px 4px;">Nenhuma mídia adicionada ainda. Clique em "+ Adicionar" acima ou arraste arquivos para a timeline.</div>`
    : S.mediaItems.map((m, idx) => `
      <div class="media-item-row" data-id="${m.id}">
        <div class="media-thumb">
          ${m.is_img ? `<img src="${m.url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:3px;">` : `🎬`}
        </div>
        <div class="media-info">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
            <span class="media-name" title="${m.name}">#${idx + 1} ${m.name}</span>
            ${!m.is_img ? `
              <button type="button" class="btn-toggle-media-audio" data-id="${m.id}" title="${m.muted ? 'Ativar áudio do vídeo' : 'Mutar vídeo'}" style="background:${m.muted ? '#374151' : '#047857'};border:none;color:#fff;border-radius:4px;padding:2px 8px;font-size:10.5px;cursor:pointer;display:flex;align-items:center;gap:4px;font-weight:700;">
                <span>${m.muted ? '🔇 Mutado' : '🔊 Com Som'}</span>
              </button>
            ` : ''}
          </div>
          <div class="media-times-ctrl">
            <label>De: <input type="number" step="0.5" min="0" value="${m.start}" data-id="${m.id}" data-k="start">s</label>
            <label>Até: <input type="number" step="0.5" min="0" value="${m.end}" data-id="${m.id}" data-k="end">s</label>
            <span style="font-size:10px;color:#6b7280;">(${(m.end - m.start).toFixed(1)}s)</span>
          </div>
          <div class="media-framing-ctrl">
            <span>↕ Altura:</span>
            <input type="range" min="0" max="100" step="5" value="${m.framing_y !== undefined ? m.framing_y : 50}" data-id="${m.id}" class="media-item-framing-range">
            <span style="color:#00d2b4;font-weight:700;">${m.framing_y !== undefined ? m.framing_y : 50}%</span>
          </div>
          ${!m.is_img && !m.muted ? `
            <div class="media-volume-ctrl" style="display:flex;align-items:center;gap:6px;margin-top:4px;">
              <span style="font-size:10.5px;color:#9ca3af;">Volume:</span>
              <input type="range" min="0" max="1" step="0.05" value="${m.volume !== undefined ? m.volume : 1.0}" data-id="${m.id}" class="media-item-vol-range" style="flex:1;">
              <span style="font-size:10.5px;color:#34d399;font-weight:700;width:34px;text-align:right;">${Math.round((m.volume !== undefined ? m.volume : 1.0) * 100)}%</span>
            </div>
          ` : ''}
        </div>
        <button type="button" class="btn-del-media" data-id="${m.id}" title="Retirar este arquivo">🗑</button>
      </div>
    `).join("");

  const listEstilo = $("#mediaItemsListEstilo");
  if (listEstilo) listEstilo.innerHTML = html;

  const listVisual = $("#visualMediaItemsList");
  if (listVisual) listVisual.innerHTML = html;
}

// Eventos dos botões de adicionar e distribuir mídias
const mediaUploadInput = $("#mediaUploadInput");
if (mediaUploadInput) {
  mediaUploadInput.onchange = e => handleMediaFiles(e.target.files);
}

const btnSelectMedia = $("#btnSelectMedia");
if (btnSelectMedia && mediaUploadInput) {
  btnSelectMedia.onclick = () => mediaUploadInput.click();
}

const btnVisualAddMedia = $("#btnVisualAddMedia");
if (btnVisualAddMedia && mediaUploadInput) {
  btnVisualAddMedia.onclick = () => mediaUploadInput.click();
}

const btnDistributeMedia = $("#btnDistributeMedia");
if (btnDistributeMedia) {
  btnDistributeMedia.onclick = distributeMediaItems;
}

const btnVisualDistribute = $("#btnVisualDistribute");
if (btnVisualDistribute) {
  btnVisualDistribute.onclick = distributeMediaItems;
}

// Delegação de eventos nas listas de mídias (inputs de tempo, sliders e áudio)
document.addEventListener("input", e => {
  const itemFraming = e.target.closest(".media-item-framing-range");
  if (itemFraming) {
    const id = itemFraming.dataset.id;
    const m = S.mediaItems.find(x => x.id === id);
    if (m) {
      m.framing_y = parseInt(itemFraming.value, 10);
      const span = itemFraming.parentElement.querySelector("span:last-child");
      if (span) span.textContent = `${m.framing_y}%`;
      applyObjectPositions();
    }
  }

  const itemVol = e.target.closest(".media-item-vol-range");
  if (itemVol) {
    const id = itemVol.dataset.id;
    const m = S.mediaItems.find(x => x.id === id);
    if (m) {
      m.volume = parseFloat(itemVol.value);
      const span = itemVol.parentElement.querySelector("span:last-child");
      if (span) span.textContent = `${Math.round(m.volume * 100)}%`;
      const vidEl = $("#pvMediaVideo");
      if (vidEl) vidEl.volume = m.volume;
    }
  }
});

document.addEventListener("change", e => {
  const timeInp = e.target.closest(".media-times-ctrl input");
  if (timeInp) {
    const id = timeInp.dataset.id;
    const k = timeInp.dataset.k;
    const m = S.mediaItems.find(x => x.id === id);
    if (m) {
      m[k] = Math.max(0, parseFloat(timeInp.value) || 0);
      drawTL();
    }
  }
});

document.addEventListener("click", e => {
  const delBtn = e.target.closest(".btn-del-media");
  if (delBtn) {
    removeMediaItem(delBtn.dataset.id);
    return;
  }

  const audioBtn = e.target.closest(".btn-toggle-media-audio");
  if (audioBtn) {
    const id = audioBtn.dataset.id;
    const m = S.mediaItems.find(x => x.id === id);
    if (m) {
      m.muted = !m.muted;
      renderMediaLists();
      drawTL();
      const vidEl = $("#pvMediaVideo");
      if (vidEl) vidEl.muted = !!m.muted;
    }
    return;
  }
});

// Suporte adicional a upload de áudio musical
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
    const freqs = [523.25, 659.25, 783.99, 1046.50];
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
    console.warn("Chime Web Audio:", err);
  }
}

// NOTIFICAÇÃO COMPLETA: SOM, ALERTA VISUAL NO TÍTULO, MODAL E DOWNLOAD DIRETO
function notifyVideoReady(outUrl) {
  playSuccessChime();

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

  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification("Edvid — Vídeo Pronto!", {
        body: "Sua edição foi renderizada com sucesso.",
        silent: true
      });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }

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
  S._subChunksValid = false;
  $("#trStatus").textContent = `${S.segs.length} trechos transcritos ✓`;
  renderTranscriptList();
  const pvCam = $("#pv");
  updateSubtitleOverlayAtTime(pvCam ? pvCam.currentTime : 0);
};

// ========================================================
// FUNÇÃO CENTRALIZADA DE RENDERIZAÇÃO E RE-EDIÇÃO
// ========================================================
async function executeRender(isQuickUpdate = false) {
  if (!S.vid) return alert("Envie um vídeo na aba Corte primeiro.");
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  const btnEstilo = $("#renderBtn");
  const btnVisual = $("#btnReRenderVisual");
  const btnPrompt = $("#btnPromptRender");
  const statEstilo = $("#rStatus");
  const statVisual = $("#visualReRenderStatus");
  const pvrStatus = $("#pvrPromptStatus");

  if (btnEstilo) btnEstilo.disabled = true;
  if (btnVisual) {
    btnVisual.disabled = true;
    btnVisual.textContent = "Renderizando alterações... ⏳";
  }
  if (btnPrompt) {
    btnPrompt.disabled = true;
    btnPrompt.textContent = "⏳ Renderizando vídeo (1:1)...";
  }
  if (pvrStatus) pvrStatus.textContent = "Renderizando vídeo com alta fidelidade (1:1)...";
  if (statEstilo) statEstilo.textContent = "Renderizando vídeo... (aplicando legendas, headline e mídias)";
  if (statVisual) statVisual.textContent = "Processando nova versão do vídeo... ⏳";

  try {
    const hlVal = ($("#visualHlText") && $("#visualHlText").value.trim()) || ($("#hlText") && $("#hlText").value.trim()) || "";

    const r = await post("/export", {
      video_id: S.vid,
      tipo: S.tipo,
      segments: S.segs,
      caption_style: S.cap,
      caption_disabled: !!S.captionDisabled || (S.cap === "nenhuma"),
      headline: hlVal,
      headline_style: S.hl,
      headline_start: S.hlStart || 0,
      headline_end: S.hlEnd || 0,
      headline_pos: S.hlPos || "topo",
      hl_pos_x: (S.hlPosX !== undefined ? S.hlPosX : 50) / 100.0,
      hl_pos_y: (S.hlPosY !== undefined ? S.hlPosY : 22.5) / 100.0,
      hl_scale: S.hlScale || 1.0,
      hl_mode: S.hlMode || "text",
      headline_template_id: S.hlTemplate ? S.hlTemplate.template_id : null,
      hl_bold: !!S.hlBold,
      hl_italic: !!S.hlItalic,
      hl_underline: !!S.hlUnderline,
      hl_uppercase: !!S.hlUppercase,
      hl_text_color: S.hlTextColor || "#ffffff",
      hl_outline_color: S.hlOutlineColor || "#000000",
      hl_color1: S.hlTextColor || "#ffffff",
      sub_pos_x: (S.subPosX !== undefined ? S.subPosX : 50) / 100.0,
      sub_pos_y: (S.subPosY !== undefined ? S.subPosY : 77.0) / 100.0,
      sub_scale: S.subScale || 1.0,
      framing_x: (S.framingX !== undefined ? S.framingX : 50) / 100.0,
      framing_y: (S.framingY !== undefined ? S.framingY : 10) / 100.0,
      framing_x2: (S.framingX2 !== undefined ? S.framingX2 : 50) / 100.0,
      framing_y2: (S.framingY2 !== undefined ? S.framingY2 : 50) / 100.0,
      media_items: S.mediaItems.map(m => ({
        file_id: m.file_id,
        start: m.start || 0,
        end: m.end || (S.dur || 10),
        framing_x: (m.framing_x !== undefined ? m.framing_x : S.framingX2) / 100.0,
        framing_y: (m.framing_y !== undefined ? m.framing_y : S.framingY2) / 100.0,
        muted: !!m.muted,
        volume: m.volume !== undefined ? m.volume : 1.0
      })),
      cut_silence: !!S.el.cutSilence,
      zoom_continuous: !!S.el.zoomC,
      zoom_cuts: !!S.el.zoomCuts,
      flash_cuts: !!S.el.flash,
      tracking: !!S.el.tracking,
      music_id: S.el.music ? S.music : null,
      music_volume: $("#musicVol") ? $("#musicVol").value : 0.15,
    });

    if (r.error) {
      if (statEstilo) statEstilo.textContent = "Erro: " + r.error;
      if (statVisual) statVisual.textContent = "Erro: " + r.error;
      if (pvrStatus) pvrStatus.textContent = "Erro: " + r.error;
      console.error(r.detail);
      return;
    }

    const outUrl = "/output/" + r.output + "?t=" + Date.now();
    S.renderedUrl = outUrl;

    const dpsBadge = $("#dpsRenderBadge");
    if (dpsBadge) {
      dpsBadge.textContent = "✓ Pronto";
      dpsBadge.classList.add("ready");
    }

    // Ativa exibição do vídeo renderizado no player dedicado full frame (100%)
    setVideoViewMode("rendered");

    if (prevPlayer) {
      prevPlayer.src = outUrl;
      const badge = $("#playerBadge");
      if (badge) badge.textContent = "Renderizado ✓";
    }

    if (statEstilo) statEstilo.textContent = "Pronto ✓";
    if (statVisual) {
      statVisual.textContent = "✓ Edição atualizada com sucesso!";
      setTimeout(() => { if (statVisual) statVisual.textContent = ""; }, 4000);
    }
    if (pvrStatus) pvrStatus.textContent = "";

    notifyVideoReady(outUrl);
  } catch (err) {
    const msg = err.message || err;
    if (statEstilo) statEstilo.textContent = "Erro: " + msg;
    if (statVisual) statVisual.textContent = "Erro: " + msg;
    if (pvrStatus) pvrStatus.textContent = "Erro: " + msg;
    console.error("Falha ao exportar:", err);
  } finally {
    if (btnEstilo) btnEstilo.disabled = false;
    if (btnVisual) {
      btnVisual.disabled = false;
      btnVisual.textContent = "⚡ Atualizar e Re-renderizar Vídeo";
    }
    if (btnPrompt) {
      btnPrompt.disabled = false;
      btnPrompt.textContent = "⚡ Gerar Visualização Final Agora";
    }
  }
}

$("#renderBtn").onclick = () => executeRender(false);

const btnReRenderVisual = $("#btnReRenderVisual");
if (btnReRenderVisual) {
  btnReRenderVisual.onclick = () => executeRender(true);
}

// ========================================================
// SISTEMA DE DUPLO PREVIEW (EDIÇÃO VS. RENDERIZAÇÃO FINAL 1:1)
// Alterna instantaneamente entre o Canvas Ativo (60 FPS interativo)
// e o Vídeo Renderizado Final em Alta Fidelidade (1:1 MP4)
// ========================================================
function setVideoViewMode(mode) {
  S.viewMode = mode;
  const pvCam = $("#pv");
  const pvFull = $("#pvRenderedFull");
  const splitView = $("#interactiveSplitView");
  const splitGuide = $("#splitGuideLine");
  const hlOverlay = $("#hlPreviewOverlay");
  const subOverlay = $("#subPreviewOverlay");
  const pvLabel = $("#pvLabel");
  const medVideo = $("#pvMediaVideo");
  const dpsEdit = $("#dpsBtnEdit");
  const dpsRender = $("#dpsBtnRender");
  const pvrPrompt = $("#pvRenderPrompt");
  const togBtn = $("#btnToggleVideoView");

  if (mode === "rendered") {
    if (dpsRender) dpsRender.classList.add("on");
    if (dpsEdit) dpsEdit.classList.remove("on");

    if (splitView) splitView.style.display = "none";
    if (splitGuide) splitGuide.style.display = "none";
    if (hlOverlay) hlOverlay.style.display = "none";
    if (subOverlay) subOverlay.style.display = "none";

    if (S.renderedUrl) {
      if (pvrPrompt) pvrPrompt.style.display = "none";
      let syncTime = 0;
      if (pvCam) {
        if (!pvCam.paused) pvCam.pause();
        syncTime = pvCam.currentTime || 0;
      }
      if (medVideo && !medVideo.paused) medVideo.pause();

      if (pvFull) {
        if (pvFull.src !== S.renderedUrl) {
          pvFull.src = S.renderedUrl;
        }
        if (Number.isFinite(syncTime)) {
          pvFull.currentTime = syncTime;
        }
        pvFull.style.display = "block";
      }
      if (pvLabel) pvLabel.textContent = "Renderizado (1:1) ✓";
    } else {
      // Vídeo ainda não renderizado: exibe tela de prompt CTA para renderizar
      if (pvFull) {
        if (!pvFull.paused) pvFull.pause();
        pvFull.style.display = "none";
      }
      if (pvrPrompt) pvrPrompt.style.display = "flex";
      if (pvLabel) pvLabel.textContent = "Visualização Final (1:1)";
    }

    if (togBtn) {
      togBtn.textContent = "👁️ Renderizado";
      togBtn.classList.add("is-active");
    }
  } else {
    // Modo Edição (Canvas Interativo)
    if (dpsEdit) dpsEdit.classList.add("on");
    if (dpsRender) dpsRender.classList.remove("on");
    if (pvrPrompt) pvrPrompt.style.display = "none";

    let syncTime = null;
    if (pvFull) {
      if (!pvFull.paused) pvFull.pause();
      if (Number.isFinite(pvFull.currentTime) && pvFull.currentTime > 0) {
        syncTime = pvFull.currentTime;
      }
      pvFull.style.display = "none";
    }

    if (splitView) splitView.style.display = "flex";
    if (splitGuide) splitGuide.style.display = (S.tipo !== "unica") ? "block" : "none";

    if (pvCam) {
      // Garante que o slot da câmera NUNCA toque o arquivo renderizado, tocando unicamente o vídeo original
      if (S.originalUrl && pvCam.src !== S.originalUrl) {
        pvCam.src = S.originalUrl;
      }
      if (syncTime !== null) {
        pvCam.currentTime = syncTime;
      }
    }

    if (togBtn) {
      togBtn.textContent = "🎬 Modo Edição";
      togBtn.classList.remove("is-active");
    }
    if (pvLabel) pvLabel.textContent = "Modo Edição";

    updateHeadlineOverlay();
    const curT = (pvCam ? pvCam.currentTime : 0);
    updateSubtitleOverlayAtTime(curT);
    applyObjectPositions();
  }
}

// BINDINGS DO DUPLO PREVIEW
const dpsBtnEdit = $("#dpsBtnEdit");
if (dpsBtnEdit) {
  dpsBtnEdit.onclick = () => setVideoViewMode("original");
}
const dpsBtnRender = $("#dpsBtnRender");
if (dpsBtnRender) {
  dpsBtnRender.onclick = () => setVideoViewMode("rendered");
}
const btnPromptRender = $("#btnPromptRender");
if (btnPromptRender) {
  btnPromptRender.onclick = () => {
    executeRender(true);
  };
}
const btnToggleVideoView = $("#btnToggleVideoView");
if (btnToggleVideoView) {
  btnToggleVideoView.onclick = () => {
    if (S.viewMode === "rendered") {
      setVideoViewMode("original");
    } else {
      setVideoViewMode("rendered");
    }
  };
}

// ========================================================
// TIMELINE PROFISSIONAL DE 7 FAIXAS (COM MÍDIAS DRAGGABLE)
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

  // 2. Subtítulos
  const words = S.segs.flatMap(g => (g.words && g.words.length) ? g.words.map(w => [w.start, w.end, w.word]) : [[g.start, g.end, g.text]]);

  // 3. Cenas / Cortes com nomes de roteiro
  const bounds = [0, ...S.cuts, d];
  const scenesHtml = bounds.slice(0, -1).map((b, i) => {
    const sName = SCENE_NAMES[i % SCENE_NAMES.length] || `Cena ${i + 1}`;
    return chip(b, bounds[i + 1], sName);
  }).join("");

  // 4. Headline (Texto ou Modelo Customizado de Upload)
  const isFileMode = S.hlMode === "file";
  const hasTemplate = S.hlTemplate && S.hlTemplate.url;
  const hlText = ($("#visualHlText") && $("#visualHlText").value.trim()) || ($("#hlText") && $("#hlText").value.trim()) || "";

  let showHlTrack = false;
  let isTemplateHl = false;
  let hlLabel = "";

  if (isFileMode || hasTemplate) {
    showHlTrack = true;
    isTemplateHl = true;
    hlLabel = hasTemplate ? (S.hlTemplate.filename || "Modelo de Headline") : "📁 Suba um Modelo de Headline";
  } else if (hlText) {
    showHlTrack = true;
    hlLabel = hlText;
  }

  const hlStart = Math.max(0, S.hlStart !== undefined ? S.hlStart : 0);
  const hlEnd = (S.hlEnd && S.hlEnd > hlStart) ? Math.min(d, S.hlEnd) : d;
  const hlWidth = Math.max(28, (hlEnd - hlStart) * pps);

  // 5. Mídias / Imagens na Timeline (Faixa 6)
  let mediaHtml = "";
  if (S.mediaItems.length > 0) {
    mediaHtml = S.mediaItems.map(m => `
      <u class="media-bar" data-id="${m.id}" style="left:${m.start * pps}px;width:${Math.max(20, (m.end - m.start) * pps)}px;" title="${m.name} (${m.start.toFixed(1)}s - ${m.end.toFixed(1)}s)">
        <span class="media-handle media-handle-l" data-id="${m.id}" title="Puxar para alterar início"></span>
        <span class="media-label-text">${m.is_img ? '🖼' : '🎬'} ${m.name}</span>
        ${!m.is_img ? `<span class="media-audio-toggle-btn ${m.muted ? 'is-muted' : ''}" data-id="${m.id}" title="${m.muted ? 'Mutado (Clique para ativar áudio)' : 'Com áudio (Clique para mutar)'}">${m.muted ? '🔇' : '🔊'}</span>` : ''}
        <span class="media-del-btn" data-id="${m.id}" title="Retirar este arquivo">✕</span>
        <span class="media-handle media-handle-r" data-id="${m.id}" title="Puxar para alterar fim / duração"></span>
      </u>
    `).join("");
  } else if (S.tipo !== "unica") {
    mediaHtml = `<u style="left:4px;width:150px;background:#20140c;border:1px dashed #f97316;color:#fed7aa;cursor:pointer;font-size:10px;text-align:center;line-height:24px;border-radius:4px;" id="tlAddMediaPrompt">+ Adicionar Mídias</u>`;
  }

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
    <!-- Faixa 5: Headline em âmbar/laranja com barra arrastável e trim -->
    <div class="trk hl" id="trkHl">
      ${showHlTrack ? `
        <u class="hl-bar ${isTemplateHl ? 'hl-bar-template' : ''}" id="hlBar" 
           style="left:${hlStart * pps}px;width:${hlWidth}px;cursor:grab;" 
           title="${isTemplateHl ? 'Modelo de Headline' : 'Headline'}: ${hlStart.toFixed(1)}s a ${hlEnd.toFixed(1)}s. Puxe as bordas para aparar/cortar a exibição ou arraste o corpo para mover.">
          <span class="hl-handle hl-handle-l" title="Arrastar para alterar início"></span>
          ${isTemplateHl && hasTemplate ? `<span class="hl-thumb-mini"><img src="${S.hlTemplate.url}" alt=""></span>` : ''}
          <span class="hl-label-text">${isTemplateHl ? '🖼️ ' : '🏷️ '}${hlLabel}</span>
          <span class="hl-time-badge">${hlStart.toFixed(1)}s–${hlEnd.toFixed(1)}s</span>
          ${isTemplateHl && hasTemplate ? `<span class="hl-del-btn" id="tlDelHlBtn" title="Remover modelo de headline">✕</span>` : ''}
          <span class="hl-handle hl-handle-r" title="Arrastar para aparar/cortar fim (duração)"></span>
        </u>
      ` : `
        <span class="tl-add-hl-prompt" id="tlAddHlPrompt" title="Adicionar Headline ou Subir Modelo">
          <span>+</span> Adicionar Headline / Subir Modelo
        </span>
      `}
    </div>
    <!-- Faixa 6: Mídia B-roll / Imagens da tela dividida -->
    <div class="trk media">${mediaHtml}</div>
    <!-- Faixa 7: Trilha sonora listrada -->
    <div class="trk mu">${S.el.music ? chip(0, d, "trilha.mp3 - vol: " + ($("#musicVol") ? $("#musicVol").value : "0.15")) : ""}</div>
    <div id="ph"></div>
  `;

  const tlPrompt = $("#tlAddMediaPrompt");
  if (tlPrompt && mediaUploadInput) {
    tlPrompt.onclick = () => mediaUploadInput.click();
  }

  const delHlBtn = $("#tlDelHlBtn");
  if (delHlBtn) {
    delHlBtn.onclick = e => {
      e.stopPropagation();
      removeHlTemplate();
    };
  }

  const tlHlPrompt = $("#tlAddHlPrompt");
  if (tlHlPrompt) {
    tlHlPrompt.onclick = () => {
      if (S.hlMode === "file" && hlTemplateInput) {
        hlTemplateInput.click();
      } else {
        const inp = $("#visualHlText") || $("#hlText");
        if (inp) {
          inp.focus();
          inp.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    };
  }

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
      for (let x = 0; x < W; x += 4) {
        const h = Math.sin(x * 0.05) * 8 + 12;
        c.fillRect(x, 17 - h / 2, 2, h);
      }
    }
  }
}

// INTERAÇÕES DA TIMELINE (SEEK)
const tl_seek = e => {
  if (e.target.closest("#hlBar") || e.target.closest(".hl-handle") || e.target.closest("#tlDelHlBtn") ||
      e.target.closest(".media-bar") || e.target.closest(".media-handle") || e.target.closest(".media-del-btn")) return;
  const tl = $("#tl");
  if (!tl) return;
  const x = e.clientX - tl.getBoundingClientRect().left;
  const seekTime = Math.max(0, x / S.pps);
  const pvFull = $("#pvRenderedFull");
  if (pv) pv.currentTime = seekTime;
  if (pvFull) pvFull.currentTime = seekTime;
  if (prevPlayer) prevPlayer.currentTime = seekTime;
  highlightActiveSegment(seekTime, true);
  if (S.viewMode !== "rendered") {
    updateMediaPreviewAtTime(seekTime);
    updateSubtitleOverlayAtTime(seekTime);
    updateHeadlineOverlay(seekTime);
  }
};

// ========================================================
// CONTROLE DE ENQUADRAMENTO 2D (DIRETO NO CANVAS DE PREVIEW)
// Resposta visual 100% instantânea em tempo real (cima, baixo e lados)
// ========================================================
function applyObjectPositions() {
  const camX = S.framingX !== undefined ? S.framingX : 50;
  const camY = S.framingY !== undefined ? S.framingY : 10;
  if (pv) pv.style.objectPosition = `${camX}% ${camY}%`;
  if (prevPlayer) prevPlayer.style.objectPosition = `${camX}% ${camY}%`;

  const medX = S.framingX2 !== undefined ? S.framingX2 : 50;
  const medY = S.framingY2 !== undefined ? S.framingY2 : 50;
  const medImg = $("#pvMediaImg"), medVid = $("#pvMediaVideo");
  if (medImg) medImg.style.objectPosition = `${medX}% ${medY}%`;
  if (medVid) medVid.style.objectPosition = `${medX}% ${medY}%`;
}

function setFramingX(val) {
  if (S.viewMode === "rendered") setVideoViewMode("original");
  const x = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
  S.framingX = x;
  const slider = $("#framingRangeX");
  if (slider && parseInt(slider.value, 10) !== x) slider.value = x;
  const textEl = $("#framingValXText");
  if (textEl) textEl.textContent = `${x}%`;

  const valSpan = $("#visualFramingYVal");
  if (valSpan) {
    valSpan.textContent = (S.tipo !== 'unica' ? 'Câmera 60%: ' : 'Câmera: ') + `X ${S.framingX}% · Y ${S.framingY}%`;
  }
  const overlayText = $("#framingOverlayText");
  if (overlayText) {
    overlayText.textContent = `↕ ↔ Câmera (${S.tipo !== 'unica' ? '60%' : '100%'}): X ${S.framingX}% | Y ${S.framingY}%`;
  }
  applyObjectPositions();
}

function setFramingY(val) {
  if (S.viewMode === "rendered") setVideoViewMode("original");
  const y = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
  S.framingY = y;
  const slider = $("#framingRangeY");
  if (slider && parseInt(slider.value, 10) !== y) slider.value = y;
  const textEl = $("#framingValYText");
  if (textEl) textEl.textContent = `${y}%`;

  const valSpan = $("#visualFramingYVal");
  if (valSpan) {
    valSpan.textContent = (S.tipo !== 'unica' ? 'Câmera 60%: ' : 'Câmera: ') + `X ${S.framingX}% · Y ${S.framingY}%`;
  }
  const overlayText = $("#framingOverlayText");
  if (overlayText) {
    overlayText.textContent = `↕ ↔ Câmera (${S.tipo !== 'unica' ? '60%' : '100%'}): X ${S.framingX}% | Y ${S.framingY}%`;
  }
  applyObjectPositions();
}

// Suporta tanto setFraming(y) do HTML antigo quanto setFraming(x, y)
function setFraming(val1, val2) {
  if (val2 === undefined) {
    setFramingY(val1);
  } else {
    setFramingX(val1);
    setFramingY(val2);
  }
}

function setMediaFramingX(val) {
  if (S.viewMode === "rendered") setVideoViewMode("original");
  const x = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
  S.framingX2 = x;
  const slider = $("#mediaFramingRangeX");
  if (slider && parseInt(slider.value, 10) !== x) slider.value = x;
  const textEl = $("#mediaFramingValXText");
  if (textEl) textEl.textContent = `${x}%`;

  const curT = pv ? pv.currentTime : (prevPlayer ? prevPlayer.currentTime : 0);
  const activeM = S.mediaItems.find(m => curT >= m.start && curT <= m.end) || S.mediaItems[0];
  if (activeM) activeM.framing_x = x;

  const valSpan = $("#visualMediaFramingYVal");
  if (valSpan) {
    valSpan.textContent = `Mídia 40%: X ${S.framingX2}% · Y ${S.framingY2}%`;
  }
  const overlayText = $("#framingOverlayText");
  if (overlayText) {
    overlayText.textContent = `↕ ↔ Mídia (40%): X ${S.framingX2}% | Y ${S.framingY2}%`;
  }
  applyObjectPositions();
}

function setMediaFramingY(val) {
  if (S.viewMode === "rendered") setVideoViewMode("original");
  const y = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
  S.framingY2 = y;
  const slider = $("#mediaFramingRangeY");
  if (slider && parseInt(slider.value, 10) !== y) slider.value = y;
  const textEl = $("#mediaFramingValYText");
  if (textEl) textEl.textContent = `${y}%`;

  const curT = pv ? pv.currentTime : (prevPlayer ? prevPlayer.currentTime : 0);
  const activeM = S.mediaItems.find(m => curT >= m.start && curT <= m.end) || S.mediaItems[0];
  if (activeM) activeM.framing_y = y;

  const valSpan = $("#visualMediaFramingYVal");
  if (valSpan) {
    valSpan.textContent = `Mídia 40%: X ${S.framingX2}% · Y ${S.framingY2}%`;
  }
  const overlayText = $("#framingOverlayText");
  if (overlayText) {
    overlayText.textContent = `↕ ↔ Mídia (40%): X ${S.framingX2}% | Y ${S.framingY2}%`;
  }
  applyObjectPositions();
}

// Suporta tanto setMediaFraming(y) do HTML antigo quanto setMediaFraming(x, y)
function setMediaFraming(val1, val2) {
  if (val2 === undefined) {
    setMediaFramingY(val1);
  } else {
    setMediaFramingX(val1);
    setMediaFramingY(val2);
  }
}

// Exporta para escopo global do browser para receber eventos HTML inline
window.applyObjectPositions = applyObjectPositions;
window.setFraming = setFraming;
window.setFramingX = setFramingX;
window.setFramingY = setFramingY;
window.setMediaFraming = setMediaFraming;
window.setMediaFramingX = setMediaFramingX;
window.setMediaFramingY = setMediaFramingY;

// Sincroniza exibição da mídia no slot em tempo real de acordo com a timeline
function updateMediaPreviewAtTime(curTime) {
  const imgEl = $("#pvMediaImg");
  const vidEl = $("#pvMediaVideo");
  const emptyEl = $("#pvMediaEmpty");
  if (!imgEl || !vidEl) return;

  if (S.tipo === "unica") {
    imgEl.style.display = "none";
    if (!vidEl.paused) vidEl.pause();
    vidEl.style.display = "none";
    if (emptyEl) emptyEl.style.display = "none";
    return;
  }

  if (!S.mediaItems || S.mediaItems.length === 0) {
    imgEl.style.display = "none";
    if (!vidEl.paused) vidEl.pause();
    vidEl.style.display = "none";
    if (emptyEl) {
      emptyEl.style.display = "block";
      emptyEl.textContent = "🖼️ Mídia (40%)";
    }
    return;
  }

  const activeItem = S.mediaItems.find(m => curTime >= m.start && curTime <= m.end);
  if (!activeItem) {
    imgEl.style.display = "none";
    if (!vidEl.paused) vidEl.pause();
    vidEl.style.display = "none";
    if (emptyEl) {
      emptyEl.style.display = "block";
      emptyEl.textContent = "Sem mídia neste trecho";
    }
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";
  const fx = activeItem.framing_x !== undefined ? activeItem.framing_x : (S.framingX2 || 50);
  const fy = activeItem.framing_y !== undefined ? activeItem.framing_y : (S.framingY2 || 50);

  if (activeItem.is_img) {
    if (!vidEl.paused) vidEl.pause();
    vidEl.style.display = "none";

    // Só reatribui o src se a URL mudar (evita recarregar a cada frame)
    if (imgEl.dataset.currentUrl !== activeItem.url) {
      imgEl.dataset.currentUrl = activeItem.url;
      imgEl.src = activeItem.url;
    }
    imgEl.style.display = "block";
    imgEl.style.objectPosition = `${100 - fx}% ${fy}%`;
  } else {
    imgEl.style.display = "none";

    // Correção crucial do bug de tela preta:
    // Nunca reatribuir vidEl.src a cada frame (isso resetava o decoder 60x/segundo)
    if (vidEl.dataset.currentUrl !== activeItem.url) {
      vidEl.dataset.currentUrl = activeItem.url;
      vidEl.src = activeItem.url;
      vidEl.load();
    }
    vidEl.style.display = "block";
    vidEl.style.objectPosition = `${100 - fx}% ${fy}%`;

    // Sincronização de reprodução com o player principal
    const relT = Math.max(0, curTime - activeItem.start);
    const mainPlayer = pv || prevPlayer;
    const isMainPaused = mainPlayer ? mainPlayer.paused : true;

    if (isMainPaused) {
      if (!vidEl.paused) vidEl.pause();
      if (Math.abs(vidEl.currentTime - relT) > 0.1) {
        vidEl.currentTime = relT;
      }
    } else {
      if (Math.abs(vidEl.currentTime - relT) > 0.25) {
        vidEl.currentTime = relT;
      }
      if (vidEl.paused) {
        vidEl.play().catch(() => {});
      }
    }

    // Controle de áudio da mídia
    vidEl.muted = !!activeItem.muted;
    vidEl.volume = (activeItem.volume !== undefined) ? activeItem.volume : 1.0;
  }
}

// ========================================================
// MANIPULAÇÃO DIRETA 2D NO CANVAS DE PREVIEW (INSTANTÂNEA)
// ========================================================
function enable2DFramingDrag() {
  const phone = $("#phoneFrame");
  if (!phone) return;
  const overlay = $("#framingOverlay");
  let dragging = false;
  let startX = 0, startY = 0;
  let startValX = 50, startValY = 10;
  let activeTarget = "camera";
  let activeSlotEl = null;
  let overlayTimer = null;

  const onDown = (clientX, clientY, target) => {
    if (S.viewMode === "rendered") setVideoViewMode("original");
    dragging = true;
    startX = clientX;
    startY = clientY;
    activeTarget = target;

    if (activeTarget === "camera") {
      startValX = S.framingX !== undefined ? S.framingX : 50;
      startValY = S.framingY !== undefined ? S.framingY : 10;
      activeSlotEl = $("#previewSlotCam");
    } else {
      startValX = S.framingX2 !== undefined ? S.framingX2 : 50;
      startValY = S.framingY2 !== undefined ? S.framingY2 : 50;
      activeSlotEl = $("#previewSlotMedia");
    }

    if (activeSlotEl) activeSlotEl.classList.add("is-dragging");

    if (overlay) {
      clearTimeout(overlayTimer);
      overlay.style.display = "block";
      const overlayText = $("#framingOverlayText");
      if (overlayText) {
        overlayText.textContent = (activeTarget === 'camera')
          ? `↕ ↔ Ajustando Câmera (${S.tipo !== 'unica' ? '60%' : '100%'}): X ${startValX}% | Y ${startValY}%`
          : `↕ ↔ Ajustando Mídia (40%): X ${startValX}% | Y ${startValY}%`;
      }
    }
  };

  const onMove = (clientX, clientY) => {
    if (!dragging) return;
    const dx = clientX - startX;
    const dy = clientY - startY;

    // Resposta instantânea e intuitiva com sensibilidade precisa
    const deltaX = Math.round(dx / 2.5);
    const deltaY = Math.round(dy / 2.5);

    const newX = Math.max(0, Math.min(100, Math.round(startValX - deltaX)));
    const newY = Math.max(0, Math.min(100, Math.round(startValY - deltaY)));

    if (activeTarget === "camera") {
      setFraming(newX, newY);
    } else {
      setMediaFraming(newX, newY);
    }
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    if (activeSlotEl) {
      activeSlotEl.classList.remove("is-dragging");
      activeSlotEl = null;
    }
    if (overlay) {
      overlayTimer = setTimeout(() => { overlay.style.display = "none"; }, 1400);
    }
  };

  const determineTarget = (targetEl, clientY) => {
    if (targetEl && targetEl.closest("#previewSlotMedia")) return "media";
    if (targetEl && targetEl.closest("#previewSlotCam")) return "camera";
    const rect = phone.getBoundingClientRect();
    const relY = (clientY - rect.top) / rect.height;
    if (S.tipo === "dividida") {
      return (relY < 0.40) ? "media" : "camera";
    } else if (S.tipo === "dividida2") {
      return (relY < 0.60) ? "camera" : "media";
    }
    return "camera";
  };

  phone.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    if (e.target.closest("#btnToggleVideoView") || e.target.closest(".phone-speaker-notch") || e.target.closest(".canvas-item-overlay")) return;
    const target = determineTarget(e.target, e.clientY);
    onDown(e.clientX, e.clientY, target);
  });

  window.addEventListener("mousemove", e => {
    if (dragging) onMove(e.clientX, e.clientY);
  });
  window.addEventListener("mouseup", onUp);

  phone.addEventListener("touchstart", e => {
    if (e.touches.length === 1) {
      if (e.target.closest("#btnToggleVideoView") || e.target.closest(".canvas-item-overlay")) return;
      const t = e.touches[0];
      const target = determineTarget(e.target, t.clientY);
      onDown(t.clientX, t.clientY, target);
    }
  }, { passive: true });

  window.addEventListener("touchmove", e => {
    if (dragging && e.touches.length === 1) {
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  window.addEventListener("touchend", onUp);
}

enable2DFramingDrag();

// ========================================================
// ALTERNÂNCIA CLARA DE HEADLINE (TEXTO NATIVO VS MODELO / TEMPLATE)
// ========================================================
function updateHeadlineTimingDisplay() {
  const d = S.dur || 10;
  const start = Math.max(0, S.hlStart !== undefined ? S.hlStart : 0);
  const end = (S.hlEnd && S.hlEnd > start) ? Math.min(d, S.hlEnd) : d;
  const timingVal = $("#visualHlTimingVal");
  if (timingVal) {
    const isFull = (start === 0 && end >= d - 0.1);
    timingVal.textContent = isFull ? "Vídeo Todo" : `${start.toFixed(1)}s – ${end.toFixed(1)}s (${(end - start).toFixed(1)}s)`;
  }
}

function setHlMode(mode) {
  if (S.viewMode === "rendered") setVideoViewMode("original");
  S.hlMode = mode;
  document.querySelectorAll(".hl-mode-btn, .visual-hl-mode-btn").forEach(btn => {
    btn.classList.toggle("on", btn.dataset.mode === mode);
  });

  const textPanel1 = $("#hlTextModePanel"), filePanel1 = $("#hlFileModePanel");
  if (textPanel1) textPanel1.style.display = (mode === "text") ? "block" : "none";
  if (filePanel1) filePanel1.style.display = (mode === "file") ? "block" : "none";

  const textPanel2 = $("#visualHlTextPanel"), filePanel2 = $("#visualHlFilePanel");
  if (textPanel2) textPanel2.style.display = (mode === "text") ? "block" : "none";
  if (filePanel2) filePanel2.style.display = (mode === "file") ? "block" : "none";

  updateHeadlineTimingDisplay();
  updateHeadlineOverlay();
  drawTL();
}

document.querySelectorAll(".hl-mode-btn, .visual-hl-mode-btn").forEach(btn => {
  btn.onclick = () => setHlMode(btn.dataset.mode);
});

// ========================================================
// CONTROLES DE HEADLINE (MANIPULAÇÃO DIRETA NO CANVAS 60 FPS)
// ========================================================
function updateHeadlineOverlay(curTime) {
  const overlay = $("#hlPreviewOverlay");
  if (!overlay) return;

  // No modo renderizado, o vídeo final já possui as legendas e headline queimadas
  if (S.viewMode === "rendered") {
    overlay.style.display = "none";
    return;
  }

  const hlVal = ($("#visualHlText") && $("#visualHlText").value.trim()) || ($("#hlText") && $("#hlText").value.trim()) || "";
  const hasTemplate = S.hlTemplate && S.hlTemplate.url;
  const isFileMode = S.hlMode === "file";

  // Se não há texto e não há modelo/arquivo, não exibe
  if (!isFileMode && !hlVal) {
    overlay.style.display = "none";
    return;
  }

  // Controle Temporal: Verifica se o vídeo está dentro da janela de exibição da Headline
  const time = (curTime !== undefined) ? curTime : (pv ? pv.currentTime : 0);
  const hStart = Math.max(0, S.hlStart !== undefined ? S.hlStart : 0);
  const d = S.dur || 10;
  const hEnd = (S.hlEnd && S.hlEnd > hStart) ? Math.min(d, S.hlEnd) : d;

  const isEditingHl = (isDragging && dragInfo && dragInfo.type && dragInfo.type.startsWith("hl-")) ||
                      (overlay.classList.contains("is-dragging") || overlay.classList.contains("is-selected"));

  // Se o playhead estiver fora do intervalo [hStart, hEnd] e o usuário não estiver manipulando o elemento, esconde
  if (!isEditingHl && (time < hStart || time > hEnd)) {
    overlay.style.display = "none";
    return;
  }

  overlay.style.display = "flex";
  if (!overlay.classList.contains("is-dragging")) {
    overlay.style.left = (S.hlPosX !== undefined ? S.hlPosX : 50) + "%";
    overlay.style.top = (S.hlPosY !== undefined ? S.hlPosY : 22.5) + "%";
  }
  // Escala sempre rigorosamente vinculada a S.hlScale
  overlay.style.transform = `translate(-50%, -50%) scale(${S.hlScale || 1.0})`;

  const curPct = Math.round((S.hlScale || 1.0) * 100);
  const visualRange = $("#visualHlScaleRange");
  if (visualRange && document.activeElement !== visualRange && +visualRange.value !== curPct) {
    visualRange.value = curPct;
  }
  const visualVal = $("#visualHlScaleVal");
  if (visualVal) visualVal.textContent = `${curPct}%`;

  const scaleLbl = $("#hlScaleLabel");
  if (scaleLbl) scaleLbl.textContent = `${curPct}%`;

  updateHeadlineTimingDisplay();

  const tplImg = $("#hlTemplateOverlayImg");
  const textSpan = $("#hlPreviewText");
  const hlBox = $("#hlBox");

  if (isFileMode) {
    if (textSpan) textSpan.style.display = "none";
    if (hasTemplate) {
      if (tplImg) {
        tplImg.src = S.hlTemplate.url;
        tplImg.style.display = "block";
      }
      if (hlBox) {
        hlBox.style.border = "1.5px dashed transparent";
        hlBox.style.background = "transparent";
      }
    } else {
      if (tplImg) tplImg.style.display = "none";
      if (textSpan) {
        textSpan.textContent = "📁 SUBA UM MODELO DE HEADLINE";
        textSpan.style.display = "block";
        textSpan.className = "hl-preview-text";
        textSpan.style.fontSize = "3.8cqw";
        textSpan.style.color = "#ffae66";
        textSpan.style.fontWeight = "700";
        textSpan.style.letterSpacing = "0.5px";
      }
      if (hlBox) {
        hlBox.style.border = "1.5px dashed rgba(255, 106, 0, 0.85)";
        hlBox.style.background = "rgba(0, 0, 0, 0.55)";
      }
    }
  } else {
    if (tplImg) tplImg.style.display = "none";
    if (textSpan) {
      const isPlaceholder = !hlVal;
      const textToDisplay = hlVal || "SUA HEADLINE AQUI";
      textSpan.textContent = S.hlUppercase ? textToDisplay.toUpperCase() : textToDisplay;
      textSpan.style.display = "block";

      const hlStyle = S.hl || "bebas_impact";
      textSpan.className = "hl-preview-text hl-style-" + hlStyle;

      const textColor = S.hlTextColor || "#ffffff";
      const outColor = S.hlOutlineColor || "#000000";

      textSpan.style.setProperty("--hl-text-color", textColor);
      textSpan.style.setProperty("--hl-out-color", outColor);

      textSpan.style.color = isPlaceholder ? "rgba(255, 255, 255, 0.8)" : textColor;
      textSpan.style.fontWeight = S.hlBold ? "900" : "400";
      textSpan.style.fontStyle = S.hlItalic ? "italic" : "normal";
      textSpan.style.textDecoration = S.hlUnderline ? "underline" : "none";
      textSpan.style.textTransform = S.hlUppercase ? "uppercase" : "none";

      if (hlBox) {
        if (isPlaceholder) {
          hlBox.style.border = "1.5px dashed rgba(255, 106, 0, 0.75)";
          hlBox.style.background = "rgba(0, 0, 0, 0.45)";
        } else {
          hlBox.style.border = "1.5px dashed transparent";
          hlBox.style.background = "transparent";
        }
      }
    }
  }
}

// ========================================================
// SISTEMA DE CHUNKING DE PALAVRAS VIRAL (1 A 3 PALAVRAS POR TELA)
// Réplica idêntica de chunk_words() e build_ass_subtitles() do backend
// Garante fidelidade visual 1:1 rigorosa entre modo Edição e Renderização
// ========================================================
function getSubtitleChunks() {
  if (!S.segs || !S.segs.length) return [];
  if (S._subChunks && S._subChunksValid) {
    return S._subChunks;
  }

  const allWords = [];
  for (const seg of S.segs) {
    if (seg.words && seg.words.length > 0) {
      for (const w of seg.words) {
        const txt = (w.word || "").trim();
        if (txt) {
          allWords.push({
            word: txt,
            start: +(w.start || 0),
            end: +(w.end || 0)
          });
        }
      }
    } else if (seg.text) {
      const wList = seg.text.trim().split(/\s+/).filter(Boolean);
      if (wList.length > 0) {
        const s = +(seg.start || 0);
        const e = +(seg.end || s + 1);
        const step = (e - s) / wList.length;
        wList.forEach((wStr, idx) => {
          allWords.push({
            word: wStr,
            start: +(s + idx * step),
            end: +(s + (idx + 1) * step)
          });
        });
      }
    }
  }

  // Chunker idêntico a chunk_words() no app.py (max_words=3, max_duration=1.25)
  const chunks = [];
  let cur = [];
  for (const w of allWords) {
    cur.push(w);
    const dur = cur[cur.length - 1].end - cur[0].start;
    if (cur.length >= 3 || dur >= 1.25) {
      chunks.push({
        words: cur,
        start: cur[0].start,
        end: cur[cur.length - 1].end
      });
      cur = [];
    }
  }
  if (cur.length > 0) {
    chunks.push({
      words: cur,
      start: cur[0].start,
      end: cur[cur.length - 1].end
    });
  }

  S._subChunks = chunks;
  S._subChunksValid = true;
  return chunks;
}

// ========================================================
// PREVIEW AO VIVO DE LEGENDA (MANIPULAÇÃO DIRETA NO CANVAS)
// Sincronização em tempo real com o vídeo e fidelidade 1:1 rigorosa
// ========================================================
function updateSubtitleOverlayAtTime(curTime) {
  const overlay = $("#subPreviewOverlay");
  if (!overlay) return;

  const isDisabled = !!S.captionDisabled || S.cap === "nenhuma";
  if (isDisabled || S.viewMode === "rendered") {
    overlay.style.display = "none";
    return;
  }

  overlay.style.display = "flex";
  if (!overlay.classList.contains("is-dragging")) {
    overlay.style.left = (S.subPosX !== undefined ? S.subPosX : 50) + "%";
    overlay.style.top = (S.subPosY !== undefined ? S.subPosY : 77.0) + "%";
  }
  // Escala sempre vinculada rigorosamente a S.subScale (NUNCA alterada ao arrastar)
  overlay.style.transform = `translate(-50%, -50%) scale(${S.subScale || 1.0})`;

  const curPct = Math.round((S.subScale || 1.0) * 100);
  const visualRange = $("#visualSubScaleRange");
  if (visualRange && document.activeElement !== visualRange && +visualRange.value !== curPct) {
    visualRange.value = curPct;
  }
  const visualVal = $("#visualSubScaleVal");
  if (visualVal) visualVal.textContent = `${curPct}%`;

  const scaleLbl = $("#subScaleLabel");
  if (scaleLbl) scaleLbl.textContent = `${curPct}%`;

  const contentEl = $("#subPreviewContent");
  if (!contentEl) return;

  const capStyle = S.cap || "hormozi";
  contentEl.className = "sub-preview-content sub-style-" + capStyle;

  const chunks = getSubtitleChunks();

  // Se não há legendas transcritas ainda, exibe placeholder limpo de 3 palavras
  if (!chunks || chunks.length === 0) {
    if (capStyle === "hormozi" || capStyle === "karaoke" || capStyle === "karaoke_neon") {
      contentEl.innerHTML = `<b>SUA</b> LEGENDA AQUI`;
    } else {
      contentEl.textContent = (capStyle === "destaque" || capStyle === "pop_destaque") ? "SUA LEGENDA AQUI" : "Sua Legenda Aqui";
    }
    return;
  }

  // Encontra o chunk ativo no timestamp curTime
  let activeChunk = chunks.find(c => curTime >= c.start && curTime <= c.end);
  let isExactTime = true;
  if (!activeChunk) {
    isExactTime = false;
    // Se estiver em pausa ou entre respiros, usa o trecho mais próximo para manter a referência visual contínua
    activeChunk = chunks.reduce((prev, curr) => {
      return (Math.abs(curr.start - curTime) < Math.abs(prev.start - curTime) ? curr : prev);
    }, chunks[0]);
  }

  if (!activeChunk || !activeChunk.words || !activeChunk.words.length) {
    contentEl.textContent = "";
    return;
  }

  const isUpper = (capStyle === "hormozi" || capStyle === "karaoke" || capStyle === "karaoke_neon" || capStyle === "destaque" || capStyle === "pop_destaque");

  // Formatação com base no estilo
  if (capStyle === "hormozi" || capStyle === "karaoke" || capStyle === "karaoke_neon") {
    let activeIdx = -1;
    if (isExactTime) {
      activeIdx = activeChunk.words.findIndex(w => curTime >= w.start && curTime <= w.end);
    }
    // Se pausado ou antes do início, destaca a primeira palavra como referência WYSIWYG
    if (activeIdx === -1) activeIdx = 0;

    const htmlWords = activeChunk.words.map((w, idx) => {
      const raw = isUpper ? w.word.toUpperCase() : w.word;
      if (idx === activeIdx) {
        return `<b>${raw}</b>`;
      }
      return raw;
    });

    contentEl.innerHTML = htmlWords.join(" ");
  } else {
    const text = activeChunk.words.map(w => isUpper ? w.word.toUpperCase() : w.word).join(" ");
    contentEl.textContent = text;
  }
}

// ========================================================
// MOTOR UNIFICADO DE ARRASTAR E REDIMENSIONAR NO CANVAS (60 FPS)
// Suporta Headline e Legenda com mouse e touch instantâneos
// ========================================================
function initCanvasDirectControls() {
  const phone = $("#phoneFrame");
  if (!phone) return;

  function setupItem(overlayId, type) {
    const overlay = $(overlayId);
    if (!overlay) return;

    const box = overlay.querySelector(".canvas-item-box");
    const dragTarget = box || overlay;

    // Arrastar Livremente Posição X e Y (Corpo da Legenda / Headline)
    // EXCLUSIVAMENTE altera posição X e Y (NUNCA altera tamanho ou escala!)
    const onDragPointerDown = (e) => {
      if (e.target.closest("button") || e.target.closest("input")) return;
      e.stopPropagation();
      e.preventDefault();

      const dragStartX = e.clientX;
      const dragStartY = e.clientY;
      const initialPosX = (type === "headline" ? (S.hlPosX !== undefined ? S.hlPosX : 50) : (S.subPosX !== undefined ? S.subPosX : 50));
      const initialPosY = (type === "headline" ? (S.hlPosY !== undefined ? S.hlPosY : 22.5) : (S.subPosY !== undefined ? S.subPosY : 77.0));

      overlay.classList.add("is-dragging");
      document.querySelectorAll(".canvas-item-overlay").forEach(o => o.classList.remove("is-selected"));
      overlay.classList.add("is-selected");

      try { dragTarget.setPointerCapture(e.pointerId); } catch (_) {}

      const onDragPointerMove = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();

        const rect = phone.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const dxPercent = ((ev.clientX - dragStartX) / rect.width) * 100;
        const dyPercent = ((ev.clientY - dragStartY) / rect.height) * 100;

        const newX = Math.max(5, Math.min(95, Math.round((initialPosX + dxPercent) * 10) / 10));
        const newY = Math.max(5, Math.min(95, Math.round((initialPosY + dyPercent) * 10) / 10));

        overlay.style.left = newX + "%";
        overlay.style.top = newY + "%";
        // CRÍTICO: SOMENTE POSIÇÃO É ATUALIZADA. ESCALA NUNCA É ALTERADA!
        const curScale = (type === "headline" ? (S.hlScale || 1.0) : (S.subScale || 1.0));
        overlay.style.transform = `translate(-50%, -50%) scale(${curScale})`;

        if (type === "headline") {
          S.hlPosX = newX;
          S.hlPosY = newY;
        } else {
          S.subPosX = newX;
          S.subPosY = newY;
        }
      };

      const onDragPointerUp = (ev) => {
        overlay.classList.remove("is-dragging");
        try { dragTarget.releasePointerCapture(ev.pointerId); } catch (_) {}
        window.removeEventListener("pointermove", onDragPointerMove);
        window.removeEventListener("pointerup", onDragPointerUp);
        window.removeEventListener("pointercancel", onDragPointerUp);
      };

      window.addEventListener("pointermove", onDragPointerMove);
      window.addEventListener("pointerup", onDragPointerUp);
      window.addEventListener("pointercancel", onDragPointerUp);
    };

    dragTarget.onpointerdown = onDragPointerDown;
  }

  setupItem("#hlPreviewOverlay", "headline");
  setupItem("#subPreviewOverlay", "subtitle");

  // Clique fora no canvas deseleciona elementos
  phone.addEventListener("pointerdown", e => {
    if (!e.target.closest(".canvas-item-overlay")) {
      document.querySelectorAll(".canvas-item-overlay").forEach(o => o.classList.remove("is-selected"));
    }
  });
}

initCanvasDirectControls();

function toggleHlFormat(prop) {
  S[prop] = !S[prop];
  drawOptions();
  updateHeadlineOverlay();
}

// Botões de formatação da headline (B, I, U, TT)
const btnHlBold = $("#btnHlBold"), btnVisualHlBold = $("#btnVisualHlBold");
if (btnHlBold) btnHlBold.onclick = () => toggleHlFormat("hlBold");
if (btnVisualHlBold) btnVisualHlBold.onclick = () => toggleHlFormat("hlBold");

const btnHlItalic = $("#btnHlItalic"), btnVisualHlItalic = $("#btnVisualHlItalic");
if (btnHlItalic) btnHlItalic.onclick = () => toggleHlFormat("hlItalic");
if (btnVisualHlItalic) btnVisualHlItalic.onclick = () => toggleHlFormat("hlItalic");

const btnHlUnderline = $("#btnHlUnderline"), btnVisualHlUnderline = $("#btnVisualHlUnderline");
if (btnHlUnderline) btnHlUnderline.onclick = () => toggleHlFormat("hlUnderline");
if (btnVisualHlUnderline) btnVisualHlUnderline.onclick = () => toggleHlFormat("hlUnderline");

const btnHlUppercase = $("#btnHlUppercase"), btnVisualHlUppercase = $("#btnVisualHlUppercase");
if (btnHlUppercase) btnHlUppercase.onclick = () => toggleHlFormat("hlUppercase");
if (btnVisualHlUppercase) btnVisualHlUppercase.onclick = () => toggleHlFormat("hlUppercase");

// Sincronização de cores da headline (Texto e Contorno)
function syncHeadlineColor(textColor, outColor) {
  if (textColor) {
    S.hlTextColor = textColor;
    S.hlColor1 = textColor;
  }
  if (outColor) {
    S.hlOutlineColor = outColor;
  }
  ["hlTextColor", "visualHlTextColor", "hlColor1", "visualHlColor1"].forEach(id => {
    const el = $("#" + id);
    if (el) el.value = S.hlTextColor || "#ffffff";
  });
  ["hlOutlineColor", "visualHlOutlineColor"].forEach(id => {
    const el = $("#" + id);
    if (el) el.value = S.hlOutlineColor || "#000000";
  });
  updateHeadlineOverlay();
}

const hlTextColorInp = $("#hlTextColor");
if (hlTextColorInp) hlTextColorInp.oninput = e => syncHeadlineColor(e.target.value, null);

const visualHlTextColorInp = $("#visualHlTextColor");
if (visualHlTextColorInp) visualHlTextColorInp.oninput = e => syncHeadlineColor(e.target.value, null);

const hlOutlineColorInp = $("#hlOutlineColor");
if (hlOutlineColorInp) hlOutlineColorInp.oninput = e => syncHeadlineColor(null, e.target.value);

const visualHlOutlineColorInp = $("#visualHlOutlineColor");
if (visualHlOutlineColorInp) visualHlOutlineColorInp.oninput = e => syncHeadlineColor(null, e.target.value);

// Toggle do Gabarito da Zona Segura Reels / TikTok (420px)
const btnToggleSafeZone = $("#btnToggleSafeZone");
const safeZoneOverlay = $("#safeZoneOverlay");
if (btnToggleSafeZone && safeZoneOverlay) {
  btnToggleSafeZone.onclick = () => {
    S.safeZoneVisible = !S.safeZoneVisible;
    safeZoneOverlay.style.display = S.safeZoneVisible ? "flex" : "none";
    btnToggleSafeZone.classList.toggle("is-active", S.safeZoneVisible);
  };
}

function removeHlTemplate() {
  S.hlTemplate = null;
  const chip = $("#hlTemplateChip");
  const ind = $("#visualHlTemplateIndicator");
  if (chip) chip.style.display = "none";
  if (ind) ind.style.display = "none";
  const tplInput = $("#hlTemplateInput");
  if (tplInput) tplInput.value = "";
  updateHeadlineTimingDisplay();
  const pvCam = $("#pv");
  updateHeadlineOverlay(pvCam ? pvCam.currentTime : 0);
  drawTL();
}

const btnRemoveHlTemplate = $("#btnRemoveHlTemplate");
if (btnRemoveHlTemplate) {
  btnRemoveHlTemplate.onclick = removeHlTemplate;
}

// Gerenciamento de Upload de Template / Modelo de Headline
async function handleHlTemplateFile(file) {
  if (!file) return;
  try {
    const fd = new FormData();
    fd.append("template", file);
    const res = await fetch("/upload_headline_template", { method: "POST", body: fd }).then(r => r.json());
    if (res.template_id) {
      S.hlTemplate = res;
      setHlMode("file");
      const chip = $("#hlTemplateChip");
      const thumb = $("#hlTemplateThumb");
      const name = $("#hlTemplateName");
      const ind = $("#visualHlTemplateIndicator");
      if (chip) chip.style.display = "flex";
      if (thumb) thumb.src = res.url;
      if (name) name.textContent = res.filename;
      if (ind) ind.style.display = "inline-block";

      // Inicializa tempo de exibição cobrindo o vídeo se ainda não estiver definido
      if (!S.hlEnd || S.hlEnd <= (S.hlStart || 0)) {
        S.hlEnd = S.dur || 10;
      }
      if ($("#hlStart")) $("#hlStart").value = S.hlStart || 0;
      if ($("#hlEnd")) $("#hlEnd").value = S.hlEnd;

      updateHeadlineTimingDisplay();
      const pvCam = $("#pv");
      updateHeadlineOverlay(pvCam ? pvCam.currentTime : 0);
      drawTL();
    }
  } catch (err) {
    console.error("Erro ao subir template de headline:", err);
  }
}

const hlTemplateInput = $("#hlTemplateInput");
if (hlTemplateInput) {
  hlTemplateInput.onchange = e => handleHlTemplateFile(e.target.files[0]);
}

const btnUploadHlTemplate = $("#btnUploadHlTemplate");
if (btnUploadHlTemplate && hlTemplateInput) {
  btnUploadHlTemplate.onclick = () => hlTemplateInput.click();
}

const btnVisualUploadHlTemplate = $("#btnVisualUploadHlTemplate");
if (btnVisualUploadHlTemplate && hlTemplateInput) {
  btnVisualUploadHlTemplate.onclick = () => hlTemplateInput.click();
}


// Toggle de Legendas (Ativar / Desativar / Exportar Vídeo Limpo)
function toggleCaptions(enabled) {
  if (S.viewMode === "rendered") setVideoViewMode("original");
  S.captionDisabled = !enabled;
  if (!enabled) {
    if (S.cap !== "nenhuma") S.lastCap = S.cap;
    S.cap = "nenhuma";
  } else {
    S.cap = (S.lastCap && S.lastCap !== "nenhuma") ? S.lastCap : "hormozi";
  }
  drawOptions();
}

const captionToggle = $("#captionToggle");
if (captionToggle) captionToggle.onchange = e => toggleCaptions(e.target.checked);
const visualCaptionToggle = $("#visualCaptionToggle");
if (visualCaptionToggle) visualCaptionToggle.onchange = e => toggleCaptions(e.target.checked);

// CONTROLE DEDICADO DE TAMANHO DA LEGENDA (ÁREA VISUAL 2)
function setSubtitleScale(val) {
  const num = parseFloat(val) || 100;
  const scale = num > 5 ? (num / 100) : num;
  const clamped = Math.max(0.5, Math.min(2.2, Math.round(scale * 20) / 20));
  S.subScale = clamped;
  const pct = Math.round(clamped * 100);

  const range = $("#visualSubScaleRange");
  if (range && +range.value !== pct) range.value = pct;
  const lbl = $("#visualSubScaleVal");
  if (lbl) lbl.textContent = `${pct}%`;

  const subOverlay = $("#subPreviewOverlay");
  if (subOverlay) {
    subOverlay.style.transform = `translate(-50%, -50%) scale(${clamped})`;
  }

  const v = (S.viewMode === "rendered") ? $("#pvRenderedFull") : pv;
  updateSubtitleOverlayAtTime(v ? v.currentTime : 0);
}

const visualSubScaleRange = $("#visualSubScaleRange");
if (visualSubScaleRange) {
  visualSubScaleRange.oninput = e => setSubtitleScale(+e.target.value);
}
const btnVisualSubScaleDown = $("#btnVisualSubScaleDown");
if (btnVisualSubScaleDown) {
  btnVisualSubScaleDown.onclick = () => setSubtitleScale(Math.round(((S.subScale || 1.0) - 0.05) * 100));
}
const btnVisualSubScaleUp = $("#btnVisualSubScaleUp");
if (btnVisualSubScaleUp) {
  btnVisualSubScaleUp.onclick = () => setSubtitleScale(Math.round(((S.subScale || 1.0) + 0.05) * 100));
}
const visualSubScaleVal = $("#visualSubScaleVal");
if (visualSubScaleVal) {
  visualSubScaleVal.onclick = () => setSubtitleScale(100);
}

// CONTROLE DEDICADO DE TAMANHO DA HEADLINE (ÁREA VISUAL 2)
function setHeadlineScale(val) {
  const num = parseFloat(val) || 100;
  const scale = num > 5 ? (num / 100) : num;
  const clamped = Math.max(0.5, Math.min(2.5, Math.round(scale * 20) / 20));
  S.hlScale = clamped;
  const pct = Math.round(clamped * 100);

  const range = $("#visualHlScaleRange");
  if (range && +range.value !== pct) range.value = pct;
  const lbl = $("#visualHlScaleVal");
  if (lbl) lbl.textContent = `${pct}%`;

  const hlOverlay = $("#hlPreviewOverlay");
  if (hlOverlay) {
    hlOverlay.style.transform = `translate(-50%, -50%) scale(${clamped})`;
  }
  updateHeadlineOverlay();
}

const visualHlScaleRange = $("#visualHlScaleRange");
if (visualHlScaleRange) {
  visualHlScaleRange.oninput = e => setHeadlineScale(+e.target.value);
}
const btnVisualHlScaleDown = $("#btnVisualHlScaleDown");
if (btnVisualHlScaleDown) {
  btnVisualHlScaleDown.onclick = () => setHeadlineScale(Math.round(((S.hlScale || 1.0) - 0.05) * 100));
}
const btnVisualHlScaleUp = $("#btnVisualHlScaleUp");
if (btnVisualHlScaleUp) {
  btnVisualHlScaleUp.onclick = () => setHeadlineScale(Math.round(((S.hlScale || 1.0) + 0.05) * 100));
}
const visualHlScaleVal = $("#visualHlScaleVal");
if (visualHlScaleVal) {
  visualHlScaleVal.onclick = () => setHeadlineScale(100);
}

function syncHeadlineText(val) {
  if (S.viewMode === "rendered") setVideoViewMode("original");
  if ($("#hlText") && $("#hlText").value !== val) $("#hlText").value = val;
  if ($("#visualHlText") && $("#visualHlText").value !== val) $("#visualHlText").value = val;
  drawTL();
  updateHeadlineOverlay();
}

const hlTextInput = $("#hlText");
if (hlTextInput) {
  hlTextInput.oninput = () => syncHeadlineText(hlTextInput.value);
}

const visualHlTextInput = $("#visualHlText");
if (visualHlTextInput) {
  visualHlTextInput.oninput = () => syncHeadlineText(visualHlTextInput.value);
}

function setHeadlinePos(pos) {
  S.hlPos = pos;
  if (pos === "topo") {
    S.hlPosX = 50; S.hlPosY = 22.5;
  } else if (pos === "centro") {
    S.hlPosX = 50; S.hlPosY = 50.0;
  } else if (pos === "base") {
    S.hlPosX = 50; S.hlPosY = 77.0;
  }
  document.querySelectorAll(".hl-pos-btn, .visual-hl-pos-btn").forEach(b => {
    const isCur = b.dataset.pos === pos;
    b.classList.toggle("on", isCur);
    b.classList.toggle("btn-primary", isCur);
    b.classList.toggle("btn-secondary", !isCur);
  });
  updateHeadlineOverlay();
}

document.querySelectorAll(".hl-pos-btn, .visual-hl-pos-btn").forEach(btn => {
  btn.onclick = () => setHeadlinePos(btn.dataset.pos);
});

const visualHlStyleSelect = $("#visualHlStyleSelect");
if (visualHlStyleSelect) {
  visualHlStyleSelect.onchange = function() {
    S.hl = this.value;
    if (this.value === "neon_cyber") {
      S.hlTextColor = "#00d2b4";
      S.hlOutlineColor = "#000000";
    } else if (this.value === "laranja_texto") {
      S.hlTextColor = "#ff6a00";
      S.hlOutlineColor = "#000000";
    } else if (this.value === "caixa_laranja") {
      S.hlTextColor = "#ffffff";
      S.hlOutlineColor = "#ff6a00";
    }
    const colorEl = $("#visualHlTextColor"), outEl = $("#visualHlOutlineColor");
    if (colorEl && S.hlTextColor) colorEl.value = S.hlTextColor;
    if (outEl && S.hlOutlineColor) outEl.value = S.hlOutlineColor;
    drawOptions();
    drawTL();
    updateHeadlineOverlay();
  };
}

const visualCapStyleSelect = $("#visualCapStyleSelect");
if (visualCapStyleSelect) {
  visualCapStyleSelect.onchange = function() {
    S.cap = this.value;
    S.captionDisabled = (this.value === "nenhuma");
    drawOptions();
    drawTL();
    const v = (S.viewMode === "rendered") ? $("#pvRenderedFull") : pv;
    updateSubtitleOverlayAtTime(v ? v.currentTime : 0);
  };
}

function applyHeadlineDuration(durType) {
  const d = S.dur || 10;
  if (durType === "5") {
    S.hlStart = 0;
    S.hlEnd = Math.min(d, 5);
  } else if (durType === "10") {
    S.hlStart = 0;
    S.hlEnd = Math.min(d, 10);
  } else {
    S.hlStart = 0;
    S.hlEnd = d;
  }
  if ($("#hlStart")) $("#hlStart").value = S.hlStart;
  if ($("#hlEnd")) $("#hlEnd").value = S.hlEnd;

  document.querySelectorAll(".hl-dur-btn, .visual-hl-dur-btn").forEach(b => {
    const isSel = (b.dataset.dur === durType);
    b.classList.toggle("on", isSel);
    b.classList.toggle("btn-primary", isSel);
    b.classList.toggle("btn-secondary", !isSel);
  });

  updateHeadlineTimingDisplay();
  const pvCam = $("#pv");
  updateHeadlineOverlay(pvCam ? pvCam.currentTime : 0);
  drawTL();
}

document.querySelectorAll(".hl-dur-btn, .visual-hl-dur-btn").forEach(btn => {
  btn.onclick = () => applyHeadlineDuration(btn.dataset.dur);
});

const hlStartInput = $("#hlStart");
const hlEndInput = $("#hlEnd");
if (hlStartInput) {
  hlStartInput.onchange = function() {
    S.hlStart = Math.max(0, parseFloat(this.value) || 0);
    updateHeadlineTimingDisplay();
    const pvCam = $("#pv");
    updateHeadlineOverlay(pvCam ? pvCam.currentTime : 0);
    drawTL();
  };
}
if (hlEndInput) {
  hlEndInput.onchange = function() {
    S.hlEnd = Math.max(0, parseFloat(this.value) || 0);
    updateHeadlineTimingDisplay();
    const pvCam = $("#pv");
    updateHeadlineOverlay(pvCam ? pvCam.currentTime : 0);
    drawTL();
  };
}

// ========================================================
// DRAG E RESIZE / TRIM DE HEADLINE E MÍDIAS NA TIMELINE
// Suporte a Mouse e Touch com sincronização do player em tempo real
// ========================================================
let isDragging = false;
let dragInfo = null;

const getPointerClientX = e => (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;

function onTimelinePointerDown(e) {
  const pps = S.pps || 20;
  const d = S.dur || 10;

  // Se clicou no botão de exclusão de modelo da timeline
  if (e.target.closest("#tlDelHlBtn")) {
    removeHlTemplate();
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // 1. Headline Drag & Trim (Aparar Entrada e Saída / Mover)
  const hlBar = e.target.closest("#hlBar");
  if (hlBar) {
    isDragging = true;
    const start = Math.max(0, S.hlStart !== undefined ? S.hlStart : 0);
    const end = (S.hlEnd && S.hlEnd > start) ? Math.min(d, S.hlEnd) : d;
    let type = "hl-move";
    if (e.target.closest(".hl-handle-l")) type = "hl-resize-l";
    else if (e.target.closest(".hl-handle-r")) type = "hl-resize-r";
    else hlBar.style.cursor = "grabbing";

    dragInfo = {
      type: type,
      startX: getPointerClientX(e),
      initialStart: start,
      initialEnd: end,
      el: hlBar
    };
    e.preventDefault();
    return;
  }

  // 2. Mídia / Imagem Drag & Resize
  const mediaDel = e.target.closest(".media-del-btn");
  if (mediaDel) {
    removeMediaItem(mediaDel.dataset.id);
    e.preventDefault();
    return;
  }

  const mediaBar = e.target.closest(".media-bar");
  if (mediaBar) {
    const id = mediaBar.dataset.id;
    const m = S.mediaItems.find(x => x.id === id);
    if (!m) return;

    isDragging = true;
    let type = "media-move";
    if (e.target.closest(".media-handle-l")) type = "media-resize-l";
    else if (e.target.closest(".media-handle-r")) type = "media-resize-r";
    else mediaBar.style.cursor = "grabbing";

    dragInfo = {
      type: type,
      startX: getPointerClientX(e),
      initialStart: m.start || 0,
      initialEnd: m.end || d,
      item: m,
      el: mediaBar
    };
    e.preventDefault();
    return;
  }
}

function onTimelinePointerMove(e) {
  if (!isDragging || !dragInfo) return;
  const pps = S.pps || 20;
  const d = S.dur || 10;
  const clientX = getPointerClientX(e);
  const dx = (clientX - dragInfo.startX) / pps;

  if (dragInfo.type.startsWith("hl-")) {
    let targetSeekTime = null;

    if (dragInfo.type === "hl-move") {
      const dur = dragInfo.initialEnd - dragInfo.initialStart;
      let newStart = Math.max(0, Math.min(d - dur, dragInfo.initialStart + dx));
      newStart = Math.round(newStart * 10) / 10;
      S.hlStart = newStart;
      S.hlEnd = Math.round((newStart + dur) * 10) / 10;
      targetSeekTime = S.hlStart;
    } else if (dragInfo.type === "hl-resize-l") {
      let newStart = Math.max(0, Math.min(dragInfo.initialEnd - 0.3, dragInfo.initialStart + dx));
      newStart = Math.round(newStart * 10) / 10;
      S.hlStart = newStart;
      targetSeekTime = S.hlStart;
    } else if (dragInfo.type === "hl-resize-r") {
      let newEnd = Math.max(dragInfo.initialStart + 0.3, Math.min(d, dragInfo.initialEnd + dx));
      newEnd = Math.round(newEnd * 10) / 10;
      S.hlEnd = newEnd;
      targetSeekTime = S.hlEnd;
    }

    if ($("#hlStart")) $("#hlStart").value = S.hlStart;
    if ($("#hlEnd")) $("#hlEnd").value = S.hlEnd;
    updateHeadlineTimingDisplay();

    const bar = dragInfo.el;
    if (bar) {
      const start = S.hlStart || 0;
      const end = (S.hlEnd && S.hlEnd > start) ? Math.min(d, S.hlEnd) : d;
      bar.style.left = (start * pps) + "px";
      bar.style.width = Math.max(28, (end - start) * pps) + "px";
      const badge = bar.querySelector(".hl-time-badge");
      if (badge) badge.textContent = `${start.toFixed(1)}s – ${end.toFixed(1)}s`;
    }

    // Sincroniza o player no momento do corte/ajuste para preview instantâneo
    if (targetSeekTime !== null) {
      const pvFull = $("#pvRenderedFull");
      if (pv && !pv.paused) pv.pause();
      if (pv) pv.currentTime = targetSeekTime;
      if (pvFull) pvFull.currentTime = targetSeekTime;
      if (prevPlayer) prevPlayer.currentTime = targetSeekTime;
      highlightActiveSegment(targetSeekTime, false);
    }

    updateHeadlineOverlay(targetSeekTime !== null ? targetSeekTime : (pv ? pv.currentTime : 0));
  } else if (dragInfo.type.startsWith("media-")) {
    const m = dragInfo.item;
    if (!m) return;

    if (dragInfo.type === "media-move") {
      const dur = dragInfo.initialEnd - dragInfo.initialStart;
      let newStart = Math.max(0, Math.min(d - dur, dragInfo.initialStart + dx));
      m.start = Math.round(newStart * 10) / 10;
      m.end = Math.round((newStart + dur) * 10) / 10;
    } else if (dragInfo.type === "media-resize-l") {
      let newStart = Math.max(0, Math.min(dragInfo.initialEnd - 0.5, dragInfo.initialStart + dx));
      m.start = Math.round(newStart * 10) / 10;
    } else if (dragInfo.type === "media-resize-r") {
      let newEnd = Math.max(dragInfo.initialStart + 0.5, Math.min(d, dragInfo.initialEnd + dx));
      m.end = Math.round(newEnd * 10) / 10;
    }

    const bar = dragInfo.el;
    if (bar) {
      bar.style.left = (m.start * pps) + "px";
      bar.style.width = Math.max(20, (m.end - m.start) * pps) + "px";
    }
  }
}

function onTimelinePointerUp() {
  if (isDragging) {
    if (dragInfo && dragInfo.type && dragInfo.type.startsWith("media-")) {
      renderMediaLists();
    }
    if (dragInfo && dragInfo.type && dragInfo.type.startsWith("hl-")) {
      drawTL();
      const pvCam = $("#pv");
      updateHeadlineOverlay(pvCam ? pvCam.currentTime : 0);
    }
    if (dragInfo && dragInfo.el) {
      dragInfo.el.style.cursor = "grab";
    }
    isDragging = false;
    dragInfo = null;
  }
}

document.addEventListener("mousedown", onTimelinePointerDown);
document.addEventListener("mousemove", onTimelinePointerMove);
document.addEventListener("mouseup", onTimelinePointerUp);

document.addEventListener("touchstart", onTimelinePointerDown, { passive: false });
document.addEventListener("touchmove", onTimelinePointerMove, { passive: false });
document.addEventListener("touchend", onTimelinePointerUp);

const tlEl = $("#tl");
if (tlEl) tlEl.onclick = tl_seek;

const playBtn = $("#playBtn");
if (playBtn) {
  playBtn.onclick = () => {
    const isRenderedView = (S.viewMode === "rendered" && S.renderedUrl);
    const v = isRenderedView ? ($("#pvRenderedFull") || pv) : pv;
    if (v) {
      v.paused ? v.play() : v.pause();
    }
  };
}

const stepBack = $("#stepBackBtn");
if (stepBack) {
  stepBack.onclick = () => {
    const pvFull = $("#pvRenderedFull");
    if (pv) pv.currentTime = 0;
    if (pvFull) pvFull.currentTime = 0;
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
  const isRenderedView = (S.viewMode === "rendered" && S.renderedUrl);
  const pvFull = $("#pvRenderedFull");
  const v = isRenderedView ? (pvFull || pv) : (pv || prevPlayer);
  const ph = $("#ph");
  if (v) {
    if (ph) ph.style.left = (v.currentTime * S.pps) + "px";
    const clk = $("#clock");
    if (clk) clk.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration || S.dur || 0)}`;
    if (playBtn) playBtn.textContent = v.paused ? "▶" : "❚❚";
    if (!isRenderedView) {
      updateMediaPreviewAtTime(v.currentTime);
      updateSubtitleOverlayAtTime(v.currentTime);
      updateHeadlineOverlay(v.currentTime);
    }
  }
  requestAnimationFrame(loop);
})();

// Suporte a arrastar e soltar arquivos de mídia diretamente na timeline
const tlScrollEl = $("#scroll");
if (tlScrollEl) {
  tlScrollEl.addEventListener("dragover", e => {
    e.preventDefault();
    tlScrollEl.style.outline = "2px dashed #f97316";
  });
  tlScrollEl.addEventListener("dragleave", () => {
    tlScrollEl.style.outline = "none";
  });
  tlScrollEl.addEventListener("drop", e => {
    e.preventDefault();
    tlScrollEl.style.outline = "none";
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      handleMediaFiles(e.dataTransfer.files);
    }
  });
}

drawOptions();
renderMediaLists();
tab("corte");
