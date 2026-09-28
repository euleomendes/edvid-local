# 🎬 Edvid Local

Editor de vídeo automático vertical estilo TikTok/Reels/Shorts rodando **100% no seu computador**.
- **Zero consumo de API paga ou nuvem** (funciona 100% offline após instalado).
- **Sem limites de vídeos ou cobrança por tokens**.
- **Modelos locais**: Faster-Whisper para transcrição, FFmpeg para corte e composição, OpenCV para visão computacional.

---

## ✨ Principais Funcionalidades

1. **✂️ Recorte Automático de Silêncios e Respiros (Jump Cuts)**:
   - Detecta pausas, hesitações e silêncios (`silencedetect`) e junta apenas a fala contínua, deixando o vídeo dinâmico e acelerado.
2. **💬 Legendas Dinâmicas Virais (1 a 3 palavras por tela)**:
   - Quebra as frases em blocos curtos e ágeis de 1 a 3 palavras.
   - Efeito **Karaokê ativo**: a palavra falada no milissegundo exato se destaca em amarelo vibrante com contorno preto nítido (estilo Alex Hormozi).
3. **⚡ Flash e Zoom Punch-in nos Cortes**:
   - Transição com flash suave branco de 2 frames a cada novo trecho de fala.
   - Alternância automática de zoom punch-in (`1.15x`) nos cortes.
4. **🎚️ Controle Total de Headline**:
   - Duração personalizável (5s, 10s ou Vídeo Todo).
   - Posicionamento em Topo, Centro ou Base.
   - **Barra arrastável na Timeline**: clique e arraste a barra amarela (`T`) diretamente na timeline para posicionar a headline em qualquer trecho do vídeo.
5. **↕️ Enquadramento Vertical Interativo (Sem Cortar Cabeça)**:
   - Controle de altura da câmera (`framing_y`), garantindo que a cabeça do apresentador nunca seja cortada no topo.
   - Ajustável com predefinições e arrasto com o mouse diretamente sobre o player de vídeo.
   - Botão **⚡ Reaplicar Enquadramento** para re-renderizar em segundos sem precisar transcrever novamente.
6. **📱 Tela Dividida e Suporte a Imagens**:
   - Suporte a empilhar 2 vídeos ou 1 vídeo com foto/imagem estática de apoio.
7. **🔔 Notificação Sonora e Visual**:
   - Chime sonoro via Web Audio API e modal automático de download quando a renderização termina.
8. **🔤 Pasta de Fontes Customizadas (`fonts/`)**:
   - Basta soltar fontes `.ttf` ou `.otf` na pasta `fonts/` para usá-las automaticamente nas legendas.

---

## 🚀 Como Instalar em Outro Computador

### 🍎 No Mac (macOS)

1. **Clone ou baixe este repositório**:
   ```bash
   git clone https://github.com/SEU_USUARIO/edvid-local.git
   cd edvid-local
   ```
2. **Execute com 1 clique**:
   - Dê um **duplo clique** no arquivo `iniciar.command`.
   - O script criará o ambiente virtual `venv`, instalará todas as dependências do `requirements.txt` automaticamente e abrirá o navegador em `http://localhost:5050`.

*(Se o Mac exibir aviso de segurança na primeira vez: clique com botão direito em `iniciar.command` > Abrir).*

---

### 🪟 No Windows

1. **Clone ou baixe este repositório**:
   ```bash
   git clone https://github.com/SEU_USUARIO/edvid-local.git
   cd edvid-local
   ```
2. **Certifique-se de ter o Python instalado**:
   - Baixe o Python 3.10+ em [python.org](https://www.python.org/downloads/) e marque a opção **"Add Python to PATH"** durante a instalação.
3. **Execute com 1 clique**:
   - Dê um **duplo clique** no arquivo `iniciar.bat`.
   - Ele criará o `venv`, instalará as dependências e abrirá `http://localhost:5050`.

---

### 🐧 No Linux (Ubuntu / Debian / Fedora)

1. **Clone o repositório**:
   ```bash
   git clone https://github.com/SEU_USUARIO/edvid-local.git
   cd edvid-local
   ```
2. **Execute o script**:
   ```bash
   chmod +x iniciar.sh
   ./iniciar.sh
   ```

---

## 🛠️ Execução Manual (Qualquer Sistema)

Caso prefira rodar via terminal:

```bash
# 1. Criar ambiente virtual
python3 -m venv venv

# 2. Ativar ambiente virtual
source venv/bin/activate       # Mac/Linux
# ou venv\Scripts\activate     # Windows

# 3. Instalar dependências
pip install -r requirements.txt

# 4. Rodar o servidor
python app.py
```
Acesse no seu navegador: **`http://localhost:5050`**

---

## 📁 Estrutura do Projeto

```text
edvid-local/
├── app.py                 # Backend Flask, FFmpeg pipeline e Faster-Whisper
├── requirements.txt       # Dependências Python
├── iniciar.command        # Inicializador 1-clique para macOS
├── iniciar.bat            # Inicializador 1-clique para Windows
├── iniciar.sh             # Inicializador para Linux
├── templates/
│   └── index.html         # Interface web (Corte, Estilo e Timeline Visual)
├── static/
│   ├── style.css          # Estilos e temas visuais
│   └── script.js          # Lógica do player, sincronização e timeline
├── fonts/                 # Coloque fontes .ttf/.otf adicionais aqui
├── uploads/               # Vídeos e mídias carregadas temporariamente
├── output/                # Vídeos finais exportados
└── tmp/                   # Arquivos temporários de processamento
```

---

## 📄 Licença
Uso livre para produção de conteúdo e automação de vídeos.
