# RFP 2026-2027 · Matriz de Tarifas Marítimas (Anexo B)

Aplicación web para que los oferentes llenen la matriz de tarifas (CR, SV, GT, VNZ) y un panel administrativo con login para revisar, filtrar, exportar a Excel y ver un dashboard de KPIs. Todo se guarda en Supabase.

## Archivos

| Archivo | Qué es | Quién lo usa |
|---|---|---|
| `supabase_setup.sql` | Script que crea tablas, seguridad (RLS), función de envío y vistas | Tú, una sola vez |
| `index.html` | Formulario público (réplica del Anexo B) | Los oferentes |
| `admin.html` | Panel administrativo con login, filtros, Excel y dashboard | Solo administradores |

## Puesta en marcha (10 minutos)

**1. Crea el proyecto en Supabase**
Entra a [supabase.com](https://supabase.com) → New project. Espera a que termine de aprovisionarse.

**2. Ejecuta el script SQL**
SQL Editor → New query → pega todo el contenido de `supabase_setup.sql`.
Antes de correrlo, busca la línea marcada con **«CAMBIA ESTO»** (sección 5) y escribe el correo real del administrador. Presiona **Run**. El script se puede volver a ejecutar sin dañar datos.

**3. Crea el usuario administrador**
Authentication → Users → **Add user** → usa el **mismo correo** que pusiste en el paso 2, asigna una contraseña y marca *Auto Confirm User*. Los oferentes **no** necesitan usuario.
*Recomendado:* en Authentication → Sign In / Up, desactiva los registros públicos (*Allow new users to sign up*). Aunque la lista blanca `rfp_admins` ya protege el panel, así nadie puede crearse cuentas.

**4. Conecta la aplicación**
Project Settings → **API** → copia la *Project URL* y la *anon public key*. Ábrelos con cualquier editor de texto y pégalos al inicio del bloque `<script>` **en los dos archivos** (`index.html` y `admin.html`):

```js
const SUPABASE_URL      = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

**5. Publica**
Sube los dos archivos HTML a cualquier hosting estático (Netlify Drop, Vercel, GitHub Pages, tu servidor…). No necesitan build ni servidor de backend.

- Comparte **`index.html`** con los oferentes.
- Guarda **`admin.html`** para el equipo interno (de todas formas exige login + lista blanca).

## Cómo funciona por dentro

- El oferente elige *Marítimos CR / SV / GT / VNZ*, llena la matriz (54 rutas, mismas columnas y condiciones comerciales que el Excel) y envía. El formulario llama a la función `submit_rfp()` de Postgres, que valida e inserta todo de forma atómica y devuelve un **folio**.
- Solo se guardan las filas de rutas que el oferente completó; así la cobertura (rutas cotizadas / 54) queda medible.
- **Seguridad:** RLS activado en todas las tablas. El rol público (`anon`) no puede leer ni escribir tablas: su única puerta es `submit_rfp()`. Los usuarios autenticados solo ven datos si su correo está en la tabla `rfp_admins`.

### Tablas

- `rfp_submissions` — una fila por respuesta: país, oferente, correo y las condiciones comerciales (vigencia, incluye/no incluye, crédito, observaciones y los 5 gastos en destino en USD).
- `rfp_rates` — una fila por ruta cotizada: días libres, naviera(s), tránsito, puerto y tarifas 20" STD / 40" STD / 40" HC en USD.
- `rfp_admins` — lista blanca de correos con acceso al panel.
- Vistas `v_rfp_respuestas` y `v_rfp_tarifas` — lo que consume el panel (respetan RLS).

## Panel administrativo

- **Respuestas:** filtros por país, oferente/correo y rango de fechas; ver el detalle completo de cada respuesta; eliminarla si hace falta.
- **Excel:**
  - *Exportar Excel (filtrado)* → un archivo con dos hojas: `Respuestas` (una fila por envío con sus condiciones) y `Tarifas` (todas las rutas en formato plano, listo para tablas dinámicas).
  - Botón *Excel* en cada fila (o en el detalle) → descarga esa respuesta **con el mismo layout del Anexo B** (título, encabezados, 54 rutas y condiciones comerciales).
- **Dashboard:** KPIs (respuestas, oferentes únicos, cobertura promedio, tarifa promedio 40" STD), gráficas de respuestas por país, tarifa promedio por región y tipo de contenedor, navieras más ofertadas, cobertura por oferente, y una tabla de **mejor oferta por ruta** con selector de contenedor (20" STD / 40" STD / 40" HC). Todo filtrable por país.

## Mantenimiento rápido

- **Agregar otro administrador:** SQL Editor →
  `insert into public.rfp_admins (email) values ('nuevo@tuempresa.com');`
  y luego créale el usuario en Authentication → Users.
- **Cambiar rutas u orígenes:** edita la constante `ORIGENES` (está igual en `index.html` y `admin.html`).
- Las sesiones del panel viven solo en memoria: al recargar la página se vuelve a pedir login (decisión de seguridad).

## Notas

- Las hojas SV, GT y VNZ del Excel original traían duplicada la fila «Gastos en destino»; aquí se usa la estructura limpia de la hoja CR (un encabezado de sección + los 5 conceptos) para los cuatro países.
- El campo *Correo de contacto* del formulario es un agregado opcional (no existe en el Excel) para que puedas responderle al oferente; si no lo quieres, elimina el bloque `fieldEmail` en `index.html`.
