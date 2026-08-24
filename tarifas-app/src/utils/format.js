export const fmtFecha = (iso) => new Date(iso).toLocaleString('es', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
})

export const fmtDia = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es') : '___'

export const fmtMoney = (n) => (n === null || n === undefined) ? '—'
  : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const folioDe = (id) => String(id).slice(0, 8).toUpperCase()

export const numOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
