export const PAISES = [
  { code: 'CR', nombre: 'Costa Rica' },
  { code: 'SV', nombre: 'El Salvador' },
  { code: 'GT', nombre: 'Guatemala' },
  { code: 'VNZ', nombre: 'Venezuela' }
]

export const PAISES_MAP = { CR: 'Costa Rica', SV: 'El Salvador', GT: 'Guatemala', VNZ: 'Venezuela' }

export const TOTAL_RUTAS = 54

export const ORIGENES = [
  ['Altamira, México','America'],['Ancona, Italia','Europa'],['Barcelona, España','Europa'],
  ['Barranquilla, Colombia','America'],['Bilbao, España','Europa'],['Boston, Estados Unidos','America'],
  ['Bremerhaven, Alemania','Europa'],['Buenaventura, Colombia','America'],['Busan, Corea','Asia'],
  ['Cabello, Venezuela','America'],['Cartagena, Colombia','America'],['Chiwan, China','Asia'],
  ['Chongqing, China','Asia'],['Da Nang, Vietnam','Asia'],['Foshan, China','Asia'],
  ['Fuzhou, China','Asia'],['Gaoming, China','Asia'],['Genoa, Italia','Europa'],
  ['Guangzhou, China','Asia'],['Haifa, Israel','Europa'],['Hamburgo, Alemania','Europa'],
  ['Hong Kong, China','Asia'],['Houston, Estados Unidos','America'],['Jiangmen, China','Asia'],
  ['La Guaira, Venezuela','America'],['La Spezia, Italia','Europa'],['Livorno, Italia','Europa'],
  ['Manzanillo, México','America'],['Miami, Estados Unidos','America'],['Mundra, India','Asia'],
  ['Nansha, China','Asia'],['Navengantes, Brasil','America'],['New York, Estados Unidos','America'],
  ['Ningbo, China','Asia Puertos Base'],['Norfolk, Estados Unidos','America'],['Qingdao, China','Asia Puertos Base'],
  ['Rotterdam, Países Bajos','Europa'],['Río Grande, Brasil','America'],['San Vicente, Chile','America'],
  ['Sanshan, China','Asia'],['Sanshui, China','Asia'],['Santos, Brasil','America'],
  ['Shanghai, China','Asia Puertos Base'],['Shekou, China','Asia Puertos Base'],['Shenzhen, China','Asia Puertos Base'],
  ['Subic Bay, Filipinas','Asia'],['Tianjin, China','Asia'],['Valencia, España','Europa'],
  ['Xiamen, China','Asia Puertos Base'],['Xiaolan, China','Asia'],['Xingang, China','Asia'],
  ['Yantian, China','Asia Puertos Base'],['Zhangjiagang, China','Asia'],['Zhongshan, China','Asia']
]

export const PUERTOS = [
  'Acajutla, El Salvador',
  'Caldera, Costa Rica',
  'Moín, Costa Rica',
  'Quetzal, Guatemala',
  'Santo Tomás de Castilla, Guatemala',
  'Barrios, Guatemala',
  'La Guaira, Venezuela',
  'Cabello, Venezuela'
]

export const RATE_FIELDS = [
  'dias_libres_origen','dias_libres_destino','navieras',
  'tiempo_transito','puerto_arribo','tarifa_20_std','tarifa_40_std','tarifa_40_hc'
]

export const REGION_POR_ORIGEN = new Map(ORIGENES.map(([o, r]) => [o, r]))

export const RK2_CONFIG = {
  CA: {
    regionPesos: { America: 7, Europa: 3, 'Asia Puertos Base': 70, Asia: 20 },
    paisPesos: { CR: 52, SV: 27, GT: 21 }
  },
  VE: {
    regionPesos: { America: 13, Europa: 2, 'Asia Puertos Base': 65, Asia: 20 },
    paisPesos: { VNZ: 100 }
  }
}
