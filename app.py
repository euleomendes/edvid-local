"""
Edvid Local — editor de vídeo automático rodando 100% no seu computador.
Sem chamadas de API paga: transcrição via Whisper local, tudo mais via FFmpeg/OpenCV local.
"""

import os
import re
import struct
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


def get_font_name(font_path):
    """Extrai o nome da família da fonte (.ttf/.otf) sem dependências externas."""
    try:
        with open(font_path, "rb") as f:
            data = f.read(65536)
        if len(data) < 12:
            return Path(font_path).stem
        num_tables = struct.unpack(">H", data[4:6])[0]
        name_offset = None
        for i in range(num_tables):
            offset = 12 + i * 16
            tag = data[offset:offset+4]
            if tag == b"name":
                name_offset = struct.unpack(">I", data[offset+8:offset+12])[0]
                break
        if name_offset is None:
            return Path(font_path).stem
        if name_offset >= len(data):
            with open(font_path, "rb") as f:
                f.seek(name_offset)
                data = f.read(16384)
                name_offset = 0
        if len(data) >= name_offset + 6:
            count, string_offset = struct.unpack(">HH", data[name_offset+2:name_offset+6])
            records_start = name_offset + 6
            best_name = None
            for j in range(count):
                rec = records_start + j * 12
                if rec + 12 > len(data):
                    break
                platform_id, encoding_id, lang_id, name_id, length, offset = struct.unpack(">HHHHHH", data[rec:rec+12])
                if name_id in (1, 4):
                    str_pos = name_offset + string_offset + offset
                    if str_pos + length <= len(data):
                        raw = data[str_pos:str_pos+length]
                        try:
                            if platform_id == 3 or (platform_id == 0 and len(raw) % 2 == 0):
                                val = raw.decode("utf-16-be").strip()
                            else:
                                val = raw.decode("utf-8", errors="ignore").strip()
                            if val:
                                if name_id == 1:
                                    return val
                                if not best_name:
                                    best_name = val
                        except Exception:
                            pass
            if best_name:
                return best_name
    except Exception:
        pass
    return Path(font_path).stem

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


def check_has_audio(path):
    """Verifica se o arquivo de vídeo possui stream de áudio válido."""
    try:
        proc = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a",
             "-show_entries", "stream=codec_type", "-of", "default=nw=1:nk=1", str(path)],
            capture_output=True, text=True, timeout=5
        )
        return "audio" in proc.stdout.lower()
    except Exception:
        return False


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
    "karaoke_ciano": dict(font="Arial Black", size=15, primary="&H00D2B400", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=3.5, upper=True),
    "karaoke_neon": dict(font="Arial Black", size=15, primary="&H00D2B400", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=3.5, upper=True),
    "destaque": dict(font="Arial Black", size=15, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=3, upper=True),
    "karaoke": dict(font="Arial Black", size=15, primary="&H00006AFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=3, upper=True),
    "pop_destaque": dict(font="Arial Black", size=17, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=4.5, upper=True),
    "caixa_preta_sub": dict(font="Arial Black", size=14, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=3, outline=12, upper=True),
    "caixa_amarela_sub": dict(font="Arial Black", size=14, primary="&H00000000", sec="&H00000000", outline_c="&H0000E6FF", bold=-1, bs=3, outline=12, upper=True),
    "verde_limao": dict(font="Arial Black", size=15, primary="&H005EC522", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=3.5, upper=True),
    "rubi_impacto": dict(font="Arial Black", size=15, primary="&H004444EF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=4, upper=True),
    "ouro_premium": dict(font="Arial Black", size=16, primary="&H0000D7FF", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=4, upper=True),
    "azul_royal": dict(font="Arial Black", size=16, primary="&H00FF9900", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=4, upper=True),
    "roxo_cyber": dict(font="Arial Black", size=16, primary="&H00FF26B0", sec="&H00FFFFFF", outline_c="&H00000000", bold=-1, bs=1, outline=4, upper=True),
    "caixa_vermelha": dict(font="Arial Black", size=14, primary="&H00FFFFFF", sec="&H00FFFFFF", outline_c="&H004444EF", bold=-1, bs=3, outline=12, upper=True),
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


def hex_to_ass_color(hex_str, default="&H00FFFFFF"):
    """Converte formato hex (#RRGGBB ou #RGB) para formato ASS (&H00BBGGRR&)."""
    if not hex_str:
        return default
    s = str(hex_str).strip().lstrip("#")
    if len(s) == 3:
        s = "".join([c * 2 for c in s])
    if len(s) == 6:
        r = s[0:2]
        g = s[2:4]
        b = s[4:6]
        return f"&H00{b.upper()}{g.upper()}{r.upper()}"
    return default


def get_audio_volume(path):
    """Mede o volume médio em dB do áudio usando volumedetect do FFmpeg."""
    try:
        cmd = ["ffmpeg", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        m = re.findall(r"mean_volume:\s*([-\d.]+)\s*dB", proc.stderr)
        if m:
            return float(m[0])
    except Exception:
        pass
    return -24.0


def detect_silences(path, noise_db=None, min_duration=0.22):
    """Detecta intervalos de silêncio/pausas/respiros usando o filtro silencedetect do FFmpeg com limiar adaptativo."""
    if noise_db is None:
        mean_vol = get_audio_volume(path)
        # Volume adaptativo para fala: para áudio médio em -24dB, ruído de respiro/fundo fica ~ -30dB
        noise_db = min(-24.0, max(-35.0, mean_vol - 6.0))

    cmd = [
        "ffmpeg", "-i", str(path),
        "-af", f"silencedetect=noise={noise_db:.1f}dB:d={min_duration}",
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


def chunk_words(words, max_words=2, max_duration=1.0):
    """
    Agrupa palavras individuais em blocos curtos e dinâmicos (1 a 2 palavras por tela).
    Evita sobrecarga visual e melhora a leitura dinâmica.
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


def wrap_headline_lines(text, max_chars=22, uppercase=True):
    """Respeita quebras manuais de linha (\n) e aplica word wrap automático em linhas longas."""
    if not text:
        return []
    import textwrap
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    raw_lines = text.split("\n")
    final_lines = []
    for l in raw_lines:
        line_clean = l.strip()
        if not line_clean:
            continue
        if uppercase:
            line_clean = line_clean.upper()
        if len(line_clean) <= max_chars:
            final_lines.append(line_clean)
        else:
            w_lines = textwrap.wrap(line_clean, width=max_chars, break_long_words=False)
            if w_lines:
                final_lines.extend(w_lines)
            else:
                final_lines.append(line_clean)
    return final_lines


def build_ass_subtitles(segments, style="destaque", out_path=None, karaoke=False, headline=None, headline_style="bebas_impact",
                        headline_start=0.0, headline_end=None, headline_pos="topo", effective_silences=None, caption_style=None,
                        hl_color1=None, hl_color2=None, hl_outline_color=None, caption_disabled=False, hl_color_mode=None,
                        hl_bold=True, hl_italic=False, hl_underline=False, hl_uppercase=True, hl_text_color=None,
                        hl_pos_x=0.50, hl_pos_y=None, hl_scale=1.0, sub_pos_x=0.50, sub_pos_y=0.77, sub_scale=1.0,
                        hl_font=None, hl_letter_spacing=1, hl_line_spacing=1.15,
                        sub_text_color=None, sub_highlight_color=None, sub_outline_color=None):
    if caption_style and (not style or style == "destaque"):
        style = caption_style
    c = dict(CAPTION_STYLES.get(style, CAPTION_STYLES["destaque"]))
    h = dict(HEADLINE_STYLES.get(headline_style, HEADLINE_STYLES["bebas_impact"]))

    # Formatação da headline (Negrito, Itálico, Sublinhado, Cores, Fonte, Espaçamento)
    hl_font_family = hl_font or h["font"]
    hl_fsp = int(round(float(hl_letter_spacing if hl_letter_spacing is not None else 1)))
    hl_lh = float(hl_line_spacing if hl_line_spacing is not None else 1.15)
    hl_lh = max(0.6, min(2.5, hl_lh))

    text_color = hl_text_color or hl_color1
    if text_color:
        c_ass = hex_to_ass_color(text_color, h["primary"])
        h["primary"] = c_ass
        h["sec"] = c_ass
    if hl_outline_color:
        h["outline_c"] = hex_to_ass_color(hl_outline_color, h["outline_c"])

    # Customização de cores das legendas (Color Picker sem Glow)
    if sub_text_color:
        c_ass_base = hex_to_ass_color(sub_text_color, c["sec"])
        c["sec"] = c_ass_base
        if not karaoke:
            c["primary"] = c_ass_base
    if sub_highlight_color:
        c_ass_high = hex_to_ass_color(sub_highlight_color, c["primary"])
        c["primary"] = c_ass_high
    if sub_outline_color:
        c["outline_c"] = hex_to_ass_color(sub_outline_color, c["outline_c"])

    h_bold = -1 if hl_bold else 0
    h_italic = -1 if hl_italic else 0
    h_underline = -1 if hl_underline else 0

    # Coordenadas 2D e escalas personalizadas (padrão zona segura Reels / TikTok: Y >= 420px e <= 1500px)
    if hl_pos_y is None:
        hl_pos_y = 0.225 if headline_pos == "topo" else 0.50 if headline_pos == "centro" else 0.77

    hl_x = int(round(float(hl_pos_x if hl_pos_x is not None else 0.50) * 1080))
    hl_y = int(round(float(hl_pos_y) * 1920))
    hl_scale_val = float(hl_scale or 1.0)
    hl_fs = int(round(h["size"] * 4 * hl_scale_val))

    sub_x = int(round(float(sub_pos_x if sub_pos_x is not None else 0.50) * 1080))
    sub_y = int(round(float(sub_pos_y if sub_pos_y is not None else 0.77) * 1920))
    sub_scale_val = float(sub_scale or 1.0)
    sub_fs = int(round(c["size"] * 4 * sub_scale_val))

    def sty_sub(name, d):
        return (f"Style: {name},{d['font']},{d['size'] * 4},{d['primary']},{d['sec']},{d['outline_c']},&H00000000,"
                f"{d['bold']},0,0,0,100,100,0,0,{d['bs']},{d['outline']},0,2,100,140,440,1")

    def sty_hl(name, d):
        return (f"Style: {name},{hl_font_family},{d['size'] * 4},{d['primary']},{d['sec']},{d['outline_c']},&H00000000,"
                f"{h_bold},{h_italic},{h_underline},0,100,100,0,0,{d['bs']},{d['outline']},0,8,100,140,430,1")

    header = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding\n"
        + sty_sub("Default", c) + "\n" + sty_hl("Headline", h) + "\n\n[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    def fmt_time(t):
        return f"{int(t // 3600)}:{int((t % 3600) // 60):02d}:{t % 60:05.2f}"

    def tx_sub(text, d):
        text = text.replace("\n", " ").strip()
        return text.upper() if d["upper"] else text

    lines = [header]

    # Headline com intervalo de início e fim customizáveis, múltiplas linhas e espaçamento tipográfico
    if headline:
        h_start = float(headline_start or 0.0)
        h_end = float(headline_end if (headline_end is not None and float(headline_end) > 0) else 5.0)
        if effective_silences:
            h_start = map_time_after_cuts(h_start, effective_silences)
            h_end = map_time_after_cuts(h_end, effective_silences)
        if h_end > h_start:
            max_c = max(12, int(round(22 / max(0.4, hl_scale_val))))
            hl_lines = wrap_headline_lines(headline, max_chars=max_c, uppercase=hl_uppercase)
            n_l = len(hl_lines)
            line_height = int(round(hl_fs * hl_lh))
            for i, line_str in enumerate(hl_lines):
                line_y = int(round(hl_y + (i - (n_l - 1) / 2.0) * line_height))
                lines.append(f"Dialogue: 1,{fmt_time(h_start)},{fmt_time(h_end)},Headline,,0,0,0,,{{\\an5\\pos({hl_x},{line_y})\\fs{hl_fs}\\fsp{hl_fsp}\\fn{hl_font_family}}}{line_str}\n")

    # Coleta todas as palavras de todos os segmentos se legendas estiverem ativadas
    all_words = []
    if not caption_disabled and style != "nenhuma" and caption_style != "nenhuma":
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

    # Divide em chunks virais curtos (1 a 2 palavras por tela) posicionados no canvas
    chunks = chunk_words(all_words, max_words=2, max_duration=1.0)
    for chunk in chunks:
        c_start = chunk[0]["start"]
        c_end = chunk[-1]["end"]
        if effective_silences:
            c_start = map_time_after_cuts(c_start, effective_silences)
            c_end = map_time_after_cuts(c_end, effective_silences)
        if c_end <= c_start:
            continue

        if karaoke:
            # Karaokê dinâmico palavra por palavra com tamanho e posição do canvas
            k_words = "".join(f"{{\\k{max(1, int(round((w['end'] - w['start']) * 100)))}}}{tx_sub(w['word'], c)} " for w in chunk)
            line_text = f"{{\\an5\\pos({sub_x},{sub_y})\\fs{sub_fs}\\q2}}{k_words.strip()}"
        else:
            raw_words = " ".join(tx_sub(w["word"], c) for w in chunk)
            line_text = f"{{\\an5\\pos({sub_x},{sub_y})\\fs{sub_fs}\\q2}}{raw_words.strip()}"
        lines.append(f"Dialogue: 0,{fmt_time(c_start)},{fmt_time(c_end)},Default,,0,0,0,,{line_text}\n")

    out_path.write_text("".join(lines), encoding="utf-8")


@app.route("/analyze", methods=["POST"])
def analyze():
    import numpy as np
    p = find_upload(request.json.get("video_id"))
    if not p:
        return jsonify({"error": "Vídeo não encontrado"}), 404
    dur = ffprobe_duration(p)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
                         capture_output=True).stdout
    a = np.abs(np.frombuffer(raw, dtype=np.int16).astype(np.float32))
    peaks = []
    if len(a) > 400:
        peaks = [float(x.max()) for x in np.array_split(a, 400)]
        m = max(peaks) or 1
        peaks = [round(x / m, 3) for x in peaks]

    scene_cuts = detect_cuts(p)
    silences = detect_silences(p)
    silence_cuts = []
    for s, e in silences:
        mid = round((s + e) / 2, 2)
        if 0.4 < mid < dur - 0.4:
            silence_cuts.append(mid)

    # Combina cortes de cena e respiros de áudio sem duplicatas
    all_cuts = sorted(list(set(scene_cuts + silence_cuts)))
    clean_cuts = []
    for c in all_cuts:
        if not clean_cuts or (c - clean_cuts[-1] >= 0.3):
            clean_cuts.append(c)

    return jsonify({"duration": dur, "cuts": clean_cuts, "peaks": peaks})


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
    mimetype = None
    suf = p.suffix.lower()
    if suf == ".mp4":
        mimetype = "video/mp4"
    elif suf in (".jpg", ".jpeg"):
        mimetype = "image/jpeg"
    elif suf == ".png":
        mimetype = "image/png"
    elif suf == ".webp":
        mimetype = "image/webp"
    return send_from_directory(p.parent, p.name, mimetype=mimetype, conditional=True)


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


@app.route("/upload_media", methods=["POST"])
def upload_media():
    files = request.files.getlist("media")
    if not files:
        if "file" in request.files:
            files = [request.files.get("file")]
        elif "video2" in request.files:
            files = [request.files.get("video2")]
    if not files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400

    results = []
    for f in files:
        if not f or not f.filename:
            continue
        ext = Path(f.filename).suffix.lower() or ".jpg"
        file_id = uuid.uuid4().hex[:10]
        path = UPLOAD_DIR / f"{file_id}{ext}"
        f.save(path)
        is_img = ext in {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
        dur = 0.0
        has_audio = False
        if not is_img:
            try:
                dur = ffprobe_duration(path)
            except Exception:
                dur = 5.0
            has_audio = check_has_audio(path)

            # Se o vídeo não for MP4 ou puder ter codec não suportado pelo browser (ex: .mov, .mkv, .avi)
            # converte para MP4 (H.264 + AAC + faststart) para renderização imediata sem tela preta
            if ext != ".mp4":
                conv_path = UPLOAD_DIR / f"{file_id}.mp4"
                try:
                    subprocess.run([
                        "ffmpeg", "-y", "-i", str(path),
                        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
                        "-c:a", "aac", "-b:a", "128k",
                        "-movflags", "+faststart",
                        str(conv_path)
                    ], capture_output=True, timeout=30, check=True)
                    if conv_path.exists() and conv_path.stat().st_size > 500:
                        path.unlink(missing_ok=True)
                        path = conv_path
                        ext = ".mp4"
                except Exception as ex:
                    print("Warning: transcode web media:", ex)

        results.append({
            "file_id": file_id,
            "filename": f.filename,
            "is_image": is_img,
            "duration": dur,
            "has_audio": has_audio,
            "url": f"/media/{file_id}"
        })
    return jsonify({"items": results})


@app.route("/upload_headline_template", methods=["POST"])
def upload_headline_template():
    file = request.files.get("template") or request.files.get("file")
    if not file:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400
    ext = Path(file.filename).suffix.lower() or ".png"
    file_id = uuid.uuid4().hex[:10]
    path = UPLOAD_DIR / f"{file_id}{ext}"
    file.save(path)
    return jsonify({
        "template_id": file_id,
        "filename": file.filename,
        "url": f"/media/{file_id}"
    })


@app.route("/upload_font", methods=["POST"])
def upload_font():
    file = request.files.get("file") or request.files.get("font")
    if not file or not file.filename:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400
    ext = Path(file.filename).suffix.lower()
    if ext not in (".ttf", ".otf"):
        return jsonify({"error": "Formato inválido. Use arquivos .ttf ou .otf"}), 400
    safe_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', Path(file.filename).name)
    save_path = FONTS_DIR / safe_name
    file.save(save_path)
    font_family = get_font_name(save_path)
    return jsonify({
        "status": "ok",
        "name": font_family,
        "filename": safe_name,
        "url": f"/fonts/{safe_name}"
    })


@app.route("/fonts", methods=["GET"])
def list_fonts():
    results = []
    if FONTS_DIR.exists():
        for f in sorted(FONTS_DIR.iterdir()):
            if f.suffix.lower() in (".ttf", ".otf"):
                name = get_font_name(f)
                results.append({
                    "name": name,
                    "filename": f.name,
                    "url": f"/fonts/{f.name}"
                })
    return jsonify({"fonts": results})


@app.route("/fonts/<path:filename>")
def serve_font(filename):
    return send_from_directory(FONTS_DIR, filename)


@app.route("/export", methods=["POST"])
def export():
    data = request.json
    video_path = find_upload(data["video_id"])
    if not video_path:
        return jsonify({"error": "Vídeo não encontrado"}), 404

    video2_path = find_upload(data.get("video2_id")) if data.get("video2_id") else None
    segments = data.get("segments", [])
    caption_style = data.get("caption_style", "hormozi")
    caption_disabled = bool(data.get("caption_disabled")) or (caption_style == "nenhuma")
    headline = (data.get("headline") or "").strip()
    headline_style = data.get("headline_style", "bebas_impact")
    headline_start = float(data.get("headline_start", 0.0) or 0.0)
    headline_end = float(data.get("headline_end", 0.0) or 0.0)
    headline_pos = data.get("headline_pos", "topo")
    headline_template_id = data.get("headline_template_id")
    hl_mode = data.get("hl_mode", "text")
    hl_scale = float(data.get("hl_scale", 1.0) or 1.0)
    hl_pos_x = float(data.get("hl_pos_x", 0.50) if data.get("hl_pos_x") is not None else 0.50)
    hl_pos_y = float(data.get("hl_pos_y", 0.225) if data.get("hl_pos_y") is not None else (0.225 if headline_pos == "topo" else 0.50 if headline_pos == "centro" else 0.77))
    sub_pos_x = float(data.get("sub_pos_x", 0.50) if data.get("sub_pos_x") is not None else 0.50)
    sub_pos_y = float(data.get("sub_pos_y", 0.77) if data.get("sub_pos_y") is not None else 0.77)
    sub_scale = float(data.get("sub_scale", 1.0) or 1.0)
    hl_bold = bool(data.get("hl_bold", True))
    hl_italic = bool(data.get("hl_italic", False))
    hl_underline = bool(data.get("hl_underline", False))
    hl_uppercase = bool(data.get("hl_uppercase", True))
    hl_text_color = data.get("hl_text_color") or data.get("hl_color1") or "#ffffff"
    hl_outline_color = data.get("hl_outline_color") or "#000000"
    hl_font = data.get("hl_font", "Impact")
    hl_letter_spacing = float(data.get("hl_letter_spacing", 1.0) if data.get("hl_letter_spacing") is not None else 1.0)
    hl_line_spacing = float(data.get("hl_line_spacing", 1.15) if data.get("hl_line_spacing") is not None else 1.15)
    sub_text_color = data.get("sub_text_color")
    sub_highlight_color = data.get("sub_highlight_color")
    sub_outline_color = data.get("sub_outline_color")
    karaoke = bool(data.get("karaoke")) or ("karaoke" in caption_style) or (caption_style in ("hormozi", "karaoke_neon", "verde_limao", "rubi_impacto", "caixa_preta_sub", "caixa_amarela_sub", "ouro_premium", "azul_royal", "roxo_cyber", "caixa_vermelha"))
    zoom_continuous = bool(data.get("zoom_continuous"))
    zoom_cuts = bool(data.get("zoom_cuts"))
    flash_cuts = bool(data.get("flash_cuts"))
    cut_silence = bool(data.get("cut_silence", True))
    framing_x = float(data.get("framing_x", 0.50) if data.get("framing_x") is not None else 0.50)
    framing_y = float(data.get("framing_y", 0.10) if data.get("framing_y") is not None else 0.10)
    framing_x2 = float(data.get("framing_x2", 0.50) if data.get("framing_x2") is not None else 0.50)
    framing_y2 = float(data.get("framing_y2", 0.50) if data.get("framing_y2") is not None else 0.50)
    tracking = bool(data.get("tracking"))
    music_id = data.get("music_id")
    music_volume = float(data.get("music_volume", 0.15))

    job_id = uuid.uuid4().hex[:10]
    job_tmp = TMP_DIR / job_id
    job_tmp.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / f"{job_id}.mp4"

    try:
        duration = ffprobe_duration(video_path)

        # --- Passo A: construir vídeo base 1080x1920 com enquadramento ajustável em X e Y ---
        base_path = job_tmp / "base.mp4"
        tipo = data.get("tipo", "unica")

        # Divisão da tela: 60% Apresentador (1152px) e 40% Mídia (768px), totalizando 1920px
        H_PRES = 1152
        H_MEDIA = 768

        crop_x_split = f"max(0\\,min(iw-1080\\,(iw-1080)*{framing_x:.3f}))"
        crop_y_split = f"max(0\\,min(ih-{H_PRES}\\,(ih-{H_PRES})*{framing_y:.3f}))"
        crop_x_single = f"max(0\\,min(iw-1080\\,(iw-1080)*{framing_x:.3f}))"
        crop_y_single = f"max(0\\,min(ih-1920\\,(ih-1920)*{framing_y:.3f}))"

        # Coleta e valida lista de mídias para tela dividida e B-roll (imagens e vídeos)
        media_items_raw = data.get("media_items") or []
        if not media_items_raw and video2_path and data.get("video2_id") != data.get("video_id"):
            media_items_raw = [{
                "file_id": data.get("video2_id"),
                "start": 0.0,
                "end": duration,
                "framing_x": framing_x2,
                "framing_y": framing_y2
            }]

        valid_media = []
        for m in media_items_raw:
            fid = m.get("file_id")
            # ISOLAMENTO DO VÍDEO PRINCIPAL: não mistura com o vídeo do apresentador
            if not fid or fid == data.get("video_id"):
                continue
            p = find_upload(fid)
            if p and p != video_path:
                s = max(0.0, float(m.get("start", 0.0) or 0.0))
                e = float(m.get("end", duration) or duration)
                if e <= s:
                    e = min(duration, s + 3.0)
                fx = float(m.get("framing_x", framing_x2) if m.get("framing_x") is not None else framing_x2)
                fy = float(m.get("framing_y", framing_y2) if m.get("framing_y") is not None else framing_y2)
                is_img = p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
                is_muted = bool(m.get("muted", False))
                vol = float(m.get("volume", 1.0) if m.get("volume") is not None else 1.0)
                vol = max(0.0, min(2.0, vol))
                has_audio = (not is_img) and (not is_muted) and (vol > 0.0) and check_has_audio(p)
                valid_media.append({
                    "path": p,
                    "start": round(s, 2),
                    "end": round(e, 2),
                    "framing_x": max(0.0, min(1.0, fx)),
                    "framing_y": max(0.0, min(1.0, fy)),
                    "is_img": is_img,
                    "muted": is_muted,
                    "volume": vol,
                    "has_audio": has_audio
                })

        if tipo in ("dividida", "dividida2") and valid_media:
            # Constrói inputs e filter_complex para tela dividida 60%/40% com múltiplas imagens/vídeos
            media_input_args = []
            filter_parts = []
            
            # Base para o slot de mídia (1080x768 - 40%)
            filter_parts.append(f"color=c=#0d1016:s=1080x{H_MEDIA}:r=30:d={duration:.2f}[mbase0]")
            
            for i, item in enumerate(valid_media):
                idx = 1 + i
                crop_x_item = f"max(0\\,min(iw-1080\\,(iw-1080)*{item['framing_x']:.3f}))"
                crop_y_item = f"max(0\\,min(ih-{H_MEDIA}\\,(ih-{H_MEDIA})*{item['framing_y']:.3f}))"
                if item["is_img"]:
                    media_input_args.extend(["-loop", "1", "-framerate", "30", "-t", f"{duration:.2f}", "-i", str(item["path"])])
                    filter_parts.append(
                        f"[{idx}:v]scale=1080:{H_MEDIA}:force_original_aspect_ratio=increase,crop=1080:{H_MEDIA}:{crop_x_item}:{crop_y_item}[mscale{i}];"
                        f"[mbase{i}][mscale{i}]overlay=0:0:enable='between(t,{item['start']:.2f},{item['end']:.2f})':eof_action=pass[mbase{i+1}]"
                    )
                else:
                    media_input_args.extend(["-stream_loop", "-1", "-i", str(item["path"])])
                    filter_parts.append(
                        f"[{idx}:v]scale=1080:{H_MEDIA}:force_original_aspect_ratio=increase,crop=1080:{H_MEDIA}:{crop_x_item}:{crop_y_item},setpts=PTS-STARTPTS+{item['start']:.2f}/TB[mscale{i}];"
                        f"[mbase{i}][mscale{i}]overlay=0:0:enable='between(t,{item['start']:.2f},{item['end']:.2f})':eof_action=pass[mbase{i+1}]"
                    )

            mmedia = f"[mbase{len(valid_media)}]"
            
            # Slot do apresentador (1080x1152 - 60%)
            filter_parts.append(f"[0:v]scale=1080:{H_PRES}:force_original_aspect_ratio=increase,crop=1080:{H_PRES}:{crop_x_split}:{crop_y_split}[pres]")

            if tipo == "dividida":
                # Mídia (40%) em cima, Apresentador (60%) embaixo
                filter_parts.append(f"{mmedia}[pres]vstack=inputs=2[v]")
            else:
                # Apresentador (60%) em cima, Mídia (40%) embaixo
                filter_parts.append(f"[pres]{mmedia}vstack=inputs=2[v]")

            # Mixagem de áudio dos clipes de vídeo da timeline com som ativo
            audio_tracks = []
            for i, item in enumerate(valid_media):
                idx = 1 + i
                if item["has_audio"]:
                    dur_clip = item["end"] - item["start"]
                    delay_ms = int(item["start"] * 1000)
                    vol = item["volume"]
                    filter_parts.append(
                        f"[{idx}:a]atrim=0:{dur_clip:.2f},asetpts=PTS-STARTPTS,adelay={delay_ms}|{delay_ms},volume={vol:.2f}[aclip{i}]"
                    )
                    audio_tracks.append(f"[aclip{i}]")

            if audio_tracks:
                filter_parts.append(f"[0:a]{''.join(audio_tracks)}amix=inputs={1 + len(audio_tracks)}:duration=first:dropout_transition=0[aout]")
                audio_map_args = ["-map", "[aout]"]
            else:
                audio_map_args = ["-map", "0:a"]

            fc = ";".join(filter_parts)
            cmd = [
                "ffmpeg", "-y", "-i", str(video_path), *media_input_args,
                "-filter_complex", fc,
                "-map", "[v]", *audio_map_args, "-r", "30",
                "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac",
                str(base_path)
            ]
            subprocess.run(cmd, capture_output=True, text=True, check=True)
        elif tipo in ("dividida", "dividida2"):
            # Modo tela dividida 60%/40% sem mídias: slot escuro e elegante
            filter_parts = [
                f"color=c=#0d1016:s=1080x{H_MEDIA}:r=30:d={duration:.2f}[mmedia]",
                f"[0:v]scale=1080:{H_PRES}:force_original_aspect_ratio=increase,crop=1080:{H_PRES}:{crop_x_split}:{crop_y_split}[pres]"
            ]
            if tipo == "dividida":
                filter_parts.append("[mmedia][pres]vstack=inputs=2[v]")
            else:
                filter_parts.append("[pres][mmedia]vstack=inputs=2[v]")
            fc = ";".join(filter_parts)
            cmd = [
                "ffmpeg", "-y", "-i", str(video_path),
                "-filter_complex", fc,
                "-map", "[v]", "-map", "0:a", "-r", "30",
                "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac",
                str(base_path)
            ]
            subprocess.run(cmd, capture_output=True, text=True, check=True)
        elif valid_media:
            # Modo tela única com B-roll / mídias na timeline
            media_input_args = []
            filter_parts = [f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:{crop_x_single}:{crop_y_single}[basev0]"]
            for i, item in enumerate(valid_media):
                idx = 1 + i
                crop_x_item = f"max(0\\,min(iw-1080\\,(iw-1080)*{item['framing_x']:.3f}))"
                crop_y_item = f"max(0\\,min(ih-1920\\,(ih-1920)*{item['framing_y']:.3f}))"
                if item["is_img"]:
                    media_input_args.extend(["-loop", "1", "-framerate", "30", "-t", f"{duration:.2f}", "-i", str(item["path"])])
                    filter_parts.append(
                        f"[{idx}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:{crop_x_item}:{crop_y_item}[mscale{i}];"
                        f"[basev{i}][mscale{i}]overlay=0:0:enable='between(t,{item['start']:.2f},{item['end']:.2f})':eof_action=pass[basev{i+1}]"
                    )
                else:
                    media_input_args.extend(["-stream_loop", "-1", "-i", str(item["path"])])
                    filter_parts.append(
                        f"[{idx}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:{crop_x_item}:{crop_y_item},setpts=PTS-STARTPTS+{item['start']:.2f}/TB[mscale{i}];"
                        f"[basev{i}][mscale{i}]overlay=0:0:enable='between(t,{item['start']:.2f},{item['end']:.2f})':eof_action=pass[basev{i+1}]"
                    )
            filter_parts.append(f"[basev{len(valid_media)}]copy[v]")
            # Mixagem de áudio dos clipes de vídeo da timeline com som ativo
            audio_tracks = []
            for i, item in enumerate(valid_media):
                idx = 1 + i
                if item["has_audio"]:
                    dur_clip = item["end"] - item["start"]
                    delay_ms = int(item["start"] * 1000)
                    vol = item["volume"]
                    filter_parts.append(
                        f"[{idx}:a]atrim=0:{dur_clip:.2f},asetpts=PTS-STARTPTS,adelay={delay_ms}|{delay_ms},volume={vol:.2f}[aclip{i}]"
                    )
                    audio_tracks.append(f"[aclip{i}]")

            if audio_tracks:
                filter_parts.append(f"[0:a]{''.join(audio_tracks)}amix=inputs={1 + len(audio_tracks)}:duration=first:dropout_transition=0[aout]")
                audio_map_args = ["-map", "[aout]"]
            else:
                audio_map_args = ["-map", "0:a"]

            fc = ";".join(filter_parts)
            cmd = [
                "ffmpeg", "-y", "-i", str(video_path), *media_input_args,
                "-filter_complex", fc,
                "-map", "[v]", *audio_map_args, "-r", "30",
                "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac",
                str(base_path)
            ]
            subprocess.run(cmd, capture_output=True, text=True, check=True)
        elif tracking:
            points, w, h = detect_face_positions(video_path, sample_every=1.0)
            crop_expr = build_tracking_crop_expr(points, w, h)
            vf = (f"{crop_expr},scale=1080:1920" if crop_expr
                  else f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:{crop_x_single}:{crop_y_single}")
            cmd = ["ffmpeg", "-y", "-i", str(video_path), "-vf", vf, "-r", "30",
                   "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", str(base_path)]
            subprocess.run(cmd, capture_output=True, text=True, check=True)
        else:
            vf = f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:{crop_x_single}:{crop_y_single}"
            cmd = ["ffmpeg", "-y", "-i", str(video_path),
                   "-vf", vf,
                   "-r", "30", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", str(base_path)]
            subprocess.run(cmd, capture_output=True, text=True, check=True)

        current = base_path

        # --- Passo B: corte de silêncios/respiros + flash nas transições + zoom nos cortes ---
        effective_silences = []
        if cut_silence:
            raw_silences = detect_silences(current)
            speech_intervals, effective_silences = compute_speech_intervals(duration, raw_silences, pad=0.04)

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

        # --- Passo C: modelo/template de headline + legendas dinâmicas e headline ---
        if hl_mode == "file" and headline_template_id:
            tpl_path = find_upload(headline_template_id)
            if tpl_path:
                tpl_out = job_tmp / "tpl_applied.mp4"
                tpl_w = int(round(1080 * 0.90 * hl_scale))
                target_x = int(round(hl_pos_x * 1080))
                target_y = int(round(hl_pos_y * 1920))
                h_start = float(headline_start or 0.0)
                h_end = float(headline_end if (headline_end and float(headline_end) > 0) else duration)
                if effective_silences:
                    h_start = map_time_after_cuts(h_start, effective_silences)
                    h_end = map_time_after_cuts(h_end, effective_silences)
                fc_tpl = (
                    f"[1:v]scale={tpl_w}:-1[tpl];"
                    f"[0:v][tpl]overlay=x='({target_x}-w/2)':y='({target_y}-h/2)':enable='between(t,{h_start:.2f},{h_end:.2f})'[v]"
                )
                cmd = ["ffmpeg", "-y", "-i", str(current), "-i", str(tpl_path), "-filter_complex", fc_tpl,
                       "-map", "[v]", "-map", "0:a",
                       "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "copy", str(tpl_out)]
                r = subprocess.run(cmd, capture_output=True, text=True)
                if r.returncode == 0:
                    current = tpl_out

        has_subtitles = bool(segments) and not caption_disabled and (caption_style != "nenhuma")
        has_headline_text = bool(headline) and (hl_mode != "file")

        if has_subtitles or has_headline_text:
            ass_path = job_tmp / "subs.ass"
            h_end = headline_end if (headline_end and headline_end > 0) else duration
            build_ass_subtitles(
                segments, caption_style, ass_path,
                karaoke=karaoke,
                headline=(headline if has_headline_text else None),
                headline_style=headline_style,
                headline_start=headline_start,
                headline_end=h_end,
                headline_pos=headline_pos,
                effective_silences=effective_silences,
                caption_style=caption_style,
                hl_color1=hl_text_color,
                hl_outline_color=hl_outline_color,
                caption_disabled=caption_disabled,
                hl_bold=hl_bold,
                hl_italic=hl_italic,
                hl_underline=hl_underline,
                hl_uppercase=hl_uppercase,
                hl_text_color=hl_text_color,
                hl_pos_x=hl_pos_x,
                hl_pos_y=hl_pos_y,
                hl_scale=hl_scale,
                sub_pos_x=sub_pos_x,
                sub_pos_y=sub_pos_y,
                sub_scale=sub_scale,
                hl_font=hl_font,
                hl_letter_spacing=hl_letter_spacing,
                hl_line_spacing=hl_line_spacing,
                sub_text_color=sub_text_color,
                sub_highlight_color=sub_highlight_color,
                sub_outline_color=sub_outline_color
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
