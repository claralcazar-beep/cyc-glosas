'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Printer, Save, Sparkles, Trash2, Upload } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { TIPOS_SOPORTE, cargarParametros, registrarEvento, subirArchivo, urlFirmada, type MapaParametros } from '@/lib/datos';
import { formatoFecha, formatoFechaHora } from '@/lib/fechas';
import { ejecutarMotor } from '@/lib/motor';
import { Alerta, Cargando, InsigniaDictamen, InsigniaEstado, TarjetaHallazgo, pesos, textoDictamen } from '@/components/ui';
import type { Acta, CodigoGlosa, CodigoRespuesta, Contrato, Erp, Factura, Glosa, Ips, Soporte, TarifaSoat, TipoSoporte } from '@/lib/tipos';

export default function DetalleGlosa() {
  const { id } = useParams<{ id: string }>();
  const sb = supabaseBrowser();
  const [glosa, setGlosa] = useState<Glosa | null>(null);
  const [factura, setFactura] = useState<Factura | null>(null);
  const [acta, setActa] = useState<Acta | null>(null);
  const [ips, setIps] = useState<Ips | null>(null);
  const [erp, setErp] = useState<Erp | null>(null);
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [params, setParams] = useState<MapaParametros>({});
  const [tarifa, setTarifa] = useState<TarifaSoat | null>(null);
  const [soportes, setSoportes] = useState<Soporte[]>([]);
  const [hermanas, setHermanas] = useState<Glosa[]>([]);
  const [codigoCat, setCodigoCat] = useState<CodigoGlosa | null>(null);
  const [codigosResp, setCodigosResp] = useState<CodigoRespuesta[]>([]);
  // edición de respuesta
  const [respuesta, setRespuesta] = useState('');
  const [codigoResp, setCodigoResp] = useState('');
  const [valorAceptado, setValorAceptado] = useState(0);
  const [resultadoErp, setResultadoErp] = useState('');
  const [resultadoFecha, setResultadoFecha] = useState('');
  // soporte nuevo
  const [tipoSoporte, setTipoSoporte] = useState<TipoSoporte>('HISTORIA_CLINICA');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'info' | 'error' | 'ok'; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const { data: g } = await sb.from('glosas').select('*').eq('id', id).single();
    if (!g) return;
    const gl = g as Glosa;
    setGlosa(gl);
    setRespuesta(gl.respuesta_texto ?? gl.analisis?.respuesta_formal ?? '');
    setCodigoResp(gl.codigo_respuesta ?? gl.analisis?.codigo_respuesta_sugerido ?? '');
    setValorAceptado(Number(gl.valor_aceptado ?? gl.analisis?.valor_a_aceptar ?? 0));
    setResultadoErp(gl.resultado_erp ?? '');
    setResultadoFecha(gl.resultado_erp_en ?? '');
    const [{ data: f }, { data: a }, { data: i }, p, { data: s }, { data: h }, { data: cr }] = await Promise.all([
      sb.from('facturas').select('*').eq('id', gl.factura_id).single(),
      sb.from('actas').select('*').eq('id', gl.acta_id).single(),
      sb.from('ips').select('*').eq('id', gl.ips_id).single(),
      cargarParametros(sb),
      sb.from('soportes').select('*').eq('factura_id', gl.factura_id).order('creado_en'),
      sb.from('glosas').select('*').eq('factura_id', gl.factura_id),
      sb.from('codigos_respuesta').select('*').order('codigo'),
    ]);
    setFactura(f as Factura); setActa(a as Acta); setIps(i as Ips); setParams(p);
    setSoportes((s ?? []) as Soporte[]); setHermanas((h ?? []) as Glosa[]); setCodigosResp((cr ?? []) as CodigoRespuesta[]);
    const erpId = (f as Factura)?.erp_id ?? (a as Acta)?.erp_id;
    let e: Erp | null = null;
    if (erpId) {
      const { data } = await sb.from('erp').select('*').eq('id', erpId).single();
      e = data as Erp;
      const { data: c } = await sb.from('contratos').select('*').eq('ips_id', gl.ips_id).eq('erp_id', erpId).eq('activo', true).order('vigencia_desde', { ascending: false }).limit(1);
      setContrato((c?.[0] as Contrato) ?? null);
    }
    setErp(e);
    if (gl.item_codigo) {
      const anio = parseInt(((f as Factura)?.fecha_atencion ?? (f as Factura)?.fecha_factura ?? '2026').slice(0, 4), 10);
      const { data: t } = await sb.from('tarifario_soat').select('*').eq('codigo', gl.item_codigo).eq('vigencia', anio).maybeSingle();
      setTarifa((t as TarifaSoat) ?? null);
    }
    if (gl.codigo_erp) {
      const { data: cg } = await sb.from('codigos_glosa').select('*').eq('codigo', gl.codigo_erp).limit(1);
      setCodigoCat((cg?.[0] as CodigoGlosa) ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  const motor = useMemo(() => {
    if (!glosa || !factura || !acta) return null;
    return ejecutarMotor({ glosa, factura, acta, erp, contrato, parametros: params, tarifaSoat: tarifa, soportesPresentes: soportes.map((s) => s.tipo), glosasHermanas: hermanas });
  }, [glosa, factura, acta, erp, contrato, params, tarifa, soportes, hermanas]);

  async function subirSoporte() {
    if (!glosa || !archivo) return setMsg({ tipo: 'error', texto: 'Seleccione un archivo.' });
    try {
      setOcupado('Subiendo soporte…');
      const ruta = await subirArchivo(sb, 'soportes', glosa.ips_id, glosa.factura_id, archivo);
      const { data: { user } } = await sb.auth.getUser();
      const { error } = await sb.from('soportes').insert({ ips_id: glosa.ips_id, factura_id: glosa.factura_id, glosa_id: glosa.id, tipo: tipoSoporte, nombre_archivo: archivo.name, storage_path: ruta, mime: archivo.type || null, tamano_bytes: archivo.size, subido_por: user?.id ?? null });
      if (error) throw new Error(error.message);
      await registrarEvento(sb, { ips_id: glosa.ips_id, entidad: 'soporte', entidad_id: glosa.id, accion: 'SOPORTE_CARGADO', detalle: { tipo: tipoSoporte, nombre: archivo.name } });
      setArchivo(null);
      setMsg({ tipo: 'ok', texto: 'Soporte cargado.' });
      cargar();
    } catch (e) { setMsg({ tipo: 'error', texto: (e as Error).message }); } finally { setOcupado(null); }
  }

  async function eliminarSoporte(s: Soporte) {
    if (!confirm(`¿Eliminar el soporte "${s.nombre_archivo}"?`)) return;
    await sb.storage.from('soportes').remove([s.storage_path]);
    await sb.from('soportes').delete().eq('id', s.id);
    cargar();
  }

  async function verSoporte(s: Soporte) {
    const u = await urlFirmada(sb, 'soportes', s.storage_path);
    if (u) window.open(u, '_blank');
  }

  async function analizar() {
    if (!glosa) return;
    if (motor?.soportes_faltantes.includes('HISTORIA_CLINICA') && glosa.concepto_general === 'PERTINENCIA' && !confirm('No hay historia clínica cargada. El análisis de pertinencia sin HC solo puede concluir "evidencia insuficiente". ¿Continuar de todos modos?')) return;
    setMsg(null);
    try {
      setOcupado('Analizando con el auditor mentor (1–3 min según el tamaño de los soportes)…');
      const r = await fetch('/api/analizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ glosa_id: glosa.id }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Error en el análisis');
      setMsg({ tipo: 'ok', texto: `Análisis completado con ${j.modelo}. Revise el dictamen y edite la respuesta antes de aprobarla.` });
      await cargar();
    } catch (e) { setMsg({ tipo: 'error', texto: (e as Error).message }); } finally { setOcupado(null); }
  }

  async function guardarRespuesta(aprobar: boolean) {
    if (!glosa) return;
    if (aprobar && !respuesta.trim()) return setMsg({ tipo: 'error', texto: 'La respuesta está vacía.' });
    if (valorAceptado < 0 || valorAceptado > Number(glosa.valor_glosado)) return setMsg({ tipo: 'error', texto: 'El valor aceptado debe estar entre 0 y el valor glosado.' });
    setOcupado('Guardando…');
    const { data: { user } } = await sb.auth.getUser();
    const sostenido = Number(glosa.valor_glosado) - valorAceptado;
    const cambios: Partial<Glosa> & Record<string, unknown> = {
      respuesta_texto: respuesta, codigo_respuesta: codigoResp || null, valor_aceptado: valorAceptado, valor_sostenido: sostenido,
      hallazgos_motor: motor ?? glosa.hallazgos_motor,
    };
    if (aprobar) {
      cambios.estado = valorAceptado >= Number(glosa.valor_glosado) ? 'ACEPTADA_IPS' : 'RESPONDIDA';
      cambios.respondido_por = user?.id ?? null;
      cambios.respondido_en = new Date().toISOString();
    }
    const { error } = await sb.from('glosas').update(cambios).eq('id', glosa.id);
    setOcupado(null);
    if (error) return setMsg({ tipo: 'error', texto: error.message });
    await registrarEvento(sb, { ips_id: glosa.ips_id, entidad: 'glosa', entidad_id: glosa.id, accion: aprobar ? 'RESPUESTA_APROBADA' : 'RESPUESTA_BORRADOR', detalle: { valor_aceptado: valorAceptado, valor_sostenido: sostenido, codigo_respuesta: codigoResp || null } });
    setMsg({ tipo: 'ok', texto: aprobar ? 'Respuesta aprobada. Ya puede imprimirla o exportarla a PDF.' : 'Borrador guardado.' });
    cargar();
  }

  async function guardarResultadoErp() {
    if (!glosa) return;
    const estados: Record<string, Glosa['estado']> = { LEVANTADA: 'LEVANTADA', RATIFICADA: 'RATIFICADA', CONCILIACION: 'CONCILIACION', CERRADA: 'CERRADA' };
    const estado = estados[resultadoErp];
    if (!estado) return setMsg({ tipo: 'error', texto: 'Seleccione el resultado.' });
    const { error } = await sb.from('glosas').update({ estado, resultado_erp: resultadoErp, resultado_erp_en: resultadoFecha || null }).eq('id', glosa.id);
    if (error) return setMsg({ tipo: 'error', texto: error.message });
    await registrarEvento(sb, { ips_id: glosa.ips_id, entidad: 'glosa', entidad_id: glosa.id, accion: 'RESULTADO_ERP', detalle: { resultado: resultadoErp, fecha: resultadoFecha } });
    setMsg({ tipo: 'ok', texto: 'Resultado registrado.' });
    cargar();
  }

  if (!glosa || !factura || !acta) return <Cargando />;
  const an = glosa.analisis;
  const respondida = glosa.estado !== 'PENDIENTE' && glosa.estado !== 'EN_ANALISIS';
  const codigosFiltrados = codigosResp.filter((c) => !glosa.manual || c.manual === glosa.manual || c.manual === 'ERP');

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500"><Link href="/actas" className="hover:underline">Actas</Link> / <Link href={`/actas/${acta.id}`} className="hover:underline">{acta.numero ?? 'acta'}</Link> / factura {factura.numero}</div>
          <h1 className="titulo">Glosa {glosa.codigo_erp ?? ''} · {glosa.concepto_general} · {pesos(glosa.valor_glosado)}</h1>
          <p className="text-sm text-slate-600">{ips?.nombre} ← {erp?.nombre ?? 'ERP sin asignar'}{erp?.intermediario ? ` (vía ${erp.intermediario})` : ''} · régimen {erp?.regimen ?? '—'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InsigniaDictamen dictamen={glosa.dictamen} />
          <InsigniaEstado estado={glosa.estado} />
          {respondida && <Link href={`/glosas/${glosa.id}/respuesta`} className="boton-sec"><Printer className="h-4 w-4" /> Imprimir / PDF</Link>}
        </div>
      </div>

      {msg && <Alerta tipo={msg.tipo}>{msg.texto}</Alerta>}
      {ocupado && <Alerta tipo="info">{ocupado}</Alerta>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Columna izquierda: datos + motor + soportes */}
        <div className="space-y-4 lg:col-span-1">
          <div className="tarjeta space-y-2 text-sm">
            <div className="subtitulo">Ítem glosado</div>
            <div className="font-medium">{glosa.item_codigo ? `${glosa.item_codigo} · ` : ''}{glosa.item_descripcion}</div>
            <div className="grid grid-cols-2 gap-1 text-xs text-slate-600">
              <div>Cantidad: {glosa.item_cantidad ?? '—'}</div><div>Facturado: {pesos(glosa.item_valor_facturado)}</div>
              <div>Glosado: <b>{pesos(glosa.valor_glosado)}</b></div><div>Vence: <b>{formatoFecha(glosa.fecha_vencimiento)}</b></div>
            </div>
            {codigoCat && <div className="rounded bg-slate-50 p-2 text-xs">Catálogo {codigoCat.manual}: {codigoCat.descripcion}{!codigoCat.verificado && ' (sin verificar)'}</div>}
            <div className="subtitulo pt-2">Justificación de la ERP</div>
            <div className="whitespace-pre-line rounded bg-amber-50 p-2 text-xs text-amber-950">{glosa.justificacion_erp ?? '—'}</div>
            <div className="subtitulo pt-2">Factura</div>
            <div className="text-xs text-slate-600">{factura.paciente_nombre ?? ''} {factura.paciente_tipo_doc ? `· ${factura.paciente_tipo_doc} ${factura.paciente_num_doc}` : ''}<br />
              Atención {formatoFecha(factura.fecha_atencion)} · Factura {formatoFecha(factura.fecha_factura)} · {pesos(factura.valor_factura)}<br />
              {factura.ramo ?? ''} {factura.numero_poliza ? `· póliza ${factura.numero_poliza}` : ''} {factura.diagnostico_cie10 ? `· Dx ${factura.diagnostico_cie10}` : ''}<br />
              Notificación: {formatoFechaHora(acta.fecha_notificacion)}</div>
            {contrato ? <div className="text-xs text-slate-600">Contrato {contrato.numero ?? ''} · {contrato.tarifario_base ?? ''} {contrato.porcentaje_sobre_base ? `${contrato.porcentaje_sobre_base} %` : ''}</div>
              : <div className="text-xs text-amber-700">Sin contrato registrado para esta IPS-ERP. Cárguelo en Catálogos para que el análisis cite lo pactado.</div>}
          </div>

          {motor && (
            <div className="tarjeta space-y-2">
              <div className="subtitulo">Motor determinista</div>
              <div className="text-xs text-slate-600"><b>Marco:</b> {motor.marco_normativo}</div>
              <div className="text-xs"><b>Plazo:</b> {motor.plazo.dias_habiles} días hábiles → vence {formatoFecha(motor.plazo.vence)} ({motor.plazo.dias_restantes == null ? 'sin notificación' : motor.plazo.dias_restantes < 0 ? `vencido hace ${-motor.plazo.dias_restantes}` : `faltan ${motor.plazo.dias_restantes}`}) · {motor.plazo.fuente}{!motor.plazo.verificado && ' · no verificado'}</div>
              {motor.tarifa && (
                <div className="rounded bg-slate-50 p-2 text-xs">
                  <b>Tarifa:</b> {motor.tarifa.aplica ? `${motor.tarifa.codigo} ${motor.tarifa.descripcion} = ${motor.tarifa.uvb} UVB × ${pesos(motor.tarifa.valor_uvb)} (${motor.tarifa.regla}) → esperado ${pesos(motor.tarifa.valor_esperado)}; facturado ${pesos(motor.tarifa.valor_facturado)}; glosado ${pesos(motor.tarifa.valor_glosado)}` : motor.tarifa.comentario}
                </div>
              )}
              <div className="text-xs"><b>Soportes requeridos:</b> {motor.soportes_requeridos.join(', ')}<br /><b>Faltantes:</b> {motor.soportes_faltantes.length ? <span className="text-red-700">{motor.soportes_faltantes.join(', ')}</span> : <span className="text-emerald-700">ninguno</span>}</div>
              <div className="space-y-1">{motor.hallazgos.map((h, i) => <TarjetaHallazgo key={i} h={h} />)}</div>
            </div>
          )}

          <div className="tarjeta space-y-2">
            <div className="subtitulo">Soportes de la factura ({soportes.length})</div>
            {soportes.length === 0 && <p className="text-xs text-slate-500">Sin soportes. Cargue historia clínica, órdenes y resultados antes de analizar.</p>}
            <ul className="space-y-1 text-xs">
              {soportes.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1">
                  <span className="min-w-0 truncate"><span className="insignia bg-slate-100 text-slate-700">{s.tipo}</span> {s.nombre_archivo}</span>
                  <span className="flex shrink-0 gap-1">
                    <button className="rounded p-1 hover:bg-slate-100" title="Ver" onClick={() => verSoporte(s)}><ExternalLink className="h-3.5 w-3.5" /></button>
                    <button className="rounded p-1 text-red-600 hover:bg-red-50" title="Eliminar" onClick={() => eliminarSoporte(s)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="space-y-2 border-t border-slate-100 pt-2">
              <select className="campo" value={tipoSoporte} onChange={(e) => setTipoSoporte(e.target.value as TipoSoporte)}>{TIPOS_SOPORTE.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}</select>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx" className="campo" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
              <button className="boton-sec w-full justify-center" onClick={subirSoporte} disabled={!!ocupado || !archivo}><Upload className="h-4 w-4" /> Cargar soporte</button>
              <p className="text-[11px] text-slate-400">PDF, imagen (foto de HC), TXT o XLSX. Máx. 50 MB. La IA lee PDF e imágenes página por página; HC muy largas: cargue solo las páginas pertinentes.</p>
            </div>
          </div>
        </div>

        {/* Columna derecha: análisis + respuesta */}
        <div className="space-y-4 lg:col-span-2">
          <div className="tarjeta space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="subtitulo">Análisis del auditor mentor</div>
              <button className="boton" onClick={analizar} disabled={!!ocupado || respondida}><Sparkles className="h-4 w-4" /> {an ? 'Volver a analizar' : 'Analizar con IA'}</button>
            </div>
            {!an && <p className="text-sm text-slate-500">Aún no hay análisis. Cargue los soportes y pulse «Analizar con IA». El resultado incluye dictamen, argumentos con cita de la historia clínica, debilidades de la IPS y un borrador de respuesta.</p>}
            {an && (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <InsigniaDictamen dictamen={an.dictamen} />
                  <span className="text-xs text-slate-500">confianza {(an.confianza * 100).toFixed(0)} % · sostener {pesos(an.valor_a_sostener)} · aceptar {pesos(an.valor_a_aceptar)} · {glosa.modelo_ia}</span>
                </div>
                <Bloque titulo="Resumen ejecutivo"><p className="whitespace-pre-line">{an.resumen_ejecutivo}</p></Bloque>
                <Bloque titulo="Lectura de la glosa"><p className="whitespace-pre-line">{an.lectura_de_la_glosa}</p></Bloque>
                <Bloque titulo={`Argumentos para sostener (${an.argumentos_para_sostener.length})`}>
                  {an.argumentos_para_sostener.length === 0 && <p className="text-slate-500">Ninguno sustentable con la evidencia cargada.</p>}
                  <ol className="list-decimal space-y-2 pl-5">
                    {an.argumentos_para_sostener.map((a, i) => (
                      <li key={i}><span className="mr-1 rounded bg-slate-100 px-1 text-[10px] font-semibold">{a.tipo}</span>{a.texto}
                        {a.evidencia && <div className="mt-1 rounded border-l-2 border-marca-500 bg-marca-50 px-2 py-1 text-xs text-slate-700">{a.evidencia.documento}{a.evidencia.pagina ? ` · pág. ${a.evidencia.pagina}` : ''}{a.evidencia.cita_textual ? `: “${a.evidencia.cita_textual}”` : ''}</div>}
                      </li>
                    ))}
                  </ol>
                </Bloque>
                <div className="grid gap-3 md:grid-cols-2">
                  <Lista titulo="Debilidades de la IPS" items={an.debilidades_de_la_ips} tono="rojo" />
                  <Lista titulo="Supuestos y puntos ciegos" items={an.supuestos_y_puntos_ciegos} tono="ambar" />
                  <Lista titulo="Soportes que cambiarían el dictamen" items={an.soportes_faltantes} />
                  <Lista titulo="Errores detectados" items={an.errores_detectados} tono="rojo" />
                  <Lista titulo="Recomendaciones para la IPS" items={an.recomendaciones_de_mejora} tono="verde" />
                </div>
                <Bloque titulo="Notas del mentor"><p className="whitespace-pre-line rounded bg-slate-50 p-2 text-xs">{an.notas_del_mentor}</p></Bloque>
              </div>
            )}
          </div>

          <div className="tarjeta space-y-3">
            <div className="subtitulo">Respuesta a la ERP {respondida && `· aprobada ${formatoFechaHora(glosa.respondido_en)}`}</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div><label className="etiqueta">Código de respuesta</label>
                <select className="campo" value={codigoResp} onChange={(e) => setCodigoResp(e.target.value)} disabled={respondida}>
                  <option value="">—</option>
                  {codigosFiltrados.map((c) => <option key={`${c.manual}-${c.codigo}`} value={c.codigo}>{c.codigo} · {c.descripcion}{c.verificado ? '' : ' (sin verificar)'}</option>)}
                </select></div>
              <div><label className="etiqueta">Valor aceptado por la IPS</label><input type="number" className="campo" value={valorAceptado} onChange={(e) => setValorAceptado(Number(e.target.value))} disabled={respondida} /></div>
              <div><label className="etiqueta">Valor sostenido</label><div className="py-2 font-semibold">{pesos(Number(glosa.valor_glosado) - valorAceptado)}</div></div>
            </div>
            <textarea className="campo font-mono text-xs" rows={18} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} disabled={respondida} placeholder="Aquí aparece el borrador del mentor. Edítelo: usted firma la respuesta, no la IA." />
            {!respondida && (
              <div className="flex flex-wrap justify-end gap-2">
                <button className="boton-sec" onClick={() => guardarRespuesta(false)} disabled={!!ocupado}><Save className="h-4 w-4" /> Guardar borrador</button>
                <button className="boton" onClick={() => guardarRespuesta(true)} disabled={!!ocupado}><CheckCircle2 className="h-4 w-4" /> Aprobar y marcar respondida</button>
              </div>
            )}
            {an && an.dictamen !== 'LEVANTAR' && !respondida && (
              <Alerta tipo="alerta">El mentor dictaminó «{textoDictamen[an.dictamen]}». Si aun así va a sostener el cobro completo, documente por qué: una respuesta sin evidencia se pierde en conciliación y desgasta la relación con la ERP.</Alerta>
            )}
          </div>

          {respondida && (
            <div className="tarjeta space-y-2">
              <div className="subtitulo">Resultado de la ERP</div>
              <div className="grid gap-3 md:grid-cols-3">
                <select className="campo" value={resultadoErp} onChange={(e) => setResultadoErp(e.target.value)}>
                  <option value="">Seleccione…</option>
                  <option value="LEVANTADA">Glosa levantada (ERP aceptó la respuesta)</option>
                  <option value="RATIFICADA">Glosa ratificada (ERP mantiene)</option>
                  <option value="CONCILIACION">Pasa a conciliación</option>
                  <option value="CERRADA">Cerrada</option>
                </select>
                <input type="date" className="campo" value={resultadoFecha} onChange={(e) => setResultadoFecha(e.target.value)} />
                <button className="boton-sec" onClick={guardarResultadoErp}>Registrar resultado</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</div>{children}</div>;
}

function Lista({ titulo, items, tono = 'neutro' }: { titulo: string; items: string[]; tono?: 'neutro' | 'rojo' | 'ambar' | 'verde' }) {
  const color = { neutro: 'border-slate-200', rojo: 'border-red-200 bg-red-50/40', ambar: 'border-amber-200 bg-amber-50/40', verde: 'border-emerald-200 bg-emerald-50/40' }[tono];
  return (
    <div className={`rounded-lg border p-2 ${color}`}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{titulo}</div>
      {items.length === 0 ? <p className="text-xs text-slate-400">—</p> : <ul className="list-disc space-y-0.5 pl-4 text-xs">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>}
    </div>
  );
}
