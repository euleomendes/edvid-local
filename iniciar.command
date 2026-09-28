#!/bin/bash
# Duplo clique para iniciar o Edvid Local
cd "$(dirname "$0")"

echo "=========================================="
echo "🎬 Iniciando Edvid Local..."
echo "=========================================="

# 1. Detectar python3
if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "❌ Erro: Python 3 não foi encontrado no sistema!"
    echo "Instale o Python via https://www.python.org/downloads/ ou 'brew install python'"
    read -p "Pressione Enter para fechar..."
    exit 1
fi

# 2. Verificar/Criar ambiente virtual (venv)
if [ ! -d "venv" ] || [ ! -f "venv/bin/activate" ]; then
    echo "📦 Criando ambiente virtual (venv)..."
    $PYTHON_CMD -m venv venv
    if [ $? -ne 0 ]; then
        echo "❌ Falha ao criar o ambiente virtual."
        read -p "Pressione Enter para fechar..."
        exit 1
    fi
fi

source venv/bin/activate

# 3. Verificar dependências
python -c "import flask" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⬇️ Primeira execução: instalando dependências necessárias..."
    echo "Isso pode levar alguns instantes (Flask, faster-whisper, OpenCV, numpy)..."
    pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "❌ Falha ao instalar dependências. Verifique sua conexão à internet."
        read -p "Pressione Enter para fechar..."
        exit 1
    fi
fi

# 4. Verificar FFmpeg
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
python -c "import static_ffmpeg; static_ffmpeg.add_paths()" 2>/dev/null
if command -v ffmpeg >/dev/null 2>&1; then
    echo "✓ FFmpeg disponível e pronto para uso."
else
    echo "⚠️ AVISO: 'ffmpeg' não encontrado no PATH."
fi

# 5. Abrir navegador assim que o servidor responder
(
    for i in {1..25}; do
        if curl -s http://localhost:5050 >/dev/null 2>&1; then
            open http://localhost:5050
            break
        fi
        sleep 1
    done
) &

echo "🚀 Servidor iniciando em http://localhost:5050"
echo "Pressione Ctrl+C para encerrar o servidor."
echo "=========================================="

python app.py

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ O servidor foi encerrado com erro."
    read -p "Pressione Enter para fechar esta janela..."
fi
