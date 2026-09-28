#!/bin/bash
# Script de inicialização do Edvid Local para Linux
cd "$(dirname "$0")"

echo "=========================================="
echo "🎬 Iniciando Edvid Local..."
echo "=========================================="

if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "❌ Erro: Python 3 não foi encontrado no sistema!"
    exit 1
fi

if [ ! -d "venv" ]; then
    echo "📦 Criando ambiente virtual..."
    $PYTHON_CMD -m venv venv
fi

source venv/bin/activate

python -c "import flask" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⬇️ Instalando dependências..."
    pip install -r requirements.txt
fi

(
    for i in {1..20}; do
        if curl -s http://localhost:5050 >/dev/null 2>&1; then
            xdg-open http://localhost:5050 2>/dev/null || sensible-browser http://localhost:5050 2>/dev/null
            break
        fi
        sleep 1
    done
) &

echo "🚀 Servidor rodando em http://localhost:5050"
python app.py
