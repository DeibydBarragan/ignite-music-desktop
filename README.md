# Ignite Music - Desktop Companion Launcher & Supervisor

Cliente de escritorio nativo desarrollado con **Electron**, diseñado para proporcionar una experiencia de administración local robusta, visual y segura para `ignite-music` sin requerir que el usuario final instale Node.js, configure variables de entorno por terminal o gestione dependencias manuales.

---

## 🚀 Características Principales

- **Runtime Embebido (Zero-Config)**: Se ejecuta de forma autónoma con el runtime de Electron, sin necesidad de instalar Node.js ni herramientas de desarrollo externas.
- **Seguridad Nativa**:
  - `contextIsolation: true`, `nodeIntegration: false`, y `sandbox: true` activos en todos los renderers.
  - Cifrado a nivel de sistema operativo para credenciales y tokens mediante `safeStorage` de Electron.
  - Canal IPC tipado y filtrado con lista blanca estricta.
- **Control de Acceso Gatekeeper (Discord OAuth2)**:
  - Servidor loopback efímero local para autenticación mediante Discord OAuth2.
  - Validación directa contra la API de Discord para verificar que el usuario pertenezca al servidor (`GUILD_ID`) y cuente con permisos autorizados.
- **Supervisión de Procesos y Logs ANSI**:
  - Ejecución en subproceso (`fork`) de `ignite-music` con apagado ordenado (`SIGTERM` con timeout a `SIGKILL`).
  - Terminal de logs en tiempo real con intérprete de colores ANSI, pausa inteligente en scroll y filtros por nivel.
- **Orquestación de Cloudflare Quick Tunnel**:
  - Detección automática de la URL pública (`https://*.trycloudflare.com`) desde el flujo de salida de `cloudflared`.
  - Tarjeta interactiva con copia de enlace con un clic y apertura rápida en el navegador.
- **Motor de Actualizaciones OTA y Mantenimiento**:
  - Detección de versiones mediante GitHub Releases y comparación SemVer.
  - Respaldo previo y mecanismo de *rollback* automático ante errores de arranque.
  - Botón de actualización independiente para extractores de audio (`yt-dlp`).
- **Instalador Nativo para Windows (NSIS)**:
  - Asistente de instalación personalizable, soporte de accesos directos y minimización en segundo plano en la bandeja del sistema (*System Tray*).

---

## 🛠 Comandos de Desarrollo

```bash
# Iniciar la aplicación en modo desarrollo
npm start

# Ejecutar la suite completa de pruebas unitarias
npm test

# Empaquetar la aplicación en carpeta desempaquetada (win-unpacked)
npm run pack

# Compilar el instalador ejecutable NSIS para Windows (.exe)
npm run dist:win

# Compilar el paquete para Linux (.AppImage)
npm run dist:linux
```

---

## 🏛 Arquitectura de Carpetas

```text
ignite-music-desktop/
├── build/                # Iconos del instalador (.ico, .png)
├── resources/            # Binarios auxiliares embebidos (cloudflared, yt-dlp)
├── src/
│   ├── main/             # Proceso principal (Supervisores y APIs nativas)
│   │   ├── index.js              # Ciclo de vida y gestión de ventanas
│   │   ├── config-manager.js     # Cifrado seguro de credenciales (safeStorage)
│   │   ├── config-schema.js      # Validación de esquema y entropía
│   │   ├── auth-manager.js       # Servidor loopback OAuth2 de Discord
│   │   ├── gatekeeper.js         # Verificación de pertenencia a servidores
│   │   ├── process-supervisor.js # Monitoreo de subproceso de ignite-music
│   │   ├── tunnel-supervisor.js  # Binario de cloudflared y captura de URL
│   │   ├── updater-engine.js     # Motor OTA, rollback y actualizador yt-dlp
│   │   ├── tray-manager.js       # Menú e ícono en System Tray
│   │   └── ipc-handlers.js       # Enrutamiento y validación de canales IPC
│   ├── preload/          # Puente seguro contextBridge
│   │   └── index.js              # Contrato window.igniteLauncher
│   └── renderer/         # Interfaz de usuario (HTML5 / Vanilla ES Modules)
│       ├── index.html            # Estructura principal
│       ├── css/app.css           # Tema oscuro y variables de diseño
│       └── js/                   # Módulos de componentes de interfaz
├── test/                 # Batería de pruebas automatizadas (node:test)
├── electron-builder.yml  # Configuración de empaquetado NSIS y AppImage
└── package.json          # Metadatos y scripts
```
