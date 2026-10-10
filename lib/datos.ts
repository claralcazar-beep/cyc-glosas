// Consultas y utilidades compartidas por las páginas (lado navegador)
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Parametro } from './tipos';

export type MapaParametros = Record<string, { valor: string; verificado: boolean; fuente: string | null }>;

export async function cargarParametros(sb: SupabaseClient): Promise<MapaParametros> {
  const { data } = await sb.from('parametros').select('*');
  const m: MapaParametros = {};
  ((data ?? []) as Parametro[]).forEach((p) => { m[p.clave] = { valor: p.valor, verificado: p.verificado, fuente: p.fuente }; });
  return m;
}

export async function registrarEvento(sb: SupabaseClient, e: { ips_id: string | null; entidad: string; entidad_id: string | null; accion: string; detalle?: unknown }) {
  const { data: { user } } = await sb.auth.getUser();
  await sb.from('eventos').insert({ ...e, detalle: e.detalle ?? null, user_id: user?.id ?? null });
}

// Sube un archivo a un bucket con la convención {ips_id}/... y devuelve la ruta
export async function subirArchivo(sb: SupabaseClient, bucket: 'actas' | 'soportes' | 'contratos', ipsId: string, subcarpeta: string | null, archivo: File) {
  const seguro = archivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_');
  const ruta = [ipsId, subcarpeta, `${Date.now()}_${seguro}`].filter(Boolean).join('/');
  const { error } = await sb.storage.from(bucket).upload(ruta, archivo, { upsert: false, contentType: archivo.type || undefined });
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  return ruta;
}

export async function urlFirmada(sb: SupabaseClient, bucket: string, ruta: string) {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(ruta, 60 * 10);
  if (error || !data) return null;
  return data.signedUrl;
}

export const extensionDe = (nombre: string) => (nombre.split('.').pop() ?? '').toLowerCase();

export const TIPOS_SOPORTE: { valor: string; texto: string }[] = [
  { valor: 'HISTORIA_CLINICA', texto: 'Historia clínica' },
  { valor: 'NOTA_URGENCIAS', texto: 'Nota de urgencias / triage' },
  { valor: 'EPICRISIS', texto: 'Epicrisis' },
  { valor: 'ORDEN_MEDICA', texto: 'Orden médica' },
  { valor: 'RESULTADO', texto: 'Resultado (imagen, laboratorio, informe)' },
  { valor: 'AUTORIZACION', texto: 'Autorización' },
  { valor: 'FURIPS', texto: 'FURIPS / reclamación' },
  { valor: 'FACTURA', texto: 'Factura' },
  { valor: 'RIPS', texto: 'RIPS' },
  { valor: 'CONTRATO', texto: 'Contrato' },
  { valor: 'ANEXO_TARIFARIO', texto: 'Anexo tarifario' },
  { valor: 'OTRO', texto: 'Otro' },
];

export const CONCEPTOS: { valor: string; texto: string }[] = [
  { valor: 'PERTINENCIA', texto: 'Pertinencia' },
  { valor: 'TARIFAS', texto: 'Tarifas' },
  { valor: 'SOPORTES', texto: 'Soportes' },
  { valor: 'AUTORIZACION', texto: 'Autorización' },
  { valor: 'COBERTURA', texto: 'Cobertura' },
  { valor: 'FACTURACION', texto: 'Facturación' },
  { valor: 'DEVOLUCION', texto: 'Devolución' },
  { valor: 'OTRO', texto: 'Otro' },
];

export const REGIMENES: { valor: string; texto: string }[] = [
  { valor: 'SGSSS_2284', texto: 'SGSSS · Res. 2284/2023 (EPS, ARL, ET)' },
  { valor: 'SOAT_780', texto: 'SOAT · Decreto 780/2016 + convenio' },
  { valor: 'ADRES', texto: 'ADRES · reclamaciones' },
  { valor: 'CONVENIO', texto: 'Convenio / prepagada / póliza' },
];
