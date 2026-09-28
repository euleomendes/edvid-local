#!/bin/bash
cd "$(dirname "$0")"

echo "=========================================="
echo "🚀 Enviando Edvid Local para o GitHub..."
echo "=========================================="
echo "Destino: https://github.com/euleomendes/edvid-local.git"
echo ""

git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ Projeto enviado com sucesso para o GitHub!"
    echo "Acesse: https://github.com/euleomendes/edvid-local"
    echo "=========================================="
else
    echo ""
    echo "=========================================="
    echo "⚠️ O GitHub pediu autenticação."
    echo "Lembre-se: em 'Password', use o seu Personal Access Token (PAT) do GitHub, não a senha comum da conta."
    echo "Gere um token com permissão 'repo' em:"
    echo "👉 https://github.com/settings/tokens"
    echo "=========================================="
fi

echo ""
read -p "Pressione Enter para fechar..."
