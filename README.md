# Ignite Music - Desktop Companion Launcher & Supervisor

<p align="center">
  <img src="resources/icon.png" width="96" height="96" alt="Ignite Music Icon" />
</p>

<p align="center">
  <strong>Supervisor de escritorio nativo, orquestador de túneles y gestor de ciclo de vida para Ignite Music</strong><br>
  <em>Diseñado con Electron para eliminar dependencias externas y brindar una experiencia plug-and-play.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-33.2.1-47848F?logo=electron&logoColor=white" alt="Electron Version" />
  <img src="https://img.shields.io/badge/Tests-23%20passed-success?logo=node.js&logoColor=white" alt="Tests" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue?logo=windows&logoColor=white" alt="Platforms" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

## 📖 Descripción General

**Ignite Music Desktop** es el cliente complementario oficial para ejecutar y supervisar el bot de música [`ignite-music`](https://github.com/DeibydBarragan/ignite-music). 

A diferencia de las instalaciones tradicionales que exigen instalar Node.js, compilar dependencias C++ nativas y ejecutar scripts de terminal, este launcher empaqueta un runtime aislado y seguro que permite a cualquier usuario o administrador:
- Iniciar, reiniciar y detener el bot con un solo clic.
- Cifrar sus tokens y credenciales mediante el hardware/OS nativo (`safeStorage`).
- Controlar el acceso mediante autenticación OAuth2 de Discord con verificación de servidor (**Gatekeeper**).
- Publicar el panel REST a Internet mediante túneles rápidos de Cloudflare sin abrir puertos en el router.
- Mantener los extractores de audio (`yt-dlp`) actualizados ante bloqueos de plataformas de streaming sin reinstalar la app.

---

## 🚀 Características Principales

| Característica | Detalle Técnico |
| :--- | :--- |
| **Zero-Config Runtime** | No requiere Node.js instalado en el sistema operativo; utiliza el runtime embebido de Electron. |
| **Seguridad de Grado Empresarial** | `contextIsolation: true`, `nodeIntegration: false`, y `sandbox: true` activos. Canales IPC protegidos por lista blanca estricta. |
| **Almacenamiento Cifrado** | Tokens de Discord y secretos de API cifrados con las APIs nativas del SO (`DPAPI` en Windows / `Secret Service` en Linux). |
| **Discord Gatekeeper** | Servidor loopback HTTP efímero (`127.0.0.1:0/callback`) para OAuth2. Verifica membresía y rol administrativo en el servidor de destino. |
| **Consola ANSI en Tiempo Real** | Intérprete nativo de secuencias de escape ANSI, búfer protegido contra saturación de memoria (máx. 1,000 líneas), auto-scroll inteligente y filtros rápidos. |
| **Cloudflare Quick Tunnel** | Binario de `cloudflared` embebido; captura y renderiza automáticamente URLs públicas seguras `https://*.trycloudflare.com` con botón de copia rápida. |
| **Motor de Actualizaciones OTA** | Comprobación asíncrona contra GitHub Releases, descarga atómica y **Rollback automático** en caso de que una versión falle al iniciar. |
| **Mantenimiento yt-dlp** | Descarga independiente de los últimos binarios de extracción de audio con un solo clic. |
| **System Tray** | Minimización automática a la bandeja del sistema al presionar **X**, menú contextual nativo y control de instancia única. |

---

## 📥 Guía para Usuarios Finales

### 1. Instalación en Windows
1. Descarga el instalador más reciente **`Ignite Music-Setup-1.0.0.exe`** desde la sección de **Releases** de GitHub.
2. Ejecuta el archivo y sigue los pasos del asistente de instalación de NSIS.
3. Elige la carpeta de destino y decide si deseas crear accesos directos en el Escritorio y Menú Inicio.
4. Al finalizar, marca la casilla para abrir **Ignite Music** de inmediato.

### 2. Configuración Inicial (Primer Inicio)
Al arrancar la aplicación por primera vez, se abrirá la ventana de configuración:
1. **Discord Bot Token**: Pega el token de tu bot obtenido en el [Discord Developer Portal](https://discord.com/developers/applications).
2. **Client ID**: Copia el *Application ID* de tu aplicación de Discord.
3. **Guild ID**: ID numérico del servidor de Discord donde opera el bot.
4. **Client Secret**: Secreto de cliente de tu aplicación en Discord (necesario para el login OAuth2).
5. **API Secret**: Presiona el botón **[Generar]** para crear una clave de alta entropía (64 caracteres hex) que protegerá tus endpoints REST locales.
6. Haz clic en **Guardar Credenciales**. Tus claves se almacenarán cifradas localmente.

### 3. Identificación y Acceso (Gatekeeper)
1. Presiona el botón **Iniciar Sesión con Discord**.
2. Tu navegador web se abrirá solicitando autorización de identidad.
3. El launcher recibirá el código de forma segura en un puerto local efímero y verificará automáticamente contra la API de Discord:
   - Si eres miembro del servidor configurado: Se desbloqueará el panel de control completo.
   - Si no perteneces al servidor: Se mostrará una pantalla de acceso denegado informativa con opción de reintentar o cambiar de cuenta.

---

## 🛠 Guía de Desarrollo y Comandos

### Requisitos Previos
- Node.js 22.x LTS instalado (solo para desarrollo y compilación).
- npm o gestor compatible.

### Scripts Disponibles

```bash
# Iniciar la aplicación en modo desarrollo con recarga local
npm start

# Ejecutar la suite completa de pruebas unitarias (23 tests nativos)
npm test

# Empaquetar la aplicación en carpeta portable descomprimida (dist/win-unpacked)
npm run pack

# Generar el instalador ejecutable NSIS para Windows (.exe)
npm run dist:win

# Generar el paquete portable para Linux (.AppImage)
npm run dist:linux
```

---

## 🏛 Arquitectura del Proyecto

```text
ignite-music-desktop/
├── .github/workflows/    # Automatización CI/CD de compilación y publicación
│   └── build-desktop.yml # Compila instaladores Windows/Linux ante nuevos tags
├── build/                # Iconos del instalador (.ico, .png)
├── resources/            # Binarios auxiliares embebidos (cloudflared, yt-dlp)
│   └── bin/
│       └── cloudflared.exe
├── src/
│   ├── main/             # Proceso Principal (Supervisión y APIs del SO)
│   │   ├── index.js              # Ciclo de vida de la ventana y single-instance lock
│   │   ├── config-manager.js     # Cifrado seguro seguro vía safeStorage
│   │   ├── config-schema.js      # Esquema de validación y generación de secretos
│   │   ├── auth-manager.js       # Servidor HTTP loopback OAuth2 efímero
│   │   ├── gatekeeper.js         # Validación REST de pertenencia a servidores Discord
│   │   ├── process-supervisor.js # Monitoreo de subproceso (fork) y graceful shutdown
│   │   ├── tunnel-supervisor.js  # Binario cloudflared y detección regex de URLs
│   │   ├── updater-engine.js     # Motor SemVer, releases de GitHub y rollback
│   │   ├── tray-manager.js       # Integración con la bandeja del sistema (System Tray)
│   │   └── ipc-handlers.js       # Registro de canales de comunicación IPC
│   ├── preload/          # Puente Seguro contextBridge
│   │   └── index.js              # API expuesta como window.igniteLauncher
│   └── renderer/         # Interfaz Gráfica (HTML5 / Vanilla ES Modules)
│       ├── index.html            # Estructura visual de la aplicación
│       ├── css/app.css           # Estilos oscuros y diseño modular
│       └── js/                   # Componentes modulares de interfaz (< 150 líneas)
│           ├── app.js            # Punto de entrada y orquestador del frontend
│           ├── auth-view.js      # Máquina de estados de autenticación y bloqueo
│           ├── log-viewer.js     # Consola ANSI en tiempo real y auto-scroll
│           ├── service-controls.js # Controles de Iniciar, Detener, Reiniciar y Uptime
│           ├── settings-modal.js # Formulario de credenciales y generación de claves
│           ├── tunnel-card.js    # Tarjeta de estado de Cloudflare y copia de URL
│           └── update-banner.js  # Notificación de versión y actualización yt-dlp
├── test/                 # Batería de pruebas automatizadas (node:test)
├── electron-builder.yml  # Configuración del empaquetador NSIS y AppImage
└── package.json          # Metadatos del proyecto y dependencias de Electron
```

---

## ❓ Preguntas Frecuentes y Solución de Problemas

### 1. ¿Por qué la ventana no se cierra al hacer clic en la "X"?
La aplicación está configurada para continuar ejecutándose en segundo plano en la bandeja del sistema (junto al reloj de Windows). Para salir definitivamente, haz clic derecho sobre el icono de la llama en el System Tray y selecciona **"Salir de Ignite Music"**.

### 2. ¿Qué hacer si YouTube bloquea la reproducción de canciones?
No es necesario actualizar toda la aplicación. Ve a **⚙️ Configuración** y en la sección *Mantenimiento y Extractores*, presiona **⚡ Actualizar yt-dlp**. El launcher descargará la versión más reciente del extractor en segundos.

### 3. La pantalla muestra "Acceso Denegado"
Asegúrate de:
1. Haber iniciado sesión con la cuenta de Discord correcta.
2. Que tu bot de Discord ya esté unido al servidor cuyo `GUILD_ID` colocaste en la configuración.
3. Pertenecer activamente a dicho servidor de Discord.

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia **MIT**. Desarrollado por [DeibydBarragan](https://github.com/DeibydBarragan).
