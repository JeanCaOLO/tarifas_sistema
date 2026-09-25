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

### 2.1 Tarifa global (por costo total ponderado)
**No es promedio de porcentajes.** Se acumula el costo real:
```
costo_total       = Σ costo_oferente de todas sus rutas
mejor_costo_total = Σ (menor costo de cada una de sus rutas)
avg_tarifa = (mejor_costo_total ÷ costo_total) × peso_tarifa
```
Así, el oferente que da el **menor costo total real** (mayor ahorro en dinero) obtiene
el puntaje de tarifa más alto. Esto evita que rutas pequeñas diluyan a un oferente que
es el mejor en las rutas de alto volumen.

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

Evalúa a los oferentes por **país destino** y por **región de origen** (América, Europa,
Asia PB, Asia). El score de cada región se calcula por **COSTO PONDERADO POR VOLUMEN**
(ahorro real en dinero), igual que el comparativo y el ranking normal.

### 3.1 Score por región (ponderado por volumen)
Para cada oferente y región dentro de un país destino:
```
costo_oferente = Σ (tarifa_ruta × volumen_del_puerto / divisor) en esa región
mejor_costo    = menor costo entre los oferentes de esa región
score_región   = (mejor_costo ÷ costo_oferente) × 100
```
El oferente con el **menor costo real** (mayor ahorro) obtiene 100; el resto
proporcionalmente menos. Así una ruta de alto volumen (ej. Ningbo) pesa mucho más que
una de bajo volumen, buscando el ahorro real en dinero.

> Fallback: si NO hay volumen cargado (o el puerto no tiene volumen), se usa el
> **promedio simple de tarifa** en la región: `score = (mejor promedio ÷ promedio) × 100`.
> La celda del detalle indica si el score se calculó por costo o por tarifa promedio.

### 3.2 Nota País
```
Nota País = Σ score_región × (peso_región_del_país / 100)
```
Los **pesos de región son específicos por país**, según la distribución real de volumen
(ver sección 5). Se re-normalizan a 100% si se filtran regiones.

### 3.3 Nota Final
```
Nota Final = Σ Nota_País × (peso_país / 100)
```
Pesos por país (CA): CR 52%, SV 27%, GT 21%. (VE: VNZ 100%).

---

## 4. COMPARATIVO VOLUMEN × PRECIO

Ordena a los oferentes por el **costo real** que representan, según nuestro volumen.

### 4.1 Costo por ruta
```
costo = (volumen_del_puerto / divisor) × tarifa
```
(Nota: aquí el costo NO incluye impresión de BL; es solo tarifa × volumen ÷ divisor.)

### 4.2 Agregados
- **Global por oferente:** suma de costos de todas sus rutas. Menor costo = mejor.
- **Por región / por país:** mismo cálculo agrupado, con el mejor oferente por costo.
- Se compara contra el mejor oferente por puntaje del ranking, para ver si coinciden.

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

Desde la última actualización, las tres vistas miden el **ahorro real ponderado por
volumen**, por lo que ahora son consistentes:

| Vista | Qué mide | Pondera por volumen |
|-------|----------|---------------------|
| **Comparativo Volumen** | Costo real total (dinero) | Sí |
| **Ranking Etapa 1/2** | Costo total ponderado + otros rubros | Sí (en tarifa) |
| **Ranking Regional** | Costo por región ponderado por volumen | **Sí** |

**Ejemplo (Servica en Asia PB / Costa Rica, 40" HC):**
Antes, el regional usaba promedio simple de tarifa (cada ruta contaba igual), así que
un oferente parejo en rutas pequeñas podía superar a Servica aunque Servica fuera el
mejor en dinero real. Ahora el regional pondera por volumen: como Servica gana en rutas
de alto volumen (ej. Ningbo, 722 TEUs), su costo total en esas regiones es el menor y
obtiene el mejor score. Resultado: Servica sale primero en el regional igual que en el
comparativo y el ranking, porque las tres miden el ahorro real.

**Diferencia que puede quedar:** el regional sigue agrupando por **región de origen** y
ponderando por los **pesos de región por país** (sección 5) antes de sumar la Nota Final
por país. El comparativo/ranking no aplican esos pesos regionales. Por eso el ORDEN puede
variar levemente si los pesos por región cambian mucho el balance, pero la métrica base
(costo ponderado por volumen) ya es la misma en las tres.

> Fallback: si no hay volumen cargado, el regional vuelve al promedio simple de tarifa.

---

## 7. Configuración editable

Todo lo anterior es configurable en Configuración (persistido en Supabase):
- Pesos de cada rubro por etapa (deben sumar 100).
- Reglas de tramos (días, crédito, gastos).
- Pesos regionales y por país.
- Divisor del volumen.
