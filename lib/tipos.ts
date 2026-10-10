// Tipos compartidos (filas de Supabase y salidas de la IA)

export type Regimen = 'SGSSS_2284' | 'SOAT_780' | 'ADRES' | 'CONVENIO';

export type ConceptoGeneral =
  | 'FACTURACION' | 'TARIFAS' | 'SOPORTES' | 'AUTORIZACION'
  | 'COBERTURA' | 'PERTINENCIA' | 'DEVOLUCION' | 'OTRO';

export type EstadoGlosa =
  | 'PENDIENTE' | 'EN_ANALISIS' | 'RESPONDIDA' | 'ACEPTADA_IPS'
  | 'LEVANTADA' | 'RATIFICADA' | 'CONCILIACION' | 'CERRADA';

export type Dictamen = 'LEVANTAR' | 'ACEPTAR_PARCIAL' | 'ACEPTAR' | 'INSUFICIENTE';

export type TipoSoporte =
  | 'HISTORIA_CLINICA' | 'EPICRISIS' | 'NOTA_URGENCIAS' | 'ORDEN_MEDICA' | 'RESULTADO'
  | 'AUTORIZACION' | 'FURIPS' | 'FACTURA' | 'RIPS' | 'CONTRATO' | 'ANEXO_TARIFARIO' | 'OTRO';

export interface Ips {
  id: string; nombre: string; nit: string | null; codigo_habilitacion: string | null;
  ciudad: string | null; departamento: string | null; nivel: string | null; naturaleza: string | null; activo: boolean;
}

export interface Erp {
  id: string; nombre: string; nit: string | null; tipo: string; regimen: Regimen;
  intermediario: string | null; plazo_respuesta_dias_habiles: number | null;
  correo_glosas: string | null; plataforma_radicacion: string | null; observaciones: string | null; activo: boolean;
}

export interface Contrato {
  id: string; ips_id: string; erp_id: string; numero: string | null; objeto: string | null; modalidad: string | null;
  tarifario_base: string | null; porcentaje_sobre_base: number | null; vigencia_desde: string | null; vigencia_hasta: string | null;
  clausulas_relevantes: string | null; archivo_path: string | null; anexo_tarifario_path: string | null; observaciones: string | null; activo: boolean;
}

export interface Parametro { clave: string; valor: string; descripcion: string | null; fuente: string | null; verificado: boolean; }

export interface TarifaSoat { codigo: string; vigencia: number; descripcion: string; uvb: number; grupo: string | null; fuente: string | null; verificado: boolean; }

export interface CodigoGlosa { codigo: string; manual: string; concepto_general: string; descripcion: string; aplica_a: string | null; fuente: string | null; verificado: boolean; }

export interface CodigoRespuesta { codigo: string; manual: string; descripcion: string; efecto: string | null; fuente: string | null; verificado: boolean; }

export interface Acta {
  id: string; ips_id: string; erp_id: string | null; numero: string | null; fecha_acta: string | null;
  fecha_notificacion: string | null; canal: string | null; archivo_path: string | null; archivo_nombre: string | null;
  archivo_tipo: string | null; texto_extraido: string | null; json_extraccion: unknown; plazo_respuesta_texto: string | null;
  estado: string; observaciones: string | null; creado_en: string;
}

export interface Factura {
  id: string; acta_id: string; ips_id: string; erp_id: string | null; contrato_id: string | null; numero: string;
  fecha_factura: string | null; fecha_atencion: string | null; valor_factura: number | null; valor_glosado_total: number | null;
  paciente_tipo_doc: string | null; paciente_num_doc: string | null; paciente_nombre: string | null; ramo: string | null;
  numero_poliza: string | null; numero_reclamacion: string | null; diagnostico_cie10: string | null; servicio: string | null; observaciones: string | null;
}

export interface Glosa {
  id: string; factura_id: string; acta_id: string; ips_id: string;
  codigo_erp: string | null; manual: string | null; concepto_general: ConceptoGeneral | null;
  item_codigo: string | null; item_descripcion: string | null; item_cantidad: number | null; item_valor_facturado: number | null;
  valor_glosado: number; justificacion_erp: string | null;
  estado: EstadoGlosa; fecha_vencimiento: string | null; dictamen: Dictamen | null;
  hallazgos_motor: HallazgosMotor | null; analisis: AnalisisGlosa | null; modelo_ia: string | null;
  respuesta_texto: string | null; codigo_respuesta: string | null; valor_aceptado: number; valor_sostenido: number | null;
  respondido_por: string | null; respondido_en: string | null; resultado_erp: string | null; resultado_erp_en: string | null;
  creado_en: string; actualizado_en: string;
}

export interface Soporte {
  id: string; ips_id: string; factura_id: string; glosa_id: string | null; tipo: TipoSoporte; nombre_archivo: string;
  storage_path: string; mime: string | null; tamano_bytes: number | null; texto_extraido: string | null; descripcion: string | null; creado_en: string;
}

// ---------- Motor determinista ----------
export interface Hallazgo {
  tipo: 'TARIFA' | 'PLAZO' | 'SOPORTES' | 'CONSISTENCIA' | 'NORMATIVA';
  severidad: 'INFO' | 'ALERTA' | 'ERROR';
  titulo: string;
  detalle: string;
  datos?: Record<string, unknown>;
}

export interface HallazgosMotor {
  calculado_en: string;
  regimen: Regimen;
  marco_normativo: string;
  plazo: { dias_habiles: number; vence: string | null; dias_restantes: number | null; fuente: string; verificado: boolean };
  tarifa: {
    aplica: boolean; codigo?: string; descripcion?: string; uvb?: number; valor_uvb?: number; regla?: string;
    valor_esperado?: number; valor_facturado?: number | null; valor_glosado?: number; diferencia?: number | null; comentario: string;
  } | null;
  soportes_requeridos: TipoSoporte[];
  soportes_presentes: TipoSoporte[];
  soportes_faltantes: TipoSoporte[];
  hallazgos: Hallazgo[];
}

// ---------- Extracción de actas (IA) ----------
export interface GlosaExtraida {
  codigo_erp: string | null;
  concepto_general: ConceptoGeneral;
  item_codigo: string | null;
  item_descripcion: string | null;
  item_cantidad: number | null;
  item_valor_facturado: number | null;
  valor_glosado: number;
  justificacion_erp: string;
}

export interface FacturaExtraida {
  numero: string;
  fecha_factura: string | null;
  fecha_atencion: string | null;
  valor_factura: number | null;
  paciente_tipo_doc: string | null;
  paciente_num_doc: string | null;
  paciente_nombre: string | null;
  ramo: string | null;
  numero_poliza: string | null;
  numero_reclamacion: string | null;
  diagnostico_cie10: string | null;
  servicio: string | null;
  glosas: GlosaExtraida[];
}

export interface ActaExtraida {
  erp_nombre: string | null;
  intermediario: string | null;
  ips_nombre: string | null;
  numero_acta: string | null;
  fecha_acta: string | null;
  fecha_notificacion: string | null;
  plazo_respuesta_texto: string | null;
  facturas: FacturaExtraida[];
  observaciones: string | null;
  advertencias: string[];
}

// ---------- Análisis mentor (IA) ----------
export interface Argumento {
  texto: string;
  tipo: 'CLINICO' | 'NORMATIVO' | 'CONTRACTUAL' | 'TARIFARIO' | 'ADMINISTRATIVO';
  evidencia: { documento: string; pagina: string | null; cita_textual: string | null } | null;
}

export interface AnalisisGlosa {
  dictamen: Dictamen;
  confianza: number; // 0-1
  resumen_ejecutivo: string;
  lectura_de_la_glosa: string;
  argumentos_para_sostener: Argumento[];
  debilidades_de_la_ips: string[];
  supuestos_y_puntos_ciegos: string[];
  soportes_faltantes: string[];
  errores_detectados: string[];
  valor_a_sostener: number;
  valor_a_aceptar: number;
  codigo_respuesta_sugerido: string | null;
  respuesta_formal: string;
  recomendaciones_de_mejora: string[];
  notas_del_mentor: string;
}
