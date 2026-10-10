// POST /api/analizar  { glosa_id }
// Ejecuta el motor determinista, envía glosa + contexto + soportes al auditor mentor (IA)
// y guarda el análisis en la glosa. La respuesta final la aprueba siempre un humano.
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { documentoDesdeArchivo } from '@/lib/archivos';
import { analizarGlosa, MODELO_ANALISIS_DEFECTO, type DocumentoIA } from '@/lib/ia';
import { ejecutarMotor } from '@/lib/motor';
import type { MapaParametros } from '@/lib/datos';
import type { Acta, CodigoGlosa, CodigoRespuesta, Contrato, Erp, Factura, Glosa, Ips, Parametro, Soporte, TarifaSoat } from '@/lib/tipos';

export const runtime = 'nodejs';
export const maxDuration = 300;

const LIMITE_SOPORTE_BYTES = 25 * 1024 * 1024;   // por archivo
const LIMITE_TOTAL_BYTES = 28 * 1024 * 1024;     // suma (la API admite 32 MB por petición)

export async function POST(req: Request) {
  try {
    const { glosa_id } = (await req.json()) as { glosa_id: string };
    if (!glosa_id) return NextResponse.json({ error: 'Falta glosa_id.' }, { status: 400 });

    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const { data: g } = await sb.from('glosas').select('*').eq('id', glosa_id).single();
    if (!g) return NextResponse.json({ error: 'Glosa no encontrada o sin permiso.' }, { status: 404 });
    const glosa = g as Glosa;

    const [{ data: f }, { data: a }, { data: i }, { data: pr }, { data: s }, { data: h }] = await Promise.all([
      sb.from('facturas').select('*').eq('id', glosa.factura_id).single(),
      sb.from('actas').select('*').eq('id', glosa.acta_id).single(),
      sb.from('ips').select('*').eq('id', glosa.ips_id).single(),
      sb.from('parametros').select('*'),
      sb.from('soportes').select('*').eq('factura_id', glosa.factura_id).order('creado_en'),
      sb.from('glosas').select('*').eq('factura_id', glosa.factura_id),
    ]);
    const factura = f as Factura, acta = a as Acta, ips = i as Ips;
    const parametros: MapaParametros = {};
    ((pr ?? []) as Parametro[]).forEach((p) => { parametros[p.clave] = { valor: p.valor, verificado: p.verificado, fuente: p.fuente }; });
    const soportes = (s ?? []) as Soporte[];
    const hermanas = (h ?? []) as Glosa[];

    const erpId = factura.erp_id ?? acta.erp_id;
    let erp: Erp | null = null, contrato: Contrato | null = null;
    if (erpId) {
      erp = ((await sb.from('erp').select('*').eq('id', erpId).single()).data as Erp) ?? null;
      const { data: c } = await sb.from('contratos').select('*').eq('ips_id', glosa.ips_id).eq('erp_id', erpId).eq('activo', true).order('vigencia_desde', { ascending: false }).limit(1);
      contrato = (c?.[0] as Contrato) ?? null;
    }
    const anio = parseInt((factura.fecha_atencion ?? factura.fecha_factura ?? '2026').slice(0, 4), 10);
    const tarifaSoat = glosa.item_codigo
      ? (((await sb.from('tarifario_soat').select('*').eq('codigo', glosa.item_codigo).eq('vigencia', anio).maybeSingle()).data as TarifaSoat) ?? null)
      : null;
    const codigoCat = glosa.codigo_erp
      ? ((await sb.from('codigos_glosa').select('*').eq('codigo', glosa.codigo_erp).limit(1)).data?.[0] as CodigoGlosa | undefined) ?? null
      : null;
    const manuales = glosa.manual ? [glosa.manual, 'ERP'] : erp?.regimen === 'SGSSS_2284' ? ['2284', 'ERP'] : ['3047', '2284', 'ERP'];
    const codigosResp = ((await sb.from('codigos_respuesta').select('*').in('manual', manuales)).data ?? []) as CodigoRespuesta[];

    // 1. Motor determinista
    const motor = ejecutarMotor({ glosa, factura, acta, erp, contrato, parametros, tarifaSoat, soportesPresentes: soportes.map((x) => x.tipo), glosasHermanas: hermanas });

    // 2. Soportes → documentos para la IA
    const docs: DocumentoIA[] = [];
    const omitidos: string[] = [];
    let total = 0;
    for (const sp of soportes) {
      const { data: archivo, error } = await sb.storage.from('soportes').download(sp.storage_path);
      if (error || !archivo) { omitidos.push(`${sp.nombre_archivo} (no se pudo descargar)`); continue; }
      if (archivo.size > LIMITE_SOPORTE_BYTES || total + archivo.size > LIMITE_TOTAL_BYTES) { omitidos.push(`${sp.nombre_archivo} (excede el tamaño permitido)`); continue; }
      total += archivo.size;
      docs.push(await documentoDesdeArchivo(await archivo.arrayBuffer(), sp.nombre_archivo, sp.mime ?? '', sp.tipo));
    }

    // 3. Contexto textual
    const pesos = (v: number | null | undefined) => (v == null ? '—' : `$${Number(v).toLocaleString('es-CO')}`);
    const iniciales = (factura.paciente_nombre ?? '').split(/\s+/).map((p) => p[0] ?? '').join('.');
    const ctx = {
      regimen: motor.regimen,
      marco_normativo: motor.marco_normativo,
      erp: erp ? `${erp.nombre} (${erp.tipo}${erp.intermediario ? `, audita vía ${erp.intermediario}` : ''})${erp.observaciones ? ` — ${erp.observaciones}` : ''}` : 'Sin asignar',
      ips: `${ips.nombre}${ips.nivel ? `, nivel ${ips.nivel}` : ''}${ips.naturaleza ? `, ${ips.naturaleza}` : ''}${ips.ciudad ? `, ${ips.ciudad}` : ''}`,
      contrato: contrato
        ? `N.º ${contrato.numero ?? 's/n'}; modalidad ${contrato.modalidad ?? '—'}; tarifario base ${contrato.tarifario_base ?? '—'} al ${contrato.porcentaje_sobre_base ?? 100} %; vigencia ${contrato.vigencia_desde ?? '—'} a ${contrato.vigencia_hasta ?? '—'}.\nCláusulas relevantes: ${contrato.clausulas_relevantes ?? '(no registradas)'}`
        : 'No hay contrato registrado para esta IPS-ERP (no se pueden citar cláusulas).',
      acta: `N.º ${acta.numero ?? 's/n'}; fecha ${acta.fecha_acta ?? '—'}; notificada ${acta.fecha_notificacion ?? '—'}; plazo según la ERP: ${acta.plazo_respuesta_texto ?? 'no indicado'}`,
      factura: `N.º ${factura.numero}; fecha ${factura.fecha_factura ?? '—'}; atención ${factura.fecha_atencion ?? '—'}; valor ${pesos(factura.valor_factura)}; paciente ${iniciales} (${factura.paciente_tipo_doc ?? ''} ${factura.paciente_num_doc ?? ''}); ramo ${factura.ramo ?? '—'}; póliza ${factura.numero_poliza ?? '—'}; reclamación ${factura.numero_reclamacion ?? '—'}; Dx ${factura.diagnostico_cie10 ?? '—'}; servicio ${factura.servicio ?? '—'}`,
      glosa: `Código ERP ${glosa.codigo_erp ?? '—'} (${glosa.concepto_general ?? '—'}); ítem ${glosa.item_codigo ?? ''} ${glosa.item_descripcion ?? ''}; cantidad ${glosa.item_cantidad ?? '—'}; facturado ${pesos(glosa.item_valor_facturado)}; GLOSADO ${pesos(glosa.valor_glosado)}.\nJustificación de la ERP (textual): ${glosa.justificacion_erp ?? '—'}\nOtras glosas de la misma factura: ${hermanas.filter((x) => x.id !== glosa.id).map((x) => `${x.codigo_erp ?? x.concepto_general} ${pesos(x.valor_glosado)} sobre ${x.item_codigo ?? ''} ${x.item_descripcion ?? ''}`).join('; ') || 'ninguna'}`,
      codigo_glosa_catalogo: codigoCat ? `${codigoCat.codigo} (${codigoCat.manual}) ${codigoCat.descripcion}${codigoCat.verificado ? '' : ' [no verificado]'}` : 'No está en el catálogo cargado.',
      codigos_respuesta: codigosResp.length ? codigosResp.map((c) => `${c.codigo} (${c.manual}): ${c.descripcion}${c.verificado ? '' : ' [no verificado]'}`).join('; ') : '(vacío)',
      hallazgos_motor: motor,
      soportes_listados: soportes.length ? soportes.map((x) => `${x.tipo}: ${x.nombre_archivo}${x.descripcion ? ` — ${x.descripcion}` : ''}`).join('; ') + (omitidos.length ? ` | OMITIDOS por tamaño: ${omitidos.join('; ')}` : '') : 'NINGUNO (no hay historia clínica ni otros soportes cargados)',
    };

    const { data: pm } = await sb.from('parametros').select('valor').eq('clave', 'MODELO_ANALISIS').maybeSingle();
    const modelo = process.env.MODELO_ANALISIS || pm?.valor || MODELO_ANALISIS_DEFECTO;

    // 4. IA
    const r = await analizarGlosa(ctx, docs, modelo);

    // 5. Guardar
    const cambios: Record<string, unknown> = {
      analisis: r.analisis, hallazgos_motor: motor, dictamen: r.analisis.dictamen, modelo_ia: r.modelo,
    };
    if (glosa.estado === 'PENDIENTE') cambios.estado = 'EN_ANALISIS';
    if (!glosa.fecha_vencimiento && motor.plazo.vence) cambios.fecha_vencimiento = motor.plazo.vence;
    const { error: eu } = await sb.from('glosas').update(cambios).eq('id', glosa.id);
    if (eu) return NextResponse.json({ error: `El análisis se generó pero no se pudo guardar: ${eu.message}` }, { status: 500 });
    await sb.from('eventos').insert({ ips_id: glosa.ips_id, entidad: 'glosa', entidad_id: glosa.id, accion: 'ANALISIS_IA', user_id: user.id,
      detalle: { modelo: r.modelo, dictamen: r.analisis.dictamen, confianza: r.analisis.confianza, soportes: docs.length, omitidos, usage: r.usage } });

    return NextResponse.json({ analisis: r.analisis, hallazgos_motor: motor, modelo: r.modelo, usage: r.usage, omitidos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[analizar]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
