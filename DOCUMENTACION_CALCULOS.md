# Documentación de cálculos — Sistema de Tarifas (RFP 2026-2027)

Este documento explica, paso a paso, cómo se calculan **todas** las notas y puntajes
del sistema: Ranking (Etapa 1 y 2), Ranking Regional y Comparativo Volumen × Precio.
Incluye las fórmulas exactas tal como están implementadas en el código.

Archivos de referencia:
- `src/utils/ranking.js` — Ranking y Ranking Regional de Etapa 1.
- `src/utils/rankingR2.js` — Ranking y Ranking Regional de Etapa 2.
- `src/utils/comparativoVolumen.js` — Comparativo Volumen × Precio.
- `src/utils/rankingConfig.js` — Pesos y reglas configurables.
- `src/utils/volumen.js` — Volumen propio por puerto/país.

---

## 0. Conceptos base

### Volumen propio por puerto
Es cuántos **TEUs** movemos nosotros por cada **puerto de origen**, según el **país
destino** (una tabla por país: CR, SV, GT, VNZ) y por mes (ene–dic) + total anual.
Se carga en Configuración → Volumen (tabla `rfp_volumen_puerto`).

### Divisor (TEU → contenedor)
`divisor` (por defecto **2**) convierte TEUs a contenedores de 40' (1 contenedor 40' = 2 TEUs).
Configurable en Configuración → Volumen.

### Costo ponderado por volumen (usado para el puntaje de tarifa)
Para un oferente en una ruta:
```
costo = (tarifa + impresión_BL) × volumen_del_puerto / divisor
```
- `tarifa` = tarifa base seleccionada (20" STD / 40" STD / 40" HC).
- `impresión_BL` = gasto de impresión de BL del oferente.
- `volumen_del_puerto` = TEUs que movemos por ese puerto (según país destino, total anual).
- Si el puerto **no tiene volumen cargado**, el costo es 0 y el puntaje de tarifa de esa ruta es 0.

### Pesos por rubro (configurables)
Etapa 1 (por defecto): Tarifa 85, Días 5, Crédito 5, Herramienta 5. (Gastos y FOB = 0)
Etapa 2 (por defecto): Tarifa 70, Días 5, Crédito 5, Allocation 15, Representación 5. (Gastos y FOB = 0)

---

## 1. RANKING por ruta (Etapa 1 y 2)

Se agrupan las cotizaciones por ruta (país destino + puerto de origen). Para cada
oferente en cada ruta se calculan las contribuciones de cada rubro.

### 1.1 Tarifa (ponderada por volumen)
```
costo_oferente = (tarifa + impresión_BL) × volumen / divisor
mejor_costo    = menor costo entre los oferentes de esa ruta
puntaje_tarifa = (mejor_costo ÷ costo_oferente) × 100 × (peso_tarifa / 100)
```
- El de **menor costo** de la ruta obtiene el máximo (el peso completo).
- Sin volumen en el puerto → puntaje_tarifa = 0.
- Si no hay ningún volumen cargado en el sistema, cae al modo tarifa cruda:
  `(mejor tarifa ÷ tarifa) × 100 × peso`.

### 1.2 Días libres en destino (tramos configurables)
```
≥ alto.min  → alto.pts     (por defecto ≥21 → 5)
≥ medio.min → medio.pts    (por defecto ≥15 → 1)
resto       → bajo         (por defecto 0)
```

### 1.3 Crédito
**Etapa 1** (tramos):
```
≥60 días → 5 · ≥45 días → 1 · resto → 0
```
**Etapa 2** (dos componentes, máx 5):
```
puntos_días  = ≥60 → 2.5 · ≥45 → 0.5 · si 0<días<45 → (días / 60) × 2.5
puntos_fact  = 2.5 si factura al arribo, 0 si no
crédito = puntos_días + puntos_fact
```

### 1.4 Gastos — Impresión de BL
Se usa **solo el costo de impresión de BL** (no la suma de todos los gastos).
Comparación **por ruta**:
```
menor impresión BL de la ruta → mejorPts (5)
mayor impresión BL de la ruta → peorPts (1)
intermedio → interpolación lineal entre 5 y 1
```
> Nota: por configuración actual el peso de Gastos es 0, así que **no suma a la nota**.
> La impresión de BL sí influye porque está dentro del costo de tarifa (1.1).

### 1.5 Herramienta de seguimiento (solo Etapa 1)
```
tiene herramienta → 5 · no tiene → 0
```

### 1.6 Allocation (solo Etapa 2)
Volumen mensual (TEUs) que el oferente declara mover, sumando las 4 regiones.
Comparación **global entre oferentes**:
```
puntaje = (allocation_oferente ÷ mayor_allocation) × peso_allocation
```

### 1.7 Gastos FOB (solo Etapa 2)
Promedio de los cargos FOB por puerto base de China declarados por el oferente.
```
puntaje = (menor_FOB ÷ FOB_oferente) × peso_fob
```
> Peso actual = 0 → no suma a la nota.

### 1.8 Representación / Oficinas (solo Etapa 2)
Número de "Sí" en los checkboxes de oficinas propias (puertos base + destino).
```
puntaje = (# Sí del oferente ÷ mayor # Sí entre oferentes) × peso_repre
```

### 1.9 Puntaje total de la ruta
Suma de todas las contribuciones que tienen peso > 0.

---

## 2. RANKING global por oferente (Etapa 1 y 2)

Agrega las rutas de cada oferente (clave: oferente + país destino).

### 2.1 Tarifa global (costo total con benchmark común por país)
**No es promedio de porcentajes.** Se acumula el costo real y se compara contra un
**único punto de referencia por país**:
```
costo_total  = Σ costo_oferente de todas sus rutas
benchmark    = MENOR costo_total entre TODOS los oferentes de ese país
avg_tarifa   = (benchmark ÷ costo_total) × peso_tarifa
```
El oferente más barato del país obtiene el peso completo (ej. 85.00) y los demás bajan
en proporción exacta a lo que cuestan de más. Por eso **el orden del puntaje de tarifa
respeta el orden del dinero** y coincide con el Comparativo Volumen.

**Por qué el benchmark es común (cambio importante):** antes cada oferente se comparaba
contra la suma de los mejores costos de **sus propias** rutas. Eso tenía dos defectos:
- Premiaba **no cotizar** las rutas donde el oferente era caro (su referencia bajaba con él).
- El puntaje **no era comparable** entre oferentes, porque cada uno usaba un denominador
  distinto. Podía dar un orden diferente al del dinero real (ej. un oferente 4º en costo
  apareciendo 2º en el ranking).

**Columnas de dinero en la tabla:** además del puntaje, el ranking global muestra
`Costo total` (dinero real) y `Gap vs #1` (cuánto cuesta de más que el oferente más
barato del país). El `Gap vs #1` es la cifra que responde "cuánto ahorro pierdo si elijo
a este en lugar del más barato".

**Alcance:** el benchmark se calcula sobre los oferentes visibles con los filtros activos
(país, tipo de contenedor, regiones de origen, oferentes excluidos). Cambiar un filtro
cambia el benchmark y por tanto los puntajes de tarifa.

### 2.1.1 Cobertura de volumen (⚠ leer siempre junto al Costo total)
```
volumen_total_pais = Σ volumen de TODAS las rutas evaluadas de ese país
cobertura          = volumen_cubierto_del_oferente ÷ volumen_total_pais
```
El `Costo total` es una suma absoluta, así que **un oferente que no cotiza todas las
rutas tiene un costo total menor sin ser más barato**. Ejemplo verificado: un oferente
que cotiza solo 2 de 4 puertos (33.4% del volumen) da un costo total de $577 k contra
$1.85 M de quien cotiza el 100%, y sale #1 con nota 85.00 aunque sus tarifas no sean las
mejores.

Por eso la tabla muestra la columna **Cobertura**:
- **100%** → el `Costo total` y el `Gap vs #1` son comparables directamente.
- **< 100% (marcado ⚠ en rojo)** → el `Costo total` NO es comparable. Hay que compararlo
  por **Costo/TEU** (en el tooltip) o solo dentro de las rutas que sí cotiza, y decidir
  cómo se cubre el volumen faltante.

> Pendiente de decisión: si se quiere un ranking global justo con cobertura parcial, hay
> que **imputar** el volumen no cotizado (por ejemplo, cargarlo al mejor costo disponible
> de esa ruta) antes de sumar. Hoy no se imputa: solo se advierte.

### 2.2 Los demás rubros
Se promedian las contribuciones por ruta:
```
avg_rubro = Σ contribución_rubro / número_de_rutas
```

### 2.3 Nota total global
```
avg_total = avg_tarifa + avg_dias + avg_credito + avg_gastos
          + [avg_allocation + avg_fob + avg_repre en E2] + avg_herramienta (E1)
```
El ranking se ordena por `avg_total` descendente.

---

## 3. RANKING REGIONAL (Etapa 1 y 2)

El ranking regional **ya no recalcula por su cuenta**. Toma el resultado del **Ranking
normal** por país (mismo criterio de nota total, costo ponderado por volumen) y le aplica
la lógica de **posición ponderada por país**. Así, el puesto de un oferente en un país es
SIEMPRE el mismo en el Ranking y en el Regional.

### 3.1 Puesto por país (viene del Ranking normal)
1. Se filtran las cotizaciones a la región seleccionada (CA/VE) y a las regiones de
   origen incluidas (checkboxes).
2. Se ejecuta el **Ranking normal** sobre esas cotizaciones → se obtiene el `global`
   (una fila por oferente|país con su `nota_total`).
3. Dentro de cada país, se ordena por `nota_total` (mayor = mejor) y se asigna el
   **puesto**: #1 = mejor nota, #2, #3, etc.

### 3.2 Puntos por posición
Cada puesto se convierte a puntos:
```
puntos = max(0, 100 - (puesto - 1) × 20)
→ 1º = 100 · 2º = 80 · 3º = 60 · 4º = 40 · 5º = 20 · 6º+ = 0
```

### 3.3 Nota Final
La Nota Final pondera esos puntos por el peso del país:
```
Nota Final = Σ puntos_puesto_país × (peso_país / 100)
```
Pesos por país (CA): CR 52%, SV 27%, GT 21%. (VE: VNZ 100%).

**Por qué así:**
- El **dinero real manda**: el puesto se define por la nota total del Ranking (costo
  ponderado por volumen), no por un recálculo aparte.
- **Consistencia total**: si un oferente es #1 en Guatemala en el Ranking, también es #1
  en Guatemala en el Regional. Ya no hay discrepancias entre ambas vistas.
- **La posición se ve reflejada**: ganar un país con más peso (ej. CR 52%) mueve
  fuertemente la Nota Final (100 pts vs 40 del 4º), no de forma marginal.

**Nota:** los pesos de región por país (sección 5) ya NO afectan el puesto (que viene del
Ranking). Se mantienen solo como información visual del volumen por región. El detalle por
país muestra el puesto, la nota del Ranking y los puntos por posición.

> Consideración: al ser por puesto, un #1 que gana por mucho dinero y un #1 que gana por
> poco valen igual (100). El monto del ahorro se ve en el Comparativo Volumen. El
> allocation puede usarse como desempate manual.

---

## 4. COMPARATIVO VOLUMEN × PRECIO

Ordena a los oferentes por el **costo real** que representan, según nuestro volumen.

### 4.1 Costo por ruta
```
costo = (tarifa + impresión_BL) × volumen_del_puerto / divisor
```
Es **exactamente la misma fórmula** que usa el Ranking (sección 0 y 1.1). Antes esta
vista omitía la impresión de BL, lo que producía diferencias de ~1% y podía invertir el
orden respecto al Ranking. Ya está unificada.

### 4.2 Agregados
- **Global por oferente:** suma de costos de todas sus rutas. Menor costo = mejor.
- **Por región / por país:** mismo cálculo agrupado, con el mejor oferente por costo.
- Se compara contra el mejor oferente por puntaje del ranking, para ver si coinciden.

---

## 4-bis. RANKING POR RUTA CON CAPACIDAD (Etapa 1 y 2)

Módulo aparte (pestaña **🚢 Ranking por Ruta**). Por cada ruta (país destino + puerto de
origen) muestra el puesto de cada oferente y, junto al dinero, la **capacidad** que
declaró. Sirve para decidir la adjudicación por lane y la cascada entre proveedores.

Archivos: `src/utils/rankingRutas.js` y `src/components/Admin/AdminRankingRutas.jsx`.

### 4-bis.1 Puesto por ruta
Reutiliza el `porRuta` de `calcularRanking` / `calcularRankingR2`, así que el criterio es
el mismo del módulo Ranking. Dos modos de orden, seleccionables:
- **Puntaje** (por defecto): igual que el Ranking.
- **Costo**: dinero puro, el más barato de la ruta primero.

Si un oferente tiene dos submissions que cubren la misma ruta, se conserva **la de menor
tarifa**, para que no aparezca dos veces ni se le cuente la capacidad dos veces.

**Orden de las rutas.** Se listan de la **más costosa a la más barata**, tomando como costo
de la ruta lo que pagaríamos en ella con su oferente más barato (`mejorCosto`), es decir el
dinero realmente en juego en ese lane. Así las rutas que más pesan en el presupuesto quedan
arriba. El costo de cada ruta se muestra en su encabezado.

### 4-bis.2 Costo y gap
```
costo   = (tarifa + impresión_BL) × volumen_del_periodo / divisor
gap #1  = costo del oferente − costo del más barato de esa ruta
```
Misma fórmula que el Ranking y el Comparativo. El periodo es seleccionable: **Anual** usa
el volumen anual para el costo y su **promedio mensual (anual ÷ 12)** para comparar la
capacidad; elegir un mes usa ese mes para las dos cosas.

### 4-bis.3 Capacidad: % de la demanda que cubre cada oferente
El allocation se captura en el formulario de Etapa 2 como **«Allocation Total Mensual por
Región (en TEUS)»**: cuatro campos (`allocation_america`, `allocation_europa`,
`allocation_asia_pb`, `allocation_asia_restante`) en `rfp_respuestas_r2`. Es **mensual y en
TEUs**.

La comparación es directa: los TEUs disponibles contra la demanda de la ruta.
```
demanda_mes(ruta) = volumen_anual_del_puerto / 12     [TEUs/mes]
                    (o el mes elegido, si no se usa "Anual")
% de la demanda   = TEUs_disponibles_mes / demanda_mes(ruta)
```

**Ejemplo (verificado).** Un oferente declara 100 TEUs/mes y la ruta mueve 110 TEUs/mes →
cubre el **90.9%** de esa ruta.

Las dos columnas de capacidad son:

| Columna | Qué es |
|---|---|
| **TEUs disp./mes** | lo que declaró disponible para la región de ese puerto |
| **% de la demanda** | `TEUs disponibles ÷ demanda mensual de la ruta` |

Si un oferente tiene varias submissions, se toma el **mayor** valor por región (mismo
criterio que el rubro Allocation del ranking de Etapa 2).

**Unidades.** El volumen propio y el allocation están **ambos en TEUs**, así que el
porcentaje no depende de la unidad. El equivalente en contenedores de 40" HC es
`TEUs ÷ divisor` (2 TEUs = 1 × 40" HC).

### 4-bis.4 Lo único que hay que tener presente al leerlo
El allocation se declara por **región**, así que la misma cifra se contrasta contra cada
ruta de esa región por separado. Eso es lo correcto para responder «¿este oferente puede con
esta ruta?», pero significa que **los porcentajes de dos puertos de la misma región no se
suman entre sí**: comparten la misma capacidad. Si se le adjudican dos puertos de Asia PB al
mismo proveedor, hay que verificar que su allocation alcance para la suma de ambos.

Los KPIs de arriba resumen el riesgo de capacidad:
- **Alguien la cubre solo**: al menos un oferente llega al 100% de la demanda por sí solo.
- **Nadie alcanza solo**: hay capacidad declarada, pero ninguno cubre la ruta completa. Hay
  que repartirla entre dos o más.
- **El #1 no alcanza solo**: el mejor del ranking no cubre la ruta completa, aunque otro sí
  podría. Es la señal para revisar la pareja primario/secundario de ese lane.
- **Sin allocation declarado**: ningún oferente puso capacidad para esa región (dato faltante).
- **Con un solo oferente**: no hay alternativa en esa ruta.
- **Región no mapeada**: el puerto no cae en ninguna de las 4 regiones de allocation, así
  que no se puede medir su capacidad. Estas rutas quedan **fuera** de los conteos, en vez de
  reportar 0 en silencio (que se leería como «no declaró»).

### 4-bis.5 Etapa 1 y el allocation
El allocation **solo se pide en Etapa 2**. Al ver el módulo en Etapa 1, las tarifas y los
puestos son de Etapa 1 pero la capacidad se toma del allocation declarado en Etapa 2 por el
mismo oferente. El módulo lo avisa en pantalla.

---

## 5. Pesos de región por país (según volumen real)

Los pesos de región del ranking regional reflejan cuánto volumen movemos por región
en cada país destino:

| País        | América | Europa | Asia PB | Asia |
|-------------|---------|--------|---------|------|
| Costa Rica  | 2%      | 6%     | 82%     | 10%  |
| El Salvador | 0%      | 2%     | 68%     | 30%  |
| Guatemala   | 1%      | 4%     | 84%     | 11%  |
| Venezuela   | 17%     | 2%     | 64%     | 17%  |

Filtro de regiones: al desmarcar una región, su peso se **reparte proporcionalmente**
entre las regiones restantes (re-normalización a 100%).

---

## 6. Consistencia entre las tres vistas

Las tres vistas usan **la misma fórmula de costo** y el **mismo benchmark**:

| Vista | Fórmula de costo | Benchmark | Qué ordena |
|-------|------------------|-----------|------------|
| **Comparativo Volumen** | `(tarifa + impresión_BL) × volumen ÷ divisor` | — (ordena por dinero) | Costo total, menor = mejor |
| **Ranking Etapa 1/2** | `(tarifa + impresión_BL) × volumen ÷ divisor` | Menor costo total del país (común) | Nota total (tarifa + otros rubros) |
| **Ranking Regional** | Igual (toma el puesto del Ranking) | Igual | Puntos de posición × peso de país |

### 6.1 Lo único que puede separar al Ranking del Comparativo
Con la fórmula unificada y el benchmark común, **el rubro de tarifa ya da el mismo orden
que el dinero**. La nota total del Ranking puede aun así diferir, porque suma rubros que
no son dinero:

- **Etapa 1:** Días libres (5) + Crédito (5) + Herramienta (5) = hasta 15 puntos.
- **Etapa 2:** Días + Crédito + Allocation + Representación, según los pesos activos.

Con Tarifa al 85%, los 15 puntos restantes equivalen a ~15.9% del costo. Sobre un costo
de ~$8.9 M eso son ~$1.4 M implícitos, mientras el valor real estimado de esos beneficios
(días libres + crédito) ronda los ~$165 k. Es decir, **esos rubros están sobrevalorados
cerca de 8×** y pueden invertir el orden final frente al dinero.

**Cómo decidir por ahorro real:**
1. Revisar primero la columna **Cobertura**. Descartar de la comparación directa a quien
   esté por debajo de 100% (o compararlo por Costo/TEU).
2. Ordenar por **Costo total** / **Gap vs #1** del Ranking global (o por el Comparativo
   Volumen, que da lo mismo).
3. Usar la nota total solo como desempate cuando el `Gap vs #1` sea menor que el valor
   monetizado de los beneficios (días libres, crédito, allocation).
4. Si se quiere que el Ranking ordene puro dinero, poner **Tarifa = 100** y el resto en 0
   en Configuración → Pesos. Así `Nota total = avg_tarifa` y el orden es idéntico al del
   Comparativo Volumen.

**Ejemplo (Servica en Asia PB / Costa Rica, 40" HC):**
Antes, el regional usaba promedio simple de tarifa (cada ruta contaba igual), así que
un oferente parejo en rutas pequeñas podía superar a Servica aunque Servica fuera el
mejor en dinero real. Ahora el regional pondera por volumen: como Servica gana en rutas
de alto volumen (ej. Ningbo, 722 TEUs), su costo total en esas regiones es el menor y
obtiene el mejor score. Resultado: Servica sale primero en el regional igual que en el
comparativo y el ranking, porque las tres miden el ahorro real.

**Puesto por país: ahora SIEMPRE coincide.** El ranking regional toma el puesto por país
directamente del Ranking normal (costo total ponderado por volumen). Por eso, si un
oferente es #1 en Guatemala en el Ranking, también es #1 en Guatemala en el Regional.
La única diferencia entre ambas vistas es el **orden final global**:
- El **Ranking** ordena por nota total del oferente (mezcla todos sus países).
- El **Regional** ordena por Nota Final = puntos de posición × peso de cada país. Un
  oferente que gana países de mayor peso (ej. CR 52%) sube más, aunque su costo total
  absoluto no sea el menor.

Esto es intencional: el Regional mide "qué tan bien se posiciona en los países que más
me importan", usando como base el mismo dinero real del Ranking.

> Fallback: si no hay volumen cargado, el Ranking (y por tanto el Regional) compara por
> **tarifa cruda** por ruta: `(mejor tarifa de la ruta ÷ tarifa) × peso`, y la nota global
> de tarifa es el promedio de esas contribuciones. En ese modo no hay benchmark común por
> país y el orden puede no reflejar el dinero total.

---

## 6-bis. Filtros compartidos entre módulos

Los filtros de análisis viven en `AdminPage.jsx` (no en cada módulo), así que **se
mantienen al moverse entre vistas**. Se comparten:

| Filtro | Módulos que lo usan | Default |
|---|---|---|
| Tarifa base | Ranking, Ranking Regional, Ranking por Ruta, Comparativo Volumen, Comparativa E1↔E2 | **40" HC** |
| País destino | Ranking, Ranking por Ruta, Comparativo Volumen, Comparativa E1↔E2 | Todos |
| Periodo | Ranking por Ruta, Comparativo Volumen | Anual |
| Región CA/VE | Ranking, Comparativa E1↔E2 | Todas |
| Regiones de origen | Ranking, Ranking Regional, Ranking por Ruta, Comparativo Volumen | Las 4 |

Dos aclaraciones:
- En **Ranking Regional** el selector CA/VE elige el bloque regional a analizar (es
  obligatorio, no admite «Todas»), así que **no** se comparte con los demás módulos.
- Filtros propios de un módulo siguen siendo locales: el orden de puestos y «solo rutas con
  riesgo» del Ranking por Ruta, o el modo global/detalle de la Comparativa.

Los filtros se reinician al recargar la página; no se persisten.

---

## 7. Configuración editable

Todo lo anterior es configurable en Configuración (persistido en Supabase):
- Pesos de cada rubro por etapa (deben sumar 100).
- Reglas de tramos (días, crédito, gastos).
- Pesos regionales y por país.
- Divisor del volumen.
