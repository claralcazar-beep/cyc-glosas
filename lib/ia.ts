// Integración con la API de Claude (solo servidor). Dos usos:
//  1) extraerActa: lee el acta (PDF/TXT/XLSX→CSV) y devuelve la estructura de facturas y glosas.
//  2) analizarGlosa: el "auditor mentor": dictamen, argumentos con cita, debilidades y respuesta formal.
// Salida siempre validada con structured outputs (JSON garantizado por esquema).

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ActaExtraida, AnalisisGlosa, ConceptoGeneral, HallazgosMotor } from './tipos';

export const MODELO_EXTRACCION_DEFECTO = 'claude-sonnet-5-5';
export const MODELO_ANALISIS_DEFECTO = 'claude-opus-5-5';

export function clienteAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY en las variables de entorno de Vercel.');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 280_000, maxRetries: 1 });
}

// ---------------------------------------------------------------------
// Documentos que se envían al modelo (PDF, imagen o texto)
// ---------------------------------------------------------------------
export interface DocumentoIA {
  nombre: string;
  etiqueta: string;          // p. ej. "HISTORIA_CLINICA" o "ACTA"
  mime: string;
  base64?: string;           // para PDF e imágenes
  texto?: string;            // para txt/csv/xlsx convertido
}

type Bloque = Anthropic.Messages.ContentBlockParam;

function bloquesDeDocumento(doc: DocumentoIA): Bloque[] {
  const encabezado: Bloque = { type: 'text', text: `=== DOCUMENTO: ${doc.etiqueta} · archivo "${doc.nombre}" ===` };
  if (doc.base64 && doc.mime === 'application/pdf') {
    return [encabezado, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 }, title: `${doc.etiqueta} - ${doc.nombre}` }];
  }
  if (doc.base64 && /^image\/(jpeg|png|gif|webp)$/.test(doc.mime)) {
    return [encabezado, { type: 'image', source: { type: 'base64', media_type: doc.mime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: doc.base64 } }];
  }
  return [encabezado, { type: 'text', text: doc.texto ?? '(documento vacío o formato no soportado)' }];
}

// ---------------------------------------------------------------------
// 1. EXTRACCIÓN DE ACTAS
//    Nota: el esquema evita campos nulos/opcionales (límites de structured outputs):
//    "" = no aparece en el documento. Los números van como texto de dígitos.
// ---------------------------------------------------------------------
const Concepto = z.enum(['FACTURACION', 'TARIFAS', 'SOPORTES', 'AUTORIZACION', 'COBERTURA', 'PERTINENCIA', 'DEVOLUCION', 'OTRO']);

const GlosaSchema = z.object({
  codigo_erp: z.string().describe('Código de la glosa tal como aparece en el acta (p. ej. "6.08", "PE0101"). "" si no aparece.'),
  concepto_general: Concepto.describe('Clasificación del concepto general según el código y la justificación.'),
  item_codigo: z.string().describe('Código del ítem glosado (CUPS, código SOAT, código interno). "" si no aparece.'),
  item_descripcion: z.string().describe('Descripción del ítem glosado.'),
  item_cantidad: z.string().describe('Cantidad facturada del ítem, solo dígitos. "" si no aparece.'),
  item_valor_facturado: z.string().describe('Valor facturado del ítem en pesos, solo dígitos sin puntos ni símbolos. "" si no aparece.'),
  valor_glosado: z.string().describe('Valor glosado en pesos, solo dígitos. Obligatorio.'),
  justificacion_erp: z.string().describe('Justificación textual COMPLETA de la ERP para esta glosa, transcrita sin resumir.'),
});

const FacturaSchema = z.object({
  numero: z.string().describe('Número de la factura (con prefijo, p. ej. "HRAJ819777").'),
  fecha_factura: z.string().describe('YYYY-MM-DD o "".'),
  fecha_atencion: z.string().describe('Fecha de la atención o ingreso, YYYY-MM-DD o "".'),
  valor_factura: z.string().describe('Valor total de la factura en pesos, solo dígitos, o "".'),
  paciente_tipo_doc: z.string().describe('CC, TI, RC, CE, PA, etc. o "".'),
  paciente_num_doc: z.string().describe('Número de documento del paciente o "".'),
  paciente_nombre: z.string().describe('Nombre del paciente o "".'),
  ramo: z.string().describe('SOAT, EPS, ARL, ADRES, póliza, etc. o "".'),
  numero_poliza: z.string().describe('Número de póliza SOAT si aparece, o "".'),
  numero_reclamacion: z.string().describe('Número de reclamación / radicado / FURIPS si aparece, o "".'),
  diagnostico_cie10: z.string().describe('Código CIE-10 principal si aparece, o "".'),
  servicio: z.string().describe('Urgencias, hospitalización, consulta externa, cirugía… o "".'),
  glosas: z.array(GlosaSchema).describe('Una entrada por cada causal: si un mismo ítem tiene dos causales, son dos glosas.'),
});

export const ActaSchema = z.object({
  erp_nombre: z.string().describe('Entidad responsable de pago (aseguradora, EPS, ARL…).'),
  intermediario: z.string().describe('Firma auditora externa que firma el acta, si existe (p. ej. "RGC Activa"); "" si no.'),
  ips_nombre: z.string().describe('Prestador al que se dirige el acta.'),
  numero_acta: z.string().describe('Número o consecutivo del acta/objeción.'),
  fecha_acta: z.string().describe('YYYY-MM-DD o "".'),
  fecha_notificacion: z.string().describe('Fecha y hora de notificación/envío si aparece, en ISO 8601 con zona -05:00 (p. ej. 2026-10-06T22:39:00-05:00); si solo hay fecha, YYYY-MM-DD; "" si no aparece.'),
  plazo_respuesta_texto: z.string().describe('Lo que el acta dice textualmente sobre el plazo para responder, o "".'),
  facturas: z.array(FacturaSchema),
  observaciones: z.string().describe('Otros datos relevantes del acta (totales, instrucciones de radicación, correo).'),
  advertencias: z.array(z.string()).describe('Dudas de lectura: datos ilegibles, inconsistencias aritméticas, campos ambiguos.'),
});

const PROMPT_EXTRACCION = `Eres un auditor de cuentas médicas en Colombia. Vas a leer un acta de glosas / objeciones / devoluciones enviada por una entidad responsable de pago (ERP) a un prestador (IPS/ESE) y a transcribirla a una estructura de datos.

Reglas estrictas:
1. No inventes nada. Si un dato no aparece, deja "". No deduzcas fechas ni valores.
2. Valores en pesos colombianos como solo dígitos (77120), sin puntos, comas ni "$". Si hay decimales ".00" elimínalos.
3. Fechas en formato YYYY-MM-DD. Si la fecha trae hora, inclúyela en fecha_notificacion con zona -05:00.
4. Una glosa por cada causal sobre cada ítem. Si la ERP glosa el mismo ítem por dos conceptos (p. ej. 6.08 pertinencia y 2.08 tarifa), son dos glosas, cada una con su valor.
5. concepto_general según el código y el texto: 1/FA → FACTURACION; 2/TA → TARIFAS; 3/SO → SOPORTES; 4/AU → AUTORIZACION; 5/CO → COBERTURA; 6/PE → PERTINENCIA; 8/DE → DEVOLUCION. Si el código no permite clasificar, usa el texto de la justificación.
6. justificacion_erp: transcripción COMPLETA y literal del argumento de la ERP; no resumas.
7. En advertencias anota toda inconsistencia: sumas que no cuadran, valores glosados mayores al ítem, texto ilegible, fechas dudosas.
8. Responde únicamente con el JSON del esquema.`;

export async function extraerActa(docs: DocumentoIA[], modelo = MODELO_EXTRACCION_DEFECTO) {
  const client = clienteAnthropic();
  const contenido: Bloque[] = docs.flatMap(bloquesDeDocumento);
  contenido.push({ type: 'text', text: 'Extrae la información del acta anterior según el esquema.' });

  const resp = await client.messages.parse({
    model: modelo,
    max_tokens: 16000,
    system: PROMPT_EXTRACCION,
    messages: [{ role: 'user', content: contenido }],
    output_config: { format: zodOutputFormat(ActaSchema) },
  });
  const crudo = resp.parsed_output;
  if (!crudo) throw new Error(`El modelo no devolvió una extracción válida (stop_reason: ${resp.stop_reason}).`);
  return { acta: normalizarActa(crudo), crudo, modelo, usage: resp.usage };
}

const num = (s: string): number | null => {
  const limpio = s.replace(/[^\d.-]/g, '');
  if (!limpio) return null;
  const n = Number(limpio);
  return isNaN(n) ? null : n;
};
const txt = (s: string): string | null => (s && s.trim() ? s.trim() : null);

export function normalizarActa(a: z.infer<typeof ActaSchema>): ActaExtraida {
  return {
    erp_nombre: txt(a.erp_nombre), intermediario: txt(a.intermediario), ips_nombre: txt(a.ips_nombre),
    numero_acta: txt(a.numero_acta), fecha_acta: txt(a.fecha_acta), fecha_notificacion: txt(a.fecha_notificacion),
    plazo_respuesta_texto: txt(a.plazo_respuesta_texto), observaciones: txt(a.observaciones), advertencias: a.advertencias,
    facturas: a.facturas.map((f) => ({
      numero: f.numero.trim(), fecha_factura: txt(f.fecha_factura), fecha_atencion: txt(f.fecha_atencion), valor_factura: num(f.valor_factura),
      paciente_tipo_doc: txt(f.paciente_tipo_doc), paciente_num_doc: txt(f.paciente_num_doc), paciente_nombre: txt(f.paciente_nombre),
      ramo: txt(f.ramo), numero_poliza: txt(f.numero_poliza), numero_reclamacion: txt(f.numero_reclamacion),
      diagnostico_cie10: txt(f.diagnostico_cie10), servicio: txt(f.servicio),
      glosas: f.glosas.map((g) => ({
        codigo_erp: txt(g.codigo_erp), concepto_general: g.concepto_general as ConceptoGeneral,
        item_codigo: txt(g.item_codigo), item_descripcion: txt(g.item_descripcion), item_cantidad: num(g.item_cantidad),
        item_valor_facturado: num(g.item_valor_facturado), valor_glosado: num(g.valor_glosado) ?? 0, justificacion_erp: g.justificacion_erp.trim(),
      })),
    })),
  };
}

// ---------------------------------------------------------------------
// 2. ANÁLISIS MENTOR DE UNA GLOSA
// ---------------------------------------------------------------------
const ArgumentoSchema = z.object({
  texto: z.string().describe('El argumento, en una o dos frases, redactado para la ERP.'),
  tipo: z.enum(['CLINICO', 'NORMATIVO', 'CONTRACTUAL', 'TARIFARIO', 'ADMINISTRATIVO']),
  evidencia_documento: z.string().describe('Nombre/etiqueta del soporte que lo prueba, o "" si no hay soporte que lo pruebe.'),
  evidencia_pagina: z.string().describe('Página o sección del soporte, o "".'),
  evidencia_cita: z.string().describe('Cita TEXTUAL del soporte (máximo 60 palabras), o "". Nunca parafrasees como si fuera cita.'),
});

export const AnalisisSchema = z.object({
  dictamen: z.enum(['LEVANTAR', 'ACEPTAR_PARCIAL', 'ACEPTAR', 'INSUFICIENTE']).describe('LEVANTAR = la IPS tiene cómo sostener el cobro; ACEPTAR_PARCIAL; ACEPTAR = la ERP tiene razón; INSUFICIENTE = sin soportes no se puede dictaminar.'),
  confianza: z.number().describe('Entre 0 y 1: qué tan sólida es la posición de la IPS con la evidencia disponible.'),
  resumen_ejecutivo: z.string().describe('Tres a cinco frases: qué glosaron, qué dice la evidencia, qué se recomienda y por qué.'),
  lectura_de_la_glosa: z.string().describe('Qué está exigiendo realmente la ERP y si su argumento es sólido o débil, con razones.'),
  argumentos_para_sostener: z.array(ArgumentoSchema).describe('Solo argumentos que se puedan probar con los soportes cargados o con cálculo. Vacío si no hay.'),
  debilidades_de_la_ips: z.array(z.string()).describe('Vacíos de la historia clínica, errores de facturación, incumplimientos; lo que un auditor exigente de la ERP atacaría.'),
  supuestos_y_puntos_ciegos: z.array(z.string()).describe('Lo que se está dando por cierto sin evidencia, y qué habría que verificar.'),
  soportes_faltantes: z.array(z.string()).describe('Documentos concretos que cambiarían el dictamen si se consiguen.'),
  errores_detectados: z.array(z.string()).describe('Errores aritméticos, de codificación, de fechas o normativos, de cualquiera de las dos partes.'),
  valor_a_sostener: z.number().describe('Pesos que la IPS debe sostener (no acepta).'),
  valor_a_aceptar: z.number().describe('Pesos que la IPS debe aceptar. valor_a_sostener + valor_a_aceptar = valor glosado.'),
  codigo_respuesta_sugerido: z.string().describe('Un código del catálogo de respuestas entregado, o "" si ninguno aplica.'),
  respuesta_formal: z.string().describe('Texto completo de la respuesta a la ERP, listo para radicar. Estructura: identificación (acta, factura, ítem, código y valor glosado); hechos con citas de la historia clínica (documento y página); fundamento normativo/contractual aplicable al régimen; cálculo tarifario si aplica; decisión (no se acepta / se acepta parcialmente / se acepta) con valores; relación de soportes anexos. Tono institucional, tercera persona, sin adjetivos ni amenazas. Si el dictamen es INSUFICIENTE, escribe en su lugar qué debe conseguirse antes de responder.'),
  recomendaciones_de_mejora: z.array(z.string()).describe('Acciones para la IPS: registro clínico, facturación, parametrización, radicación.'),
  notas_del_mentor: z.string().describe('Comentario directo para el auditor de CyC: lo que no debe decir, lo que debe verificar, riesgos de la respuesta propuesta.'),
});

const PROMPT_ANALISIS = `Eres un auditor médico de cuentas en Colombia con especialización en auditoría de pertinencia, cuentas médicas, gerencia en salud, contratación, facturación y radicación. Trabajas para CyC Salud, firma que audita y responde glosas en nombre de instituciones prestadoras (IPS/ESE).

Tu rol es de MENTOR RIGUROSO Y HONESTO, no de abogado de la IPS:
- No des por sentado que la IPS tiene razón. Si la glosa está bien puesta, dilo y recomienda aceptarla: responder con argumentos vacíos quema credibilidad ante la ERP y pierde en conciliación.
- Todo argumento clínico debe apoyarse en una cita textual de un soporte cargado (documento + página). Si no hay historia clínica o el registro no dice lo que haría falta, el argumento no existe: dictamina INSUFICIENTE o ACEPTAR, nunca inventes hallazgos clínicos.
- Identifica debilidades, supuestos, puntos ciegos y errores de ambas partes. Sé directo y claro, no duro. Cuando critiques, explica por qué y propone una alternativa mejor.
- Marco normativo: usa SOLO el que aplica al régimen indicado en el contexto. La Resolución 2284 de 2023 NO obliga a aseguradoras SOAT, ADRES ni medicina prepagada; con ellas aplica el Decreto 780/2016, el convenio y el manual tarifario SOAT (Circular 047/2025, UVB). No cites artículos específicos que no estén en el contexto; si no estás seguro de un artículo, cita la norma sin número de artículo.
- Códigos de respuesta: usa únicamente los del catálogo entregado. Si el catálogo está vacío o ninguno aplica, deja "".
- Cálculos: usa los resultados del motor determinista entregados en el contexto; no recalcules tarifas de memoria.
- Pertinencia en trauma (SOAT): la indicación de imágenes se demuestra con mecanismo del accidente, localización del dolor, hallazgos al examen físico, impresión diagnóstica y orden. Un dolor postraumático con examen físico documentado sí justifica la imagen; una nota sin examen físico no se defiende.
- Escribe en español de Colombia, con lenguaje técnico-administrativo propio de la relación IPS-ERP.
- Responde solo con el JSON del esquema.`;

export interface ContextoAnalisis {
  regimen: string;
  marco_normativo: string;
  erp: string;
  ips: string;
  contrato: string;            // resumen + cláusulas
  acta: string;                // número, fechas, plazo textual
  factura: string;             // número, paciente (puede ir seudonimizado), fechas, valores
  glosa: string;               // código, concepto, ítem, valores, justificación ERP
  codigo_glosa_catalogo: string;
  codigos_respuesta: string;   // catálogo disponible
  hallazgos_motor: HallazgosMotor | null;
  soportes_listados: string;   // lista de soportes cargados (tipo, nombre)
}

export async function analizarGlosa(ctx: ContextoAnalisis, soportes: DocumentoIA[], modelo = MODELO_ANALISIS_DEFECTO) {
  const client = clienteAnthropic();
  const contexto = `CONTEXTO DE LA GLOSA
Régimen: ${ctx.regimen}
Marco normativo aplicable: ${ctx.marco_normativo}
ERP: ${ctx.erp}
IPS: ${ctx.ips}
Contrato/convenio: ${ctx.contrato}
Acta: ${ctx.acta}
Factura: ${ctx.factura}
Glosa: ${ctx.glosa}
Código de glosa según catálogo: ${ctx.codigo_glosa_catalogo}
Catálogo de códigos de respuesta disponibles: ${ctx.codigos_respuesta}
Soportes cargados: ${ctx.soportes_listados}

RESULTADOS DEL MOTOR DETERMINISTA (plazos, tarifa, soportes, consistencia):
${JSON.stringify(ctx.hallazgos_motor, null, 2)}`;

  const contenido: Bloque[] = [...soportes.flatMap(bloquesDeDocumento), { type: 'text', text: contexto }, {
    type: 'text',
    text: 'Analiza la glosa como mentor riguroso y produce el dictamen, los argumentos con evidencia, las debilidades y la respuesta formal, según el esquema.',
  }];

  const resp = await client.messages.parse({
    model: modelo,
    max_tokens: 16000,
    system: PROMPT_ANALISIS,
    messages: [{ role: 'user', content: contenido }],
    output_config: { format: zodOutputFormat(AnalisisSchema) },
  });
  const crudo = resp.parsed_output;
  if (!crudo) throw new Error(`El modelo no devolvió un análisis válido (stop_reason: ${resp.stop_reason}).`);

  const analisis: AnalisisGlosa = {
    dictamen: crudo.dictamen,
    confianza: Math.max(0, Math.min(1, crudo.confianza)),
    resumen_ejecutivo: crudo.resumen_ejecutivo,
    lectura_de_la_glosa: crudo.lectura_de_la_glosa,
    argumentos_para_sostener: crudo.argumentos_para_sostener.map((a) => ({
      texto: a.texto, tipo: a.tipo,
      evidencia: a.evidencia_documento ? { documento: a.evidencia_documento, pagina: a.evidencia_pagina || null, cita_textual: a.evidencia_cita || null } : null,
    })),
    debilidades_de_la_ips: crudo.debilidades_de_la_ips,
    supuestos_y_puntos_ciegos: crudo.supuestos_y_puntos_ciegos,
    soportes_faltantes: crudo.soportes_faltantes,
    errores_detectados: crudo.errores_detectados,
    valor_a_sostener: crudo.valor_a_sostener,
    valor_a_aceptar: crudo.valor_a_aceptar,
    codigo_respuesta_sugerido: crudo.codigo_respuesta_sugerido || null,
    respuesta_formal: crudo.respuesta_formal,
    recomendaciones_de_mejora: crudo.recomendaciones_de_mejora,
    notas_del_mentor: crudo.notas_del_mentor,
  };
  return { analisis, modelo, usage: resp.usage };
}
