# SignLanguage Pro — Despliegue en VPS (Ubuntu/Debian + Docker)

App de traducción de lenguaje de signos (manos + labios + expresiones + postura)
con IA (OpenAI GPT-4o) y MediaPipe en cliente. Multilingüe (LSE / LSM / ASL).

---

## 1. Requisitos

- VPS Linux (Ubuntu 22.04+ o Debian 12+) con al menos **1 vCPU / 1 GB RAM** (recomendado 2 GB).
- Puertos **80** y **443** abiertos (HTTP/HTTPS).
- Dominio apuntando con un registro **A** a la IP pública del VPS.  
  Ejemplo: `signados.cibermedida.es` → IP del VPS.
- Una API key válida de **OpenAI** (https://platform.openai.com/api-keys) — modelo `gpt-4o`.

---

## 2. Instalar Docker (una sola vez en tu VPS)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER     # cierra y vuelve a entrar para aplicar
docker --version
docker compose version
```

---

## 3. Desplegar

```bash
# 1) Clona o copia los archivos del proyecto al VPS
git clone <tu-repo>.git signlanguage-pro
cd signlanguage-pro

# 2) Crea el archivo .env a partir del ejemplo
cp .env.example .env
nano .env       # edita: pon tu OPENAI_API_KEY, dominio, etc.

# 3) (Opcional) cambia el dominio dentro de deploy/Caddyfile si no usas el de ejemplo
nano deploy/Caddyfile

# 4) Construye e inicia todos los servicios
docker compose build
docker compose up -d

# 5) Sigue los logs hasta ver "Application startup complete"
docker compose logs -f --tail=80
```

Caddy obtendrá automáticamente el certificado **Let's Encrypt** la primera vez
que el dominio se resuelva a tu VPS — sin pasos manuales.

Cuando todo esté arriba, abre `https://signados.cibermedida.es` en tu
navegador.

---

## 4. Comandos útiles

```bash
# Estado de servicios
docker compose ps

# Logs por servicio
docker compose logs -f backend
docker compose logs -f caddy
docker compose logs -f frontend

# Reiniciar tras cambios en .env o Caddyfile
docker compose restart backend caddy

# Reconstruir el frontend cuando cambies el código
docker compose build frontend && docker compose up -d frontend

# Backup completo de la base de datos
docker compose exec mongo mongodump --archive --db=signlanguage_pro \
    > backup-$(date +%F).archive

# Restaurar
cat backup-2026-01-15.archive | \
    docker compose exec -T mongo mongorestore --archive --drop
```

---

## 5. Estructura

```
.
├── backend/                   # FastAPI + OpenAI + MongoDB
│   ├── server.py              # Endpoints: /api/translate/*, /api/dictionary, /api/analytics, ...
│   ├── dictionary_data.py     # Diccionario semilla (68 signos LSE/LSM/ASL)
│   ├── requirements.txt
│   └── .env.example
├── frontend/                  # React 19 + Tailwind + MediaPipe + Recharts + jsPDF
├── deploy/
│   ├── Caddyfile              # Reverse proxy + HTTPS automático
│   └── nginx.frontend.conf    # Servir SPA dentro del contenedor frontend
├── Dockerfile.backend
├── Dockerfile.frontend
├── docker-compose.yml
├── .env.example
└── DEPLOY.md                  # (este archivo)
```

---

## 6. Variables de entorno principales

| Variable | Descripción | Por defecto |
| --- | --- | --- |
| `PUBLIC_URL` | URL pública con HTTPS | `https://signados.cibermedida.es` |
| `OPENAI_API_KEY` | **Obligatoria** para producción | — |
| `LLM_VISION_MODEL` | Modelo multimodal | `gpt-4o` |
| `LLM_TEXT_MODEL` | Modelo solo-texto | `gpt-4o-mini` |
| `MAX_VIDEO_MB` | Tamaño máx subida | `250` |
| `RATE_LIMIT_TRANSLATE` | Rate-limit traducciones por IP | `30/minute` |
| `RATE_LIMIT_EVENT` | Rate-limit eventos analytics por IP | `60/minute` |
| `CORS_ORIGINS` | Orígenes permitidos | `https://signados.cibermedida.es` |
| `ALLOWED_HOSTS` | Hosts aceptados | `signados.cibermedida.es,localhost,backend` |

---

## 7. Solución de problemas

| Síntoma | Causa probable | Cómo arreglarlo |
| --- | --- | --- |
| Caddy no obtiene certificado | DNS aún no propagado / firewall | Verifica `dig signados.cibermedida.es` y abre 80/443 |
| Backend `mongo: error` | Mongo aún arrancando | Espera 10-20 s o `docker compose restart backend` |
| 502 Bad Gateway en `/api/*` | Backend caído | `docker compose logs backend` |
| 413 Request Entity Too Large | Vídeo > 250 MB | Sube `MAX_VIDEO_MB` en `.env` y `max_size` en Caddyfile |
| 429 Demasiadas peticiones | Rate-limit alcanzado | Sube `RATE_LIMIT_*` en `.env` |
| Pantalla en blanco | Frontend mal compilado / variable `REACT_APP_BACKEND_URL` vacía | `docker compose build --no-cache frontend && docker compose up -d frontend` |

---

## 8. Mantenimiento

- **Actualizar la app**: pull del repo + `docker compose build && docker compose up -d`.
- **Renovación HTTPS**: automática (Caddy renueva 30 días antes de caducar).
- **Costes IA**: monitoriza en https://platform.openai.com/usage.
  Cada traducción de video usa ~6 imágenes a `gpt-4o` (~$0.02-0.05).
  Texto-a-signos usa `gpt-4o-mini` (~$0.001 por petición).

¡Listo para producción! 🚀
