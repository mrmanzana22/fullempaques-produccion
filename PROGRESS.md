# FULLEMPAQUES Produccion - Progreso del Proyecto

> Ultima actualizacion: 2026-01-14

## Estado Actual

PWA de control de produccion para tablets funcionando en:
- **Produccion:** https://fullempaques-produccion.vercel.app/
- **Reportes:** https://fullempaques-produccion.vercel.app/reportes.html (PIN: 9999)

## Stack Tecnologico

- **Frontend:** HTML/CSS/JS vanilla (PWA)
- **Backend:** Supabase (PostgreSQL + Auth + RPC)
- **Deploy:** Vercel
- **Repo:** github.com/mrmanzana22/fullempaques-produccion

---

## Fases Completadas

### Fase 1: Sistema Base
- [x] Login por PIN de operadores
- [x] Lista de Ordenes de Trabajo (OT)
- [x] Pantalla de trabajo con timer
- [x] Flujo: Iniciar -> Pausar -> Reanudar -> Completar
- [x] Service Worker para offline
- [x] Sincronizacion con Supabase

### Fase 2: Control Avanzado (Completada 2026-01-14)
- [x] Calculo automatico de merma (entrada - salida)
- [x] Selector de motivo de merma
- [x] Campo de observaciones de merma
- [x] Display visual de merma con formula
- [x] Eficiencia en tiempo real (tiempo efectivo / pausas / %)
- [x] Dashboard de reportes con PIN supervisor
- [x] Reporte por operador (eficiencia, merma, tiempo)
- [x] Reporte por estacion (uso, tiempos, merma)
- [x] Reporte por OT (estado, progreso)
- [x] Graficos con Chart.js

---

## Tareas Pendientes

### Alertas y Notificaciones
- [ ] Configurar bot de Telegram con @BotFather
- [ ] Obtener Chat ID del grupo de supervisores
- [ ] Configurar n8n (self-hosted o cloud)
- [ ] Workflow n8n: alerta cuando merma > 10%
- [ ] Workflow n8n: alerta cuando pausa > 30 minutos

### Mejoras Futuras (Ideas)
- [ ] Captura de foto de evidencia en merma
- [ ] Panel admin para crear operadores/supervisores
- [ ] Panel admin para gestionar estaciones
- [ ] Exportar reportes a Excel/PDF
- [ ] Notificaciones push en la PWA
- [ ] Modo oscuro/claro toggle

---

## Base de Datos (Supabase)

### Tablas Principales
- `operadores` - Usuarios con PIN
- `estaciones` - Estaciones de trabajo (Diseno, Pre-prensa, Impresion, etc)
- `ordenes_trabajo` - OTs con cliente, producto, estado
- `ot_estaciones` - Relacion OT <-> Estacion con tiempos y merma
- `motivos_pausa` - Catalogo de motivos de pausa
- `motivos_merma` - Catalogo de motivos de merma
- `registro_pausas` - Log de pausas por estacion

### RPCs Importantes
- `iniciar_estacion` - Inicia trabajo en una estacion
- `pausar_estacion` - Registra pausa con motivo
- `reanudar_estacion` - Reanuda trabajo
- `completar_estacion` - Finaliza con cantidad salida y merma

---

## Credenciales y Accesos

| Recurso | Acceso |
|---------|--------|
| Supabase Project | sjfhtopclyxbwzhslhwf |
| PIN Supervisor (reportes) | 9999 |
| PIN Operador prueba | (ver tabla operadores) |

---

## Notas para Proxima Sesion

1. Para alertas Telegram necesitas:
   - Crear bot en @BotFather -> obtener token
   - Agregar bot a grupo -> obtener chat_id
   - Tener n8n corriendo (n8n.io cloud o self-hosted)

2. Los archivos locales estan en:
   ```
   /Users/harecjimenez/Documents/GitHub/litografia-cotizaciones/produccion/
   ```

3. Para probar cambios locales, usar Live Server o similar

4. Service Worker version actual: v12

---

## Comandos Utiles

```bash
# Ver estado del repo local
git status

# Crear estaciones de prueba (SQL en Supabase)
INSERT INTO ot_estaciones (orden_trabajo_id, estacion_id, estado)
SELECT ot.id, 'UUID-ESTACION', 'pendiente'
FROM ordenes_trabajo ot WHERE ot.numero_ot = 'OT-2026-01-XXXX';
```

---

*Actualizado por Claude (Codi) - Fase 2 completada*
