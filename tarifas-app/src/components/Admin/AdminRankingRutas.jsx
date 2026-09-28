import { useState, useContext, useMemo } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { calcularRanking } from '../../utils/ranking'
import { calcularRankingR2 } from '../../utils/rankingR2'
import { calcularRankingRutas } from '../../utils/rankingRutas'
import { MESES } from '../../utils/volumen'
import { getVolumenConfig } from '../../utils/rankingConfig'
import { fmtMoney } from '../../utils/format'
import { PAISES } from '../../constants'
import FiltroRegiones, { REGIONES_ORIGEN, REG_LABELS } from './FiltroRegiones'
import ExcluirOferentes, { aplicarExclusion } from './ExcluirOferentes'

/**
 * Ranking por Ruta con Capacidad (Etapa 1 y 2).
 *
 * Por cada ruta: puesto de cada oferente, su costo, y qué % de la demanda
 * mensual de esa ruta cubre con los TEUs que declaró disponibles.
 */
export default function AdminRankingRutas() {
  const {
    respuestas, tarifas, respuestasR2, tarifasR2, condOpR2,
    volumenes, oferentesExcluidos, etapa,
    filtros, setFiltro, toggleRegionFiltro, setRegionesFiltro
  } = useContext(AdminContext)

  const { campo, periodo, pais: paisFiltro, regiones } = filtros
  const [ordenarPor, setOrdenarPor] = useState('puntaje')
  const [soloProblemas, setSoloProblemas] = useState(false)

  const divNum = Number(getVolumenConfig().divisor) > 0 ? Number(getVolumenConfig().divisor) : 2

  const respR2Enriq = useMemo(() => (respuestasR2 || []).map((r) => {
    const condOp = (condOpR2 || []).find((c) =>
      (c.oferente || '').trim().toLowerCase() === (r.oferente || '').trim().toLowerCase())
    if (!condOp) return r
    return {
      ...r,
      credito_dias: r.credito_dias ?? condOp.credito_dias,
      facturacion_aplica: r.facturacion_aplica ?? condOp.facturacion_aplica,
      herramienta_seguimiento: r.herramienta_seguimiento ?? condOp.herramienta_seguimiento,
      gastos_fob: r.gastos_fob ?? condOp.gastos_fob
    }
  }), [respuestasR2, condOpR2])

  const porRuta = useMemo(() => {
    if (etapa === '2') {
      const { respuestas: rf, tarifas: tf } = aplicarExclusion(respR2Enriq, tarifasR2 || [], oferentesExcluidos)
      return calcularRankingR2(tf, rf, { pais: '', campo, regionFiltro: '', formRegion: '', volumenes, divisor: divNum }).porRuta
    }
    const { respuestas: rf, tarifas: tf } = aplicarExclusion(respuestas, tarifas, oferentesExcluidos)
    return calcularRanking(tf, rf, { pais: '', campo, regionFiltro: '', formRegion: '', volumenes, divisor: divNum }).porRuta
  }, [etapa, respuestas, tarifas, respR2Enriq, tarifasR2, oferentesExcluidos, campo, volumenes, divNum])

  const regionesArr = useMemo(() => [...regiones], [regiones])
  const { rutas, resumen } = useMemo(
    () => calcularRankingRutas(porRuta, volumenes, respuestasR2, {
      periodo, paisFiltro, regiones: regionesArr, divisor: divNum, ordenarPor
    }),
    [porRuta, volumenes, respuestasR2, periodo, paisFiltro, regionesArr, divNum, ordenarPor]
  )

  const rutasVisibles = useMemo(() => {
    const conVol = rutas.filter((r) => !r.sinVolumen)
    if (!soloProblemas) return conVol
    return conVol.filter((r) => r.cuantosCubren === 0 || r.oferentes.length === 1)
  }, [rutas, soloProblemas])

  const hayVolumen = (volumenes || []).length > 0
  const hayAllocation = (respuestasR2 || []).length > 0
  const periodoLabel = periodo === 'anual' ? 'Anual' : (MESES.find((m) => m.key === periodo)?.label || periodo)

  return (
    <section>
      <div className="section-title">Ranking por Ruta con Capacidad — Etapa {etapa}</div>

      <div className="card" style={{ padding: '12px 16px', marginBottom: 14, fontSize: 12.5, lineHeight: 1.6 }}>
        Puesto de cada oferente <b>en cada ruta</b> y qué porcentaje de la demanda de esa ruta
        cubre con los TEUs que declaró disponibles. Las rutas se listan de la <b>más costosa a
        la más barata</b> (costo con su oferente más barato), para atacar primero donde hay más
        dinero en juego:
        <div style={{ margin: '6px 0', padding: '8px 12px', background: 'var(--mint, #eef7f4)', borderRadius: 6, fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.7 }}>
          demanda de la ruta = volumen anual del puerto ÷ 12 &nbsp;[TEUs/mes]<br />
          <b>% de la demanda   = TEUs disponibles/mes ÷ demanda de la ruta</b>
        </div>
        Ejemplo: si un oferente declara <b>100 TEUs/mes</b> y la ruta mueve <b>110 TEUs/mes</b>,
        cubre el <b>90.9%</b>. El allocation se declara por región, así que los porcentajes de dos
        puertos de la misma región <b>no se suman entre sí</b>: comparten esa misma capacidad.
      </div>

      {!hayVolumen && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14, background: '#fff6e5', color: '#8a6d00', fontSize: 12.5 }}>
          ⚠ Aún no hay volumen cargado. Ve a <b>Configuración → Volumen</b> para capturarlo o importarlo.
        </div>
      )}

      {etapa === '1' && hayAllocation && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14, background: '#eef4ff', color: '#25467a', fontSize: 12.5 }}>
          ℹ El allocation solo se pide en <b>Etapa 2</b>. Las tarifas y puestos son de Etapa 1,
          pero la capacidad viene del allocation declarado en Etapa 2 por el mismo oferente.
        </div>
      )}

      {!hayAllocation && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14, background: '#fff6e5', color: '#8a6d00', fontSize: 12.5 }}>
          ⚠ No hay respuestas de Etapa 2 cargadas, así que no hay allocation declarado.
          Las columnas de capacidad saldrán en 0.
        </div>
      )}

      <ExcluirOferentes respuestas={etapa === '2' ? respuestasR2 : respuestas} />

      <div className="filters" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="f"><label>Tarifa base</label>
          <select value={campo} onChange={(e) => setFiltro('campo', e.target.value)}>
            <option value="tarifa_20_std">20" STD</option>
            <option value="tarifa_40_std">40" STD</option>
            <option value="tarifa_40_hc">40" HC</option>
          </select>
        </div>
        <div className="f"><label>Periodo</label>
          <select value={periodo} onChange={(e) => setFiltro('periodo', e.target.value)}>
            <option value="anual">Anual (prom. mensual)</option>
            {MESES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <div className="f"><label>País destino</label>
          <select value={paisFiltro} onChange={(e) => setFiltro('pais', e.target.value)}>
            <option value="">Todos</option>
            {PAISES.map((p) => <option key={p.code} value={p.code}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="f"><label>Ordenar puestos por</label>
          <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)}>
            <option value="puntaje">Puntaje (igual que Ranking)</option>
            <option value="costo">Costo (dinero puro)</option>
          </select>
        </div>
        <div className="f"><label>&nbsp;</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.target.checked)} />
            Solo rutas con riesgo
          </label>
        </div>
      </div>

      <FiltroRegiones
        seleccionadas={regiones}
        onToggle={toggleRegionFiltro}
        onTodas={() => setRegionesFiltro(REGIONES_ORIGEN)}
        onSoloPB={() => setRegionesFiltro(['Asia Puertos Base'])}
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0 16px' }}>
        <Kpi label="Rutas con volumen" valor={resumen.rutasConVolumen} />
        <Kpi label="Alguien la cubre solo" valor={resumen.rutasConQuienCubra} tono="ok"
          tip="Rutas donde al menos un oferente cubre el 100% de la demanda por sí solo." />
        <Kpi label="Nadie alcanza solo" valor={resumen.rutasSinQuienCubra} tono={resumen.rutasSinQuienCubra > 0 ? 'bad' : 'ok'}
          tip="Hay capacidad declarada, pero ningún oferente cubre la ruta completa: hay que repartirla entre dos o más." />
        <Kpi label="El #1 no alcanza solo" valor={resumen.rutasDondePrimeroNoAlcanza} tono={resumen.rutasDondePrimeroNoAlcanza > 0 ? 'warn' : 'ok'}
          tip="El mejor del ranking no cubre la ruta completa, aunque otro oferente sí podría." />
        <Kpi label="Sin allocation declarado" valor={resumen.rutasSinAllocation} tono={resumen.rutasSinAllocation > 0 ? 'warn' : 'ok'}
          tip="Rutas donde ningún oferente declaró capacidad para esa región." />
        <Kpi label="Con un solo oferente" valor={resumen.rutasSoloUnOferente} tono={resumen.rutasSoloUnOferente > 0 ? 'warn' : 'ok'}
          tip="Rutas sin alternativa: no hay segundo proveedor." />
        {resumen.rutasRegionDesconocida > 0 && (
          <Kpi label="Región no mapeada" valor={resumen.rutasRegionDesconocida} tono="warn"
            tip="Rutas cuyo puerto no cae en ninguna de las 4 regiones de allocation. No se puede medir su capacidad." />
        )}
      </div>

      {!rutasVisibles.length && (
        <div className="empty">
          {hayVolumen ? 'No hay rutas con volumen para los filtros seleccionados.' : 'Carga el volumen por puerto para ver este módulo.'}
        </div>
      )}

      {rutasVisibles.map((r) => (
        <div key={r.clave} className="card" style={{ marginBottom: 14 }}>
          <div style={{ padding: '10px 14px', background: 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>🚢 {r.origen} → {r.pais_nombre}</span>
            <span style={{ opacity: 0.75, background: 'rgba(255,255,255,.15)', padding: '2px 8px', borderRadius: 4, fontSize: 11.5 }}>
              {REG_LABELS[r.region] || r.region || 'sin región'}
            </span>
            <span style={{ opacity: 0.85, fontWeight: 600, fontSize: 11.5 }}
              title={`DEMANDA DE ESTA RUTA\n${fmtMoney(r.demandaTeusMes)} TEUs/mes = ${fmtMoney(r.demandaContMes)} contenedores 40" HC/mes\nVolumen anual: ${fmtMoney(r.volumenAnual)} TEUs\n\nEs el denominador del % de la demanda.`}>
              Demanda: {fmtMoney(r.demandaTeusMes)} TEUs/mes ({fmtMoney(r.demandaContMes)} × 40"HC)
            </span>
            <span style={{ fontWeight: 800, fontSize: 12, background: 'rgba(255,255,255,.18)', padding: '2px 10px', borderRadius: 4 }}
              title={`COSTO DE LA RUTA (${periodoLabel})\nLo que pagaríamos en esta ruta con su oferente más barato: $${fmtMoney(r.mejorCosto)}.\nEs el criterio de orden: las rutas se listan de la más costosa a la más barata, para atacar primero donde hay más dinero en juego.`}>
              ${fmtMoney(r.mejorCosto)}
            </span>
            <span style={{ flex: 1 }} />
            <span style={{
              fontSize: 11.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
              background: r.regionDesconocida ? '#8a6d00'
                : (r.cuantosCubren > 0 ? 'rgba(255,255,255,.2)' : '#c0392b')
            }} title={r.regionDesconocida
              ? `La región de este puerto («${r.region ?? 'sin región'}») no corresponde a ninguna de las 4 regiones de allocation, así que no hay capacidad contra la que medirlo. Revisa el catálogo de orígenes.`
              : (r.cuantosCubren > 0
                ? `${r.cuantosCubren} oferente(s) cubren esta ruta completa por sí solos.`
                : `Ningún oferente cubre esta ruta completa. El mejor llega al ${r.mejorCobertura.toFixed(1)}%.`)}>
              {r.regionDesconocida ? '⚠ Región no mapeada'
                : (r.cuantosCubren > 0 ? `${r.cuantosCubren} la cubren solos` : `Máx. ${r.mejorCobertura.toFixed(1)}%`)}
            </span>
          </div>

          <div className="table-scroll">
            <table className="grid">
              <thead><tr>
                <th>#</th><th>Oferente</th>
                <th className="th-num">Tarifa</th>
                <th className="th-num">Costo ({periodoLabel})</th>
                <th className="th-num">Gap vs #1</th>
                <th className="th-num">TEUs disp./mes</th>
                <th className="th-num">% de la demanda</th>
              </tr></thead>
              <tbody>
                {r.oferentes.map((o) => (
                  <tr key={o.oferente}>
                    <td style={{ fontWeight: 800, color: o.puesto <= 3 ? 'var(--teal-deep)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {o.puesto === 1 ? '🥇' : o.puesto === 2 ? '🥈' : o.puesto === 3 ? '🥉' : ''} {o.puesto}
                    </td>
                    <td style={{ fontWeight: 600 }}>{o.oferente}</td>
                    <td className="td-num num">${fmtMoney(o.tarifa)}</td>
                    <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }}
                      title={`(tarifa + impresión BL) × volumen ÷ ${divNum}\n= ($${fmtMoney(o.tarifa)} + $${fmtMoney(o.impresionBL)}) × ${fmtMoney(r.volumenPeriodo)} ÷ ${divNum}\n= $${fmtMoney(o.costo)}`}>
                      ${fmtMoney(o.costo)}
                    </td>
                    <td className="td-num num" style={{ color: o.gapVs1 > 0 ? '#c0392b' : 'var(--muted)' }}
                      title={o.gapVs1 > 0
                        ? `Cuesta $${fmtMoney(o.gapVs1)} más que el más barato de esta ruta.`
                        : 'Es el más barato de esta ruta.'}>
                      {o.gapVs1 > 0 ? '+$' + fmtMoney(o.gapVs1) : '—'}
                    </td>
                    <td className="td-num num" style={{ fontWeight: 700 }}
                      title={`TEUs/mes que declaró disponibles para la región ${REG_LABELS[r.region] || r.region}.\n${fmtMoney(o.allocTeusMes)} TEUs/mes = ${fmtMoney(o.allocContMes)} contenedores 40" HC/mes\n${o.allocPresente ? 'Tomado del formulario de Etapa 2.' : 'Este oferente no declaró allocation.'}`}>
                      {o.allocTeusMes > 0 ? fmtMoney(o.allocTeusMes) : '—'}
                    </td>
                    <td className="td-num num" style={{ fontWeight: 800, color: colorPct(o.pctCobertura) }}
                      title={`${fmtMoney(o.allocTeusMes)} TEUs/mes disponibles ÷ ${fmtMoney(r.demandaTeusMes)} TEUs/mes de demanda = ${o.pctCobertura.toFixed(1)}%\n\n${o.cubreSolo
                        ? '✓ Cubre esta ruta completa por sí solo.'
                        : `Solo cubre ${o.pctCobertura.toFixed(1)}% de la ruta: faltarían ${fmtMoney(r.demandaTeusMes - o.cubreTeus)} TEUs/mes.`}`}>
                      {o.allocTeusMes > 0 ? o.pctCobertura.toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  )
}

function colorPct(p) {
  if (p >= 100) return 'var(--teal-deep)'
  if (p >= 50) return '#b8860b'
  return '#c0392b'
}

function Kpi({ label, valor, tono, tip }) {
  const bg = tono === 'bad' ? '#fdecea' : tono === 'warn' ? '#fff6e5' : tono === 'ok' ? '#eaf6f2' : '#f5f6f7'
  const fg = tono === 'bad' ? '#c0392b' : tono === 'warn' ? '#8a6d00' : tono === 'ok' ? 'var(--teal-deep)' : '#444'
  return (
    <div className="card" style={{ padding: '8px 14px', background: bg, minWidth: 150 }} title={tip || ''}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: fg }}>{valor}</div>
    </div>
  )
}
