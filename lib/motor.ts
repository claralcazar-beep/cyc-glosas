// Motor determinista: lo que se calcula, no se argumenta.
// Plazos (días hábiles CO), tarifa SOAT en UVB, soportes requeridos y consistencia de la glosa.
// Corre igual en el navegador y en el servidor (sin dependencias externas).

import { diasHabilesEntre, fechaBogota, hoyBogota, sumarDiasHabiles } from './fechas';
import type {
  Acta, Contrato, Erp, Factura, Glosa, Hallazgo, HallazgosMotor, Regimen, TarifaSoat, TipoSoporte,
} from './tipos';

export const MARCO_NORMATIVO: Record<Regimen, string> = {
  SGSSS_2284:
    'Ley 1438/2011 art. 57 (plazos) · Decreto 441/2022 · Res. 2284/2023 (soportes de la factura y Manual Único de Devoluciones, Glosas y Respuestas, anexo técnico 3) · Res. 948/2026 (RIPS como soporte de la FEV) · Res. 3047/2008 para servicios prestados antes de la entrada en operación de la 2284.',
  SOAT_780:
    'Decreto 780/2016 (Título 6: reclamaciones SOAT/ADRES) · Res. 326/2023 y modificatorias · Circular Externa 047/2025 (tarifas del manual en UVB para 2026) · Convenio con la aseguradora. La Res. 2284/2023 NO aplica a aseguradoras SOAT; su codificación se usa solo por convención.',
  ADRES:
    'Decreto 780/2016 (Título 6) · Resoluciones ADRES de reclamaciones · Circular Externa ADRES 003/2026 (SIA) · Manual operativo y de auditoría de reclamaciones ADRES.',
  CONVENIO:
    'Contrato o póliza con la entidad · Código de Comercio (seguros) · lo pactado en anexos tarifarios. Las reglas de la Res. 2284/2023 no son exigibles salvo remisión contractual.',
};

export const SOPORTES_POR_CONCEPTO: Record<string, TipoSoporte[]> = {
  PERTINENCIA: ['HISTORIA_CLINICA', 'ORDEN_MEDICA', 'RESULTADO'],
  TARIFAS: ['FACTURA', 'ANEXO_TARIFARIO'],
  SOPORTES: ['FACTURA', 'HISTORIA_CLINICA', 'RIPS'],
  AUTORIZACION: ['AUTORIZACION', 'HISTORIA_CLINICA'],
  COBERTURA: ['FURIPS', 'HISTORIA_CLINICA'],
  FACTURACION: ['FACTURA', 'RIPS'],
  DEVOLUCION: ['FACTURA', 'RIPS', 'FURIPS'],
  OTRO: ['FACTURA', 'HISTORIA_CLINICA'],
};

// Equivalencias: la HC puede venir como epicrisis o nota de urgencias
const EQUIVALENTES: Record<string, TipoSoporte[]> = {
  HISTORIA_CLINICA: ['HISTORIA_CLINICA', 'EPICRISIS', 'NOTA_URGENCIAS'],
  ANEXO_TARIFARIO: ['ANEXO_TARIFARIO', 'CONTRATO'],
};

export function aproximar(valor: number, regla: string): number {
  switch (regla) {
    case 'CENTENA_CERCANA': return Math.round(valor / 100) * 100;
    case 'CENTENA_SUPERIOR': return Math.ceil(valor / 100) * 100;
    case 'PESO': return Math.round(valor);
    default: return valor;
  }
}

export function liquidarUvb(uvb: number, valorUvb: number, regla: string, porcentaje: number | null | undefined) {
  const base = aproximar(uvb * valorUvb, regla);
  const pct = porcentaje && porcentaje > 0 ? porcentaje / 100 : 1;
  return Math.round(base * pct);
}

export interface EntradaMotor {
  glosa: Glosa;
  factura: Factura;
  acta: Acta;
  erp: Erp | null;
  contrato: Contrato | null;
  parametros: Record<string, { valor: string; verificado: boolean; fuente: string | null }>;
  tarifaSoat: TarifaSoat | null;
  soportesPresentes: TipoSoporte[];
  glosasHermanas: Glosa[]; // otras glosas de la misma factura
  hoy?: string;
}

export function ejecutarMotor(e: EntradaMotor): HallazgosMotor {
  const hoy = e.hoy ?? hoyBogota();
  const regimen: Regimen = e.erp?.regimen ?? 'CONVENIO';
  const hallazgos: Hallazgo[] = [];
  const p = (clave: string) => e.parametros[clave];

  // ---------- 1. PLAZO ----------
  const claveplazo = `PLAZO_RESPUESTA_${regimen}`;
  const paramPlazo = p(claveplazo);
  const diasPlazo = e.erp?.plazo_respuesta_dias_habiles ?? (paramPlazo ? parseInt(paramPlazo.valor, 10) : 15);
  const fuentePlazo = e.erp?.plazo_respuesta_dias_habiles
    ? `Plazo configurado en la ERP (${e.erp?.nombre})`
    : paramPlazo?.fuente ?? 'Parámetro interno';
  const verificadoPlazo = e.erp?.plazo_respuesta_dias_habiles ? true : (paramPlazo?.verificado ?? false);
  let vence: string | null = null;
  let diasRestantes: number | null = null;
  if (e.acta.fecha_notificacion) {
    const fNot = fechaBogota(e.acta.fecha_notificacion);
    vence = sumarDiasHabiles(fNot, diasPlazo);
    diasRestantes = diasHabilesEntre(hoy, vence);
    const alerta = parseInt(p('ALERTA_DIAS_ANTES_VENCER')?.valor ?? '5', 10);
    if (diasRestantes < 0) {
      hallazgos.push({ tipo: 'PLAZO', severidad: 'ERROR', titulo: 'Plazo de respuesta vencido',
        detalle: `La respuesta debió radicarse a más tardar el ${vence} (${diasPlazo} días hábiles desde la notificación del ${fNot}). Una respuesta extemporánea puede ser rechazada; documente la fecha real de notificación.` });
    } else if (diasRestantes <= alerta) {
      hallazgos.push({ tipo: 'PLAZO', severidad: 'ALERTA', titulo: `Vence en ${diasRestantes} día(s) hábil(es)`,
        detalle: `Fecha límite ${vence}. Priorice esta glosa.` });
    }
    if (!verificadoPlazo) {
      hallazgos.push({ tipo: 'NORMATIVA', severidad: 'INFO', titulo: 'Plazo no verificado contra la norma',
        detalle: `Se usó ${diasPlazo} días hábiles (${fuentePlazo}). Para ${regimen} confirme el plazo exigible en el convenio/norma y regístrelo en la ERP o en parámetros.` });
    }
  } else {
    hallazgos.push({ tipo: 'PLAZO', severidad: 'ALERTA', titulo: 'Sin fecha de notificación',
      detalle: 'No se puede calcular el vencimiento. Registre la fecha y hora en que la ERP notificó el acta (correo o plataforma).' });
  }

  // ---------- 2. TARIFA (SOAT en UVB) ----------
  let tarifa: HallazgosMotor['tarifa'] = null;
  const anio = (e.factura.fecha_atencion ?? e.factura.fecha_factura ?? hoy).slice(0, 4);
  const usaSoat = regimen === 'SOAT_780' || regimen === 'ADRES' || e.contrato?.tarifario_base === 'SOAT_UVB';
  if (e.tarifaSoat && usaSoat) {
    const paramUvb = p(`UVB_${anio}`) ?? p('UVB_2026');
    const valorUvb = paramUvb ? parseFloat(paramUvb.valor) : NaN;
    const regla = p('SOAT_REGLA_APROXIMACION')?.valor ?? 'NINGUNA';
    if (!isNaN(valorUvb)) {
      const esperado = liquidarUvb(e.tarifaSoat.uvb, valorUvb, regla, e.contrato?.porcentaje_sobre_base);
      const facturado = e.glosa.item_valor_facturado;
      const reconocido = facturado != null ? facturado - e.glosa.valor_glosado : null;
      const dif = facturado != null ? facturado - esperado : null;
      let comentario: string;
      if (facturado != null && facturado === esperado) {
        comentario = 'El valor facturado coincide con la liquidación del manual tarifario. Una glosa de TARIFA sobre este ítem no procede: sostener con el cálculo.';
        hallazgos.push({ tipo: 'TARIFA', severidad: 'INFO', titulo: 'Tarifa facturada correcta', detalle: comentario });
      } else if (reconocido != null && reconocido === esperado) {
        comentario = `La ERP reconoce exactamente el valor liquidado ($${esperado.toLocaleString('es-CO')}). La diferencia la originó la IPS: aceptar la glosa de tarifa y corregir el maestro tarifario.`;
        hallazgos.push({ tipo: 'TARIFA', severidad: 'ERROR', titulo: 'Error de liquidación de la IPS', detalle: comentario });
      } else {
        comentario = `Ni el valor facturado ($${facturado?.toLocaleString('es-CO') ?? '—'}) ni el reconocido por la ERP ($${reconocido?.toLocaleString('es-CO') ?? '—'}) coinciden con la liquidación ($${esperado.toLocaleString('es-CO')} = ${e.tarifaSoat.uvb} UVB × $${valorUvb.toLocaleString('es-CO')}, regla ${regla}${e.contrato?.porcentaje_sobre_base ? `, ${e.contrato.porcentaje_sobre_base} % del manual` : ''}). Revise la regla de aproximación y el anexo del contrato antes de responder.`;
        hallazgos.push({ tipo: 'TARIFA', severidad: 'ALERTA', titulo: 'Liquidación no concluyente', detalle: comentario });
      }
      if (!paramUvb?.verificado || !e.tarifaSoat.verificado) {
        hallazgos.push({ tipo: 'NORMATIVA', severidad: 'INFO', titulo: 'Tarifa o UVB sin verificar',
          detalle: 'El valor UVB o la fila del tarifario están marcados como no verificados contra la circular oficial. Verifíquelos antes de citar el cálculo en la respuesta.' });
      }
      tarifa = { aplica: true, codigo: e.tarifaSoat.codigo, descripcion: e.tarifaSoat.descripcion, uvb: e.tarifaSoat.uvb, valor_uvb: valorUvb,
        regla, valor_esperado: esperado, valor_facturado: facturado, valor_glosado: e.glosa.valor_glosado, diferencia: dif, comentario };
    }
  } else if (e.glosa.concepto_general === 'TARIFAS') {
    const motivo = !usaSoat
      ? 'El contrato no está parametrizado con tarifario SOAT en UVB; cargue el anexo tarifario del contrato para liquidar.'
      : `El código ${e.glosa.item_codigo ?? '(sin código)'} no está en el tarifario SOAT ${anio} cargado. Importe la tabla UVB oficial en /catalogos/importar.`;
    tarifa = { aplica: false, comentario: motivo };
    hallazgos.push({ tipo: 'TARIFA', severidad: 'ALERTA', titulo: 'No fue posible liquidar la tarifa', detalle: motivo });
  }

  // ---------- 3. SOPORTES ----------
  const concepto = e.glosa.concepto_general ?? 'OTRO';
  const requeridos = SOPORTES_POR_CONCEPTO[concepto] ?? SOPORTES_POR_CONCEPTO.OTRO;
  const presentes = new Set(e.soportesPresentes);
  const faltantes = requeridos.filter((r) => !(EQUIVALENTES[r] ?? [r]).some((eq) => presentes.has(eq)));
  if (faltantes.length) {
    const esPertinencia = concepto === 'PERTINENCIA';
    hallazgos.push({ tipo: 'SOPORTES', severidad: esPertinencia && faltantes.includes('HISTORIA_CLINICA') ? 'ERROR' : 'ALERTA',
      titulo: `Faltan soportes: ${faltantes.join(', ')}`,
      detalle: esPertinencia && faltantes.includes('HISTORIA_CLINICA')
        ? 'Sin historia clínica (o nota de urgencias/epicrisis) no existe respuesta de pertinencia defendible: la pertinencia se demuestra con lo registrado, no con argumentos generales. Cargue el soporte antes de analizar.'
        : 'Cargue los soportes faltantes para que la respuesta cite evidencia concreta.' });
  }

  // ---------- 4. CONSISTENCIA ----------
  if (e.glosa.item_valor_facturado != null && e.glosa.valor_glosado > e.glosa.item_valor_facturado) {
    hallazgos.push({ tipo: 'CONSISTENCIA', severidad: 'ERROR', titulo: 'Valor glosado mayor al facturado',
      detalle: `La ERP glosa $${e.glosa.valor_glosado.toLocaleString('es-CO')} sobre un ítem facturado por $${e.glosa.item_valor_facturado.toLocaleString('es-CO')}. Objete el exceso por error aritmético.` });
  }
  const mismoItem = e.glosasHermanas.filter((g) => g.id !== e.glosa.id && g.item_codigo && g.item_codigo === e.glosa.item_codigo);
  if (mismoItem.length) {
    const suma = mismoItem.reduce((s, g) => s + Number(g.valor_glosado), Number(e.glosa.valor_glosado));
    const excede = e.glosa.item_valor_facturado != null && suma > e.glosa.item_valor_facturado;
    hallazgos.push({ tipo: 'CONSISTENCIA', severidad: excede ? 'ERROR' : 'INFO',
      titulo: `Ítem con ${mismoItem.length + 1} glosas (${[e.glosa, ...mismoItem].map((g) => g.codigo_erp ?? g.concepto_general).join(' + ')})`,
      detalle: (excede ? `La suma glosada ($${suma.toLocaleString('es-CO')}) supera el valor del ítem. ` : '') +
        'Las glosas son dependientes: si se sostiene la de pertinencia, la de tarifa pierde objeto; si se levanta, solo queda en discusión la diferencia tarifaria. Respóndalas por separado pero con la misma lógica.' });
  }
  const totalGlosado = [e.glosa, ...e.glosasHermanas.filter((g) => g.id !== e.glosa.id)].reduce((s, g) => s + Number(g.valor_glosado), 0);
  if (e.factura.valor_factura != null && totalGlosado > Number(e.factura.valor_factura)) {
    hallazgos.push({ tipo: 'CONSISTENCIA', severidad: 'ERROR', titulo: 'Total glosado supera el valor de la factura',
      detalle: `Glosado $${totalGlosado.toLocaleString('es-CO')} vs factura $${Number(e.factura.valor_factura).toLocaleString('es-CO')}.` });
  }

  // ---------- 5. NORMATIVA ----------
  if (regimen === 'SOAT_780' && e.glosa.codigo_erp && /^\d(\.\d{2})?$/.test(e.glosa.codigo_erp)) {
    hallazgos.push({ tipo: 'NORMATIVA', severidad: 'INFO', titulo: 'Codificación 3047 en régimen SOAT',
      detalle: 'La aseguradora usa los códigos de la Res. 3047/2008 por convención. Es útil responder en el mismo lenguaje, pero el marco exigible es el Decreto 780/2016 y el convenio; no invoque la Res. 2284/2023 como obligación de la aseguradora.' });
  }
  if (regimen === 'SGSSS_2284' && e.factura.fecha_atencion && e.factura.fecha_atencion < '2024-10-01') {
    hallazgos.push({ tipo: 'NORMATIVA', severidad: 'INFO', titulo: 'Verificar manual aplicable por fecha de prestación',
      detalle: 'Servicios prestados antes de la entrada en operación de la Res. 2284/2023 se rigen por la Res. 3047/2008. Confirme la fecha de corte vigente (Res. 627 y 1885 de 2024 aplazaron la transición).' });
  }

  return {
    calculado_en: new Date().toISOString(),
    regimen,
    marco_normativo: MARCO_NORMATIVO[regimen],
    plazo: { dias_habiles: diasPlazo, vence, dias_restantes: diasRestantes, fuente: fuentePlazo, verificado: verificadoPlazo },
    tarifa,
    soportes_requeridos: requeridos,
    soportes_presentes: e.soportesPresentes,
    soportes_faltantes: faltantes,
    hallazgos,
  };
}
