@echo off
title Edvid Local
echo ==========================================
echo Iniciando Edvid Local no Windows...
echo ==========================================

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Python nao encontrado. Instale o Python 3.10+ em python.org marcando "Add to PATH".
    pause
    exit /b 1
)

if not exist venv (
    echo Criando ambiente virtual...
    python -m venv venv
)

call venv\Scripts\activate

python -c "import flask" >nul 2>nul
if %errorlevel% neq 0 (
    echo Instalando dependencias na primeira execucao...
    pip install -r requirements.txt
)

start "" http://localhost:5050
echo Servidor rodando em http://localhost:5050
python app.py
pause
