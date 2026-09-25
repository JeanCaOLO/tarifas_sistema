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

> Fallback: si no hay volumen cargado, el Ranking (y por tanto el Regional) usa la tarifa
> cruda en lugar del costo ponderado.

---

## 7. Configuración editable

Todo lo anterior es configurable en Configuración (persistido en Supabase):
- Pesos de cada rubro por etapa (deben sumar 100).
- Reglas de tramos (días, crédito, gastos).
- Pesos regionales y por país.
- Divisor del volumen.
