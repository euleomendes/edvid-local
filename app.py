"""
Edvid Local — editor de vídeo automático rodando 100% no seu computador.
Sem chamadas de API paga: transcrição via Whisper local, tudo mais via FFmpeg/OpenCV local.
"""

import os
import re
import subprocess
import uuid
from pathlib import Path

# Garante detecção automática de ffmpeg/ffprobe via static_ffmpeg ou PATH do Mac
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception:
    pass

for p in ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin"]:
    if p not in os.environ.get("PATH", ""):
        os.environ["PATH"] = f"{p}:{os.environ.get('PATH', '')}"

from flask import Flask, request, jsonify, send_from_directory, render_template

BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "output"
TMP_DIR = BASE_DIR / "tmp"
FONTS_DIR = BASE_DIR / "fonts"
for d in (UPLOAD_DIR, OUTPUT_DIR, TMP_DIR, FONTS_DIR):
    d.mkdir(exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024 * 1024  # 2GB

_whisper_model = None


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
    return _whisper_model


def find_upload(file_id):
    matches = list(UPLOAD_DIR.glob(f"{file_id}.*"))
    return matches[0] if matches else None


def ffprobe_duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def detect_cuts(path, threshold=0.35):
    """Detecta trocas de cena/corte usando o filtro 'scene' do FFmpeg. Retorna lista de timestamps (s)."""
    proc = subprocess.run(
        ["ffmpeg", "-i", str(path), "-vf", f"select='gt(scene,{threshold})',showinfo",
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    times = [float(m) for m in re.findall(r"pts_time:([\d.]+)", proc.stderr)]
    cleaned = []
    for t in times:
        if not cleaned or t - cleaned[-1] > 0.6:
            cleaned.append(t)
    return cleaned


def detect_face_positions(path, sample_every=1.0):
    """Amostra o vídeo e detecta a posição horizontal (0-1) do rosto principal ao longo do tempo."""
    import cv2

    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    step = max(1, int(fps * sample_every))

    points = []
    last_x = 0.5
    idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if idx % step == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, 1.2, 5, minSize=(60, 60))
            if len(faces) > 0:
                fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
                last_x = (fx + fw / 2) / width
            points.append((idx / fps, last_x))
        idx += 1
    cap.release()
    return points, width, height


def build_tracking_crop_expr(points, src_w, src_h, out_ratio=1080 / 1920):
    """Gera expressão FFmpeg de crop que acompanha a posição x do rosto ao longo do tempo."""
    if not points or len(points) < 2:
        return None
    crop_w = min(int(src_h * out_ratio), src_w)
    max_x = src_w - crop_w

    terms = []
    for i in range(len(points) - 1):
        t0, x0 = points[i]
        t1, x1 = points[i + 1]
        if t1 <= t0:
            continue
        px0 = max(0, min(max_x, x0 * src_w - crop_w / 2))
        px1 = max(0, min(max_x, x1 * src_w - crop_w / 2))
        terms.append(
            f"between(t,{t0:.2f},{t1:.2f})*({px0:.1f}+({px1:.1f}-{px0:.1f})*(t-{t0:.2f})/({t1:.2f}-{t0:.2f}))"
        )
    if not terms:
        return None
    return f"crop=w={crop_w}:h={src_h}:x='{'+'.join(terms)}':y=0"


CAPTION_STYLES = {
    "hormozi": dict(font="Arial Black", size=16, primary="&H0000FFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=4, upper=True),
    "karaoke_neon": dict(font="Arial Black", size=15, primary="&H00D2B400", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=3.5, upper=True),
    "destaque": dict(font="Arial Black", size=15, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=3, upper=True),
    "karaoke": dict(font="Arial Black", size=15, primary="&H00006AFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=3, upper=True),
    "pop_destaque": dict(font="Arial Black", size=17, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=4.5, upper=True),
    "serif_destaque": dict(font="Georgia", size=14, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=2, upper=False),
    "serif_luxo": dict(font="Georgia", size=14, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=0, bs=1, outline=2, upper=False),
    "clean_minimal": dict(font="Arial", size=12, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=0, bs=1, outline=1.5, upper=False),
    "simples": dict(font="Arial", size=12, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=0, bs=1, outline=2, upper=False),
    "pequena": dict(font="Arial", size=9, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=2, upper=False),
}
HEADLINE_STYLES = {
    "bebas_impact": dict(font="Impact", size=18, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=4, upper=True),
    "neon_cyber": dict(font="Arial Black", size=16, primary="&H00D2B400", sec="&H00D2B400", outline_c="&H00000000", bold=-1, bs=1, outline=4, upper=False),
    "contorno": dict(font="Arial Black", size=17, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=5, upper=False),
    "caixa_preta": dict(font="Arial Black", size=15, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=3, outline=14, upper=True),
    "caixa_laranja": dict(font="Arial Black", size=15, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00006AFF", bold=-1, bs=3, outline=14, upper=False),
    "laranja_texto": dict(font="Arial Black", size=17, primary="&H00006AFF", sec="&H00006AFF", outline_c="&H00000000", bold=-1, bs=1, outline=5, upper=False),
}


def detect_silences(path, noise_db=-30, min_duration=0.32):
    """Detecta intervalos de silêncio/pausas usando o filtro silencedetect do FFmpeg."""
    cmd = [
        "ffmpeg", "-i", str(path),
        "-af", f"silencedetect=noise={noise_db}dB:d={min_duration}",
        "-f", "null", "-"
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start:\s*([\d.]+)", proc.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([\d.]+)", proc.stderr)]
    silences = [(s, e) for s, e in zip(starts, ends) if e > s]
    return silences


def compute_speech_intervals(duration, silences, pad=0.06):
    """
    Inverte os intervalos de silêncio para obter os intervalos de fala,
    adicionando uma pequena margem (pad) para não cortar o início/fim das palavras.
    """
    if not silences:
        return [(0.0, round(duration, 2))], []

    effective_silences = []
    for s, e in silences:
        s_pad = s + pad
        e_pad = e - pad
        if e_pad > s_pad:
            effective_silences.append((round(s_pad, 2), round(e_pad, 2)))
    if not effective_silences:
        return [(0.0, round(duration, 2))], []

    speech = []
    cur = 0.0
    for s, e in effective_silences:
        if s > cur + 0.1:
            speech.append((round(cur, 2), round(s, 2)))
        cur = max(cur, e)
    if cur < duration - 0.1:
        speech.append((round(cur, 2), round(duration, 2)))
    return speech, effective_silences


def map_time_after_cuts(orig_t, effective_silences):
    """Mapeia um timestamp original para o novo tempo após o corte de silêncios."""
    if not effective_silences:
        return orig_t
    cut_amount = 0.0
    for s, e in effective_silences:
        if orig_t >= e:
            cut_amount += (e - s)
        elif orig_t > s:
            cut_amount += (orig_t - s)
            break
    return max(0.0, round(orig_t - cut_amount, 2))


def chunk_words(words, max_words=3, max_duration=1.25):
    """
    Agrupa palavras individuais em blocos curtos e dinâmicos (1 a 3 palavras por tela).
    Evita blocos longos com 3 linhas na tela.
    """
    if not words:
        return []
    chunks = []
    cur = []
    for w in words:
        cur.append(w)
        dur = cur[-1]["end"] - cur[0]["start"]
        if len(cur) >= max_words or dur >= max_duration:
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    return chunks


def build_ass_subtitles(segments, style="destaque", out_path=None, karaoke=False, headline=None, headline_style="bebas_impact",
                        headline_start=0.0, headline_end=None, headline_pos="topo", effective_silences=None, caption_style=None):
    if caption_style and (not style or style == "destaque"):
        style = caption_style
    c = CAPTION_STYLES.get(style, CAPTION_STYLES["destaque"])
    h = HEADLINE_STYLES.get(headline_style, HEADLINE_STYLES["bebas_impact"])

    def sty(name, d, align, mv):
        return (f"Style: {name},{d['font']},{d['size'] * 4},{d['primary']},{d['sec']},{d['outline_c']},&H00000000,"
                f"{d['bold']},0,0,0,100,100,0,0,{d['bs']},{d['outline']},0,{align},70,70,{mv},1")

    # Posicionamento da Headline: topo (align 8, mv 200), centro (align 5, mv 0), base (align 2, mv 160)
    hl_align = 8
    hl_mv = 200
    if headline_pos == "centro":
        hl_align = 5
        hl_mv = 0
    elif headline_pos == "base":
        hl_align = 2
        hl_mv = 160

    header = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding\n"
        + sty("Default", c, 2, 280) + "\n" + sty("Headline", h, hl_align, hl_mv) + "\n\n[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    def fmt_time(t):
        return f"{int(t // 3600)}:{int((t % 3600) // 60):02d}:{t % 60:05.2f}"

    def tx(text, d):
        text = text.replace("\n", " ").strip()
        return text.upper() if d["upper"] else text

    lines = [header]

    # Headline com intervalo de início e fim customizáveis
    if headline:
        h_start = float(headline_start or 0.0)
        h_end = float(headline_end if (headline_end is not None and float(headline_end) > 0) else 5.0)
        if effective_silences:
            h_start = map_time_after_cuts(h_start, effective_silences)
            h_end = map_time_after_cuts(h_end, effective_silences)
        if h_end > h_start:
            lines.append(f"Dialogue: 1,{fmt_time(h_start)},{fmt_time(h_end)},Headline,,0,0,0,,{tx(headline, h)}\n")

    # Coleta todas as palavras de todos os segmentos
    all_words = []
    for seg in segments:
        if seg.get("words"):
            all_words.extend(seg["words"])
        elif seg.get("text"):
            w_list = seg["text"].split()
            if w_list:
                step = (seg["end"] - seg["start"]) / len(w_list)
                for idx, w_str in enumerate(w_list):
                    all_words.append({
                        "word": w_str,
                        "start": round(seg["start"] + idx * step, 2),
                        "end": round(seg["start"] + (idx + 1) * step, 2)
                    })

    # Divide em chunks virais curtos (1 a 3 palavras por tela)
    chunks = chunk_words(all_words, max_words=3, max_duration=1.25)
    for chunk in chunks:
        c_start = chunk[0]["start"]
        c_end = chunk[-1]["end"]
        if effective_silences:
            c_start = map_time_after_cuts(c_start, effective_silences)
            c_end = map_time_after_cuts(c_end, effective_silences)
        if c_end <= c_start:
            continue

        if karaoke:
            # Karaokê dinâmico palavra por palavra
            text = "".join(f"{{\\k{max(1, int(round((w['end'] - w['start']) * 100)))}}}{tx(w['word'], c)} " for w in chunk)
        else:
            text = " ".join(tx(w["word"], c) for w in chunk)
        lines.append(f"Dialogue: 0,{fmt_time(c_start)},{fmt_time(c_end)},Default,,0,0,0,,{text.strip()}\n")

    out_path.write_text("".join(lines), encoding="utf-8")


@app.route("/analyze", methods=["POST"])
def analyze():
    import numpy as np
    p = find_upload(request.json.get("video_id"))
    if not p:
        return jsonify({"error": "Vídeo não encontrado"}), 404
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
                         capture_output=True).stdout
    a = np.abs(np.frombuffer(raw, dtype=np.int16).astype(np.float32))
    peaks = []
    if len(a) > 400:
        peaks = [float(x.max()) for x in np.array_split(a, 400)]
        m = max(peaks) or 1
        peaks = [round(x / m, 3) for x in peaks]
    return jsonify({"duration": ffprobe_duration(p), "cuts": detect_cuts(p), "peaks": peaks})


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    field = "video" if "video" in request.files else "video2"
    file = request.files.get(field)
    if not file:
        return jsonify({"error": "Nenhum vídeo enviado"}), 400
    ext = Path(file.filename).suffix or ".mp4"
    file_id = uuid.uuid4().hex[:10]
    path = UPLOAD_DIR / f"{file_id}{ext}"
    file.save(path)
    return jsonify({"video_id": file_id, "filename": path.name, "url": f"/media/{file_id}"})


@app.route("/media/<file_id>")
def serve_media(file_id):
    p = find_upload(file_id)
    if not p:
        return jsonify({"error": "Arquivo não encontrado"}), 404
    return send_from_directory(p.parent, p.name, conditional=True)


@app.route("/upload_music", methods=["POST"])
def upload_music():
    file = request.files.get("music")
    if not file:
        return jsonify({"error": "Nenhum áudio enviado"}), 400
    ext = Path(file.filename).suffix or ".mp3"
    music_id = uuid.uuid4().hex[:10]
    path = UPLOAD_DIR / f"{music_id}{ext}"
    file.save(path)
    return jsonify({"music_id": music_id})


@app.route("/transcribe", methods=["POST"])
def transcribe():
    data = request.json
    video_path = find_upload(data.get("video_id"))
    if not video_path:
        return jsonify({"error": "Vídeo não encontrado"}), 404

    model = get_whisper_model()
    segments, info = model.transcribe(str(video_path), language="pt", vad_filter=True, word_timestamps=True)

    result = []
    for seg in segments:
        words = [{"word": w.word, "start": round(w.start, 2), "end": round(w.end, 2)} for w in (seg.words or [])]
        result.append({"start": round(seg.start, 2), "end": round(seg.end, 2), "text": seg.text.strip(), "words": words})
    return jsonify({"segments": result})


@app.route("/export", methods=["POST"])
def export():
    data = request.json
    video_path = find_upload(data["video_id"])
    if not video_path:
        return jsonify({"error": "Vídeo não encontrado"}), 404

    video2_path = find_upload(data.get("video2_id")) if data.get("video2_id") else None
    segments = data.get("segments", [])
    caption_style = data.get("caption_style", "hormozi")
    headline = (data.get("headline") or "").strip()
    headline_style = data.get("headline_style", "bebas_impact")
    headline_start = float(data.get("headline_start", 0.0) or 0.0)
    headline_end = float(data.get("headline_end", 0.0) or 0.0)
    headline_pos = data.get("headline_pos", "topo")
    karaoke = bool(data.get("karaoke")) or ("karaoke" in caption_style) or (caption_style in ("hormozi", "karaoke_neon"))
    zoom_continuous = bool(data.get("zoom_continuous"))
    zoom_cuts = bool(data.get("zoom_cuts"))
    flash_cuts = bool(data.get("flash_cuts"))
    cut_silence = bool(data.get("cut_silence", True))
    framing_y = float(data.get("framing_y", 0.10) if data.get("framing_y") is not None else 0.10)
    tracking = bool(data.get("tracking"))
    music_id = data.get("music_id")
    music_volume = float(data.get("music_volume", 0.15))

    job_id = uuid.uuid4().hex[:10]
    job_tmp = TMP_DIR / job_id
    job_tmp.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / f"{job_id}.mp4"

    try:
        duration = ffprobe_duration(video_path)

        # --- Passo A: construir vídeo base 1080x1920 com enquadramento ajustável ---
        base_path = job_tmp / "base.mp4"
        tipo = data.get("tipo", "unica")

        # Enquadramento vertical: framing_y padrão 0.10 dá 10% do topo, mantendo 100% da cabeça do apresentador
        crop_y_split = f"max(0\\,min(ih-960\\,(ih-960)*{framing_y:.3f}))"
        crop_y_single = f"max(0\\,min(ih-1920\\,(ih-1920)*{framing_y:.3f}))"

        if video2_path:
            IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
            is_v2_img = video2_path.suffix.lower() in IMAGE_EXTS
            v2_args = ["-loop", "1", "-framerate", "30", "-t", f"{duration:.2f}", "-i", str(video2_path)] if is_v2_img else ["-i", str(video2_path)]

            if tipo == "dividida":
                # Layout div1: Vídeo 2 (mídia/imagem) em cima, Vídeo 1 (apresentador) embaixo com framing_y
                fc = (
                    "[1:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960:(iw-1080)/2:(ih-960)/2[top];"
                    f"[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960:(iw-1080)/2:{crop_y_split}[bot];"
                    "[top][bot]vstack=inputs=2[v]"
                )
            elif tipo == "dividida2":
                # Layout div2: Vídeo 1 (apresentador) em cima com framing_y, Vídeo 2 (mídia/imagem) embaixo
                fc = (
                    f"[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960:(iw-1080)/2:{crop_y_split}[top];"
                    "[1:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960:(iw-1080)/2:(ih-960)/2[bot];"
                    "[top][bot]vstack=inputs=2[v]"
                )
            else:
                # Fallback se video2 fornecido em modo tela única
                fc = (
                    f"[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960:(iw-1080)/2:{crop_y_split}[top];"
                    "[1:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960:(iw-1080)/2:(ih-960)/2[bot];"
                    "[top][bot]vstack=inputs=2[v]"
                )

            if is_v2_img:
                cmd = [
                    "ffmpeg", "-y", "-i", str(video_path), *v2_args,
                    "-filter_complex", fc,
                    "-map", "[v]", "-map", "0:a", "-r", "30",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac",
                    str(base_path),
                ]
            else:
                fc += ";[0:a][1:a]amix=inputs=2:duration=first[a]"
                cmd = [
                    "ffmpeg", "-y", "-i", str(video_path), *v2_args,
                    "-filter_complex", fc,
                    "-map", "[v]", "-map", "[a]", "-r", "30",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac",
                    str(base_path),
                ]
            subprocess.run(cmd, capture_output=True, text=True, check=True)
        elif tracking:
            points, w, h = detect_face_positions(video_path, sample_every=1.0)
            crop_expr = build_tracking_crop_expr(points, w, h)
            vf = (f"{crop_expr},scale=1080:1920" if crop_expr
                  else f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:{crop_y_single}")
            cmd = ["ffmpeg", "-y", "-i", str(video_path), "-vf", vf, "-r", "30",
                   "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", str(base_path)]
            subprocess.run(cmd, capture_output=True, text=True, check=True)
        else:
            vf = f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:{crop_y_single}"
            cmd = ["ffmpeg", "-y", "-i", str(video_path),
                   "-vf", vf,
                   "-r", "30", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", str(base_path)]
            subprocess.run(cmd, capture_output=True, text=True, check=True)

        current = base_path

        # --- Passo B: corte de silêncios/respiros + flash nas transições + zoom nos cortes ---
        effective_silences = []
        if cut_silence:
            raw_silences = detect_silences(current, noise_db=-30, min_duration=0.32)
            speech_intervals, effective_silences = compute_speech_intervals(duration, raw_silences, pad=0.06)

            if len(speech_intervals) > 1:
                n_segs = len(speech_intervals)
                cut_out = job_tmp / "cut_video.mp4"
                v_splits = "".join(f"[v_in{i}]" for i in range(n_segs))
                a_splits = "".join(f"[a_in{i}]" for i in range(n_segs))

                filters = [
                    f"[0:v]split={n_segs}{v_splits}",
                    f"[0:a]asplit={n_segs}{a_splits}"
                ]
                concat_ins = ""
                for i, (t0, t1) in enumerate(speech_intervals):
                    v_filters = [f"trim=start={t0}:end={t1},setpts=PTS-STARTPTS"]

                    # Zoom punch-in alternado nos cortes (segmentos ímpares)
                    if zoom_cuts and (i % 2 == 1):
                        v_filters.append("scale=1242:2208,crop=1080:1920")

                    # Flash branco suave de 2 frames na transição (a partir do 2º trecho)
                    if flash_cuts and i > 0:
                        v_filters.append("drawbox=x=0:y=0:w=iw:h=ih:color=white@0.85:t=fill:enable='lt(t,0.06)'")

                    filters.append(f"[v_in{i}]{','.join(v_filters)}[v_seg{i}]")
                    filters.append(f"[a_in{i}]atrim=start={t0}:end={t1},asetpts=PTS-STARTPTS[a_seg{i}]")
                    concat_ins += f"[v_seg{i}][a_seg{i}]"

                filters.append(f"{concat_ins}concat=n={n_segs}:v=1:a=1[vout][aout]")

                cmd = ["ffmpeg", "-y", "-i", str(current), "-filter_complex", ";".join(filters),
                       "-map", "[vout]", "-map", "[aout]",
                       "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", str(cut_out)]
                r = subprocess.run(cmd, capture_output=True, text=True)
                if r.returncode == 0:
                    current = cut_out
                    duration = sum(e - s for s, e in speech_intervals)
        elif zoom_continuous:
            zoomed = job_tmp / "zoomed_cont.mp4"
            cmd = ["ffmpeg", "-y", "-i", str(current),
                   "-vf", "zoompan=z='min(zoom+0.0007,1.3)':d=1:s=1080x1920:fps=30",
                   "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", str(zoomed)]
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode == 0:
                current = zoomed

        # --- Passo C: legendas dinâmicas e headline ---
        if segments or headline:
            ass_path = job_tmp / "subs.ass"
            h_end = headline_end if (headline_end and headline_end > 0) else duration
            build_ass_subtitles(
                segments, caption_style, ass_path,
                karaoke=karaoke,
                headline=headline,
                headline_style=headline_style,
                headline_start=headline_start,
                headline_end=h_end,
                headline_pos=headline_pos,
                effective_silences=effective_silences
            )
            captioned = job_tmp / "captioned.mp4"
            vf_ass = f"ass={ass_path.as_posix()}:fontsdir={FONTS_DIR.as_posix()}" if FONTS_DIR.exists() else f"ass={ass_path.as_posix()}"
            cmd = ["ffmpeg", "-y", "-i", str(current), "-vf", vf_ass,
                   "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "copy", str(captioned)]
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode == 0:
                current = captioned

        # --- Passo D: trilha sonora ---
        if music_id:
            music_path = find_upload(music_id)
            if music_path:
                cmd = ["ffmpeg", "-y", "-i", str(current), "-i", str(music_path),
                       "-filter_complex",
                       f"[0:a]volume=1.0[voice];[1:a]volume={music_volume},aloop=loop=-1:size=2e9[bg];"
                       f"[voice][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]",
                       "-map", "0:v", "-map", "[aout]",
                       "-c:v", "copy", "-c:a", "aac", str(out_path)]
                r = subprocess.run(cmd, capture_output=True, text=True)
                if r.returncode != 0:
                    return jsonify({"error": "Falha ao mixar trilha", "detail": r.stderr[-3000:]}), 500
            elif current != out_path:
                subprocess.run(["ffmpeg", "-y", "-i", str(current), "-c", "copy", str(out_path)],
                                capture_output=True, text=True)
        elif current != out_path:
            subprocess.run(["ffmpeg", "-y", "-i", str(current), "-c", "copy", str(out_path)],
                            capture_output=True, text=True)

        return jsonify({"output": out_path.name})

    except Exception as e:
        import traceback
        traceback.print_exc()
        detail = getattr(e, "stderr", None) or traceback.format_exc()
        return jsonify({"error": f"Erro na edição: {str(e)}", "detail": str(detail)[-3000:]}), 500


@app.route("/output/<filename>")
def serve_output(filename):
    return send_from_directory(OUTPUT_DIR, filename, conditional=True)


if __name__ == "__main__":
    print("\n🎬 Edvid Local rodando em http://localhost:5050\n")
    app.run(host="0.0.0.0", port=5050, debug=True)
