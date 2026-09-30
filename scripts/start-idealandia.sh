#!/bin/bash

echo "🔐 Iniciando túnel hacia la BD de producción..."

ssh -i ~/.ssh/idealandia_codespaces \
  -N \
  -L 3306:10.0.1.137:3306 \
  opc@163.192.143.182 &

SSH_PID=$!

echo "⏳ Esperando a que el túnel esté disponible..."

TUNNEL_OK=false

for i in {1..30}; do
  if ss -ltn | grep -qE '127\.0\.0\.1:3306|\[::1\]:3306'; then
    TUNNEL_OK=true
    break
  fi

  if ! kill -0 "$SSH_PID" 2>/dev/null; then
    echo "❌ El túnel SSH terminó inesperadamente."
    exit 1
  fi

  sleep 1
done

if [ "$TUNNEL_OK" = false ]; then
  echo "❌ No fue posible establecer el túnel SSH."
  kill "$SSH_PID" 2>/dev/null
  exit 1
fi

echo "✅ Túnel establecido correctamente."
echo "🚀 Iniciando Idealandia..."

trap 'echo "🛑 Cerrando túnel SSH..."; kill "$SSH_PID" 2>/dev/null' EXIT

npm start
