'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Plus, Sparkles, Trash2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { CONCEPTOS, cargarParametros, extensionDe, registrarEvento, subirArchivo, type MapaParametros } from '@/lib/datos';
import { fechaBogota, sumarDiasHabiles } from '@/lib/fechas';
import { Alerta, pesos } from '@/components/ui';
import type { ActaExtraida, ConceptoGeneral, Erp, FacturaExtraida, GlosaExtraida, Ips } from '@/lib/tipos';

const glosaVacia = (): GlosaExtraida => ({ codigo_erp: '', concepto_general: 'PERTINENCIA', item_codigo: '', item_descripcion: '', item_cantidad: 1, item_valor_facturado: null, valor_glosado: 0, justificacion_erp: '' });
const facturaVacia = (): FacturaExtraida => ({ numero: '', fecha_factura: null, fecha_atencion: null, valor_factura: null, paciente_tipo_doc: '', paciente_num_doc: '', paciente_nombre: '', ramo: '', numero_poliza: '', numero_reclamacion: '', diagnostico_cie10: '', servicio: '', glosas: [glosaVacia()] });
const actaVacia = (): ActaExtraida => ({ erp_nombre: '', intermediario: '', ips_nombre: '', numero_acta: '', fecha_acta: null, fecha_notificacion: null, plazo_respuesta_texto: '', facturas: [facturaVacia()], observaciones: '', advertencias: [] });

// ISO con zona → valor para <input type="datetime-local"> en hora de Bogotá
function aLocal(iso: string | null): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso}T08:00`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const f = d.toLocaleString('sv-SE', { timeZone: 'America/Bogota' }); // "YYYY-MM-DD HH:mm:ss"
  return f.slice(0, 16).replace(' ', 'T');
}
const deLocal = (v: string) => (v ? `${v}:00-05:00` : null);

export default function NuevaActa() {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [ipsLista, setIpsLista] = useState<Ips[]>([]);
  const [erpLista, setErpLista] = useState<Erp[]>([]);
  const [params, setParams] = useState<MapaParametros>({});
  const [ipsId, setIpsId] = useState('');
  const [erpId, setErpId] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [paso, setPaso] = useState<'cargar' | 'revisar'>('cargar');
  const [acta, setActa] = useState<ActaExtraida>(actaVacia());
  const [rutaArchivo, setRutaArchivo] = useState<string | null>(null);
  const [crudo, setCrudo] = useState<unknown>(null);
  const [modelo, setModelo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: ips }, { data: erp }, p] = await Promise.all([
        sb.from('ips').select('*').eq('activo', true).order('nombre'),
        sb.from('erp').select('*').eq('activo', true).order('nombre'),
        cargarParametros(sb),
      ]);
      setIpsLista((ips ?? []) as Ips[]);
      setErpLista((erp ?? []) as Erp[]);
      setParams(p);
      if (ips?.length === 1) setIpsId(ips[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emparejarErp(nombre: string | null) {
    if (!nombre) return;
    const n = nombre.toLowerCase();
    const hit = erpLista.find((e) => n.includes(e.nombre.toLowerCase()) || e.nombre.toLowerCase().includes(n));
    if (hit) setErpId(hit.id);
  }

  async function leerConIA() {
    if (!ipsId) return setError('Seleccione la IPS a la que pertenece el acta.');
    if (!archivo) return setError('Seleccione el archivo del acta (PDF, TXT, XLSX o CSV).');
    const ext = extensionDe(archivo.name);
    if (!['pdf', 'txt', 'xlsx', 'xls', 'csv'].includes(ext)) return setError('Formato no soportado. Use PDF, TXT, XLSX, XLS o CSV.');
    setError(null);
    try {
      setOcupado('Subiendo el acta…');
      const ruta = await subirArchivo(sb, 'actas', ipsId, null, archivo);
      setRutaArchivo(ruta);
      setOcupado('Leyendo el acta con IA (30–90 s)…');
      const r = await fetch('/api/extraer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruta, nombre: archivo.name, mime: archivo.type }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Error al extraer');
      setActa(j.acta as ActaExtraida);
      setCrudo(j.crudo);
      setModelo(j.modelo);
      emparejarErp((j.acta as ActaExtraida).erp_nombre);
      setPaso('revisar');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function registrarManual() {
    if (!ipsId) return setError('Seleccione la IPS.');
    setError(null);
    if (archivo) {
      try {
        setOcupado('Subiendo el archivo…');
        setRutaArchivo(await subirArchivo(sb, 'actas', ipsId, null, archivo));
      } catch (e) { setError((e as Error).message); } finally { setOcupado(null); }
    }
    setActa(actaVacia());
    setPaso('revisar');
  }

  // --- edición de la revisión ---
  const setCampo = <K extends keyof ActaExtraida>(k: K, v: ActaExtraida[K]) => setActa({ ...acta, [k]: v });
  const setFactura = (i: number, f: Partial<FacturaExtraida>) => setActa({ ...acta, facturas: acta.facturas.map((x, j) => (j === i ? { ...x, ...f } : x)) });
  const setGlosa = (i: number, k: number, g: Partial<GlosaExtraida>) => setFactura(i, { glosas: acta.facturas[i].glosas.map((x, j) => (j === k ? { ...x, ...g } : x)) });
  const quitarGlosa = (i: number, k: number) => setFactura(i, { glosas: acta.facturas[i].glosas.filter((_, j) => j !== k) });
  const quitarFactura = (i: number) => setActa({ ...acta, facturas: acta.facturas.filter((_, j) => j !== i) });

  const totalGlosado = acta.facturas.reduce((s, f) => s + f.glosas.reduce((t, g) => t + Number(g.valor_glosado || 0), 0), 0);

  async function guardar() {
    setError(null);
    if (!ipsId) return setError('Falta la IPS.');
    if (acta.facturas.length === 0) return setError('Registre al menos una factura.');
    for (const f of acta.facturas) {
      if (!f.numero.trim()) return setError('Toda factura necesita número.');
      if (f.glosas.length === 0) return setError(`La factura ${f.numero} no tiene glosas.`);
      for (const g of f.glosas) if (!g.valor_glosado || g.valor_glosado <= 0) return setError(`Glosa sin valor en la factura ${f.numero}.`);
    }
    const erp = erpLista.find((e) => e.id === erpId) ?? null;
    let vence: string | null = null;
    if (acta.fecha_notificacion) {
      const regimen = erp?.regimen ?? 'CONVENIO';
      const dias = erp?.plazo_respuesta_dias_habiles ?? parseInt(params[`PLAZO_RESPUESTA_${regimen}`]?.valor ?? '15', 10);
      vence = sumarDiasHabiles(fechaBogota(acta.fecha_notificacion), dias);
    }
    try {
      setOcupado('Guardando…');
      const { data: { user } } = await sb.auth.getUser();
      const { data: a, error: ea } = await sb.from('actas').insert({
        ips_id: ipsId, erp_id: erpId || null, numero: acta.numero_acta || null, fecha_acta: acta.fecha_acta || null,
        fecha_notificacion: acta.fecha_notificacion || null, archivo_path: rutaArchivo, archivo_nombre: archivo?.name ?? null,
        archivo_tipo: archivo ? extensionDe(archivo.name) : null, json_extraccion: crudo ? { modelo, salida: crudo } : null,
        plazo_respuesta_texto: acta.plazo_respuesta_texto || null, observaciones: [acta.observaciones, acta.intermediario ? `Intermediario: ${acta.intermediario}` : null].filter(Boolean).join('\n') || null,
        creado_por: user?.id ?? null,
      }).select('id').single();
      if (ea || !a) throw new Error(ea?.message ?? 'No se pudo crear el acta');

      for (const f of acta.facturas) {
        const { data: fac, error: ef } = await sb.from('facturas').insert({
          acta_id: a.id, ips_id: ipsId, erp_id: erpId || null, numero: f.numero.trim(), fecha_factura: f.fecha_factura || null, fecha_atencion: f.fecha_atencion || null,
          valor_factura: f.valor_factura, valor_glosado_total: f.glosas.reduce((t, g) => t + Number(g.valor_glosado || 0), 0),
          paciente_tipo_doc: f.paciente_tipo_doc || null, paciente_num_doc: f.paciente_num_doc || null, paciente_nombre: f.paciente_nombre || null,
          ramo: f.ramo || null, numero_poliza: f.numero_poliza || null, numero_reclamacion: f.numero_reclamacion || null,
          diagnostico_cie10: f.diagnostico_cie10 || null, servicio: f.servicio || null,
        }).select('id').single();
        if (ef || !fac) throw new Error(ef?.message ?? 'No se pudo crear la factura');
        const { error: eg } = await sb.from('glosas').insert(f.glosas.map((g) => ({
          factura_id: fac.id, acta_id: a.id, ips_id: ipsId, codigo_erp: g.codigo_erp || null,
          manual: g.codigo_erp && /^\d(\.\d{2})?$/.test(g.codigo_erp) ? '3047' : null,
          concepto_general: g.concepto_general, item_codigo: g.item_codigo || null, item_descripcion: g.item_descripcion || null,
          item_cantidad: g.item_cantidad, item_valor_facturado: g.item_valor_facturado, valor_glosado: g.valor_glosado,
          justificacion_erp: g.justificacion_erp || null, fecha_vencimiento: vence,
        })));
        if (eg) throw new Error(eg.message);
      }
      await registrarEvento(sb, { ips_id: ipsId, entidad: 'acta', entidad_id: a.id, accion: 'ACTA_CREADA', detalle: { facturas: acta.facturas.length, total_glosado: totalGlosado, modelo } });
      router.push(`/actas/${a.id}`);
    } catch (e) {
      setError((e as Error).message);
      setOcupado(null);
    }
  }

  // ---------------------------------------------------------------- UI
  if (paso === 'cargar') {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="titulo">Nueva acta de glosas</h1>
        <div className="tarjeta space-y-4">
          <div>
            <label className="etiqueta">IPS auditada</label>
            <select className="campo" value={ipsId} onChange={(e) => setIpsId(e.target.value)}>
              <option value="">Seleccione…</option>
              {ipsLista.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
            {ipsLista.length === 0 && <p className="mt-1 text-xs text-amber-700">No tiene IPS asignadas. Créelas en Catálogos (requiere rol administrador de CyC).</p>}
          </div>
          <div>
            <label className="etiqueta">Archivo del acta (PDF, TXT, XLSX, CSV)</label>
            <input type="file" accept=".pdf,.txt,.xlsx,.xls,.csv" className="campo" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            <p className="mt-1 text-xs text-slate-500">El archivo se guarda en Supabase Storage y la IA lo lee desde allí. Revise siempre lo extraído antes de guardar: la IA transcribe, usted valida.</p>
          </div>
          {error && <Alerta tipo="error">{error}</Alerta>}
          {ocupado && <Alerta tipo="info">{ocupado}</Alerta>}
          <div className="flex flex-wrap gap-2">
            <button className="boton" onClick={leerConIA} disabled={!!ocupado}><Sparkles className="h-4 w-4" /> Leer acta con IA</button>
            <button className="boton-sec" onClick={registrarManual} disabled={!!ocupado}><FileUp className="h-4 w-4" /> Registrar manualmente</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="titulo">Revisar y guardar</h1>
          <p className="text-sm text-slate-500">{modelo ? `Extraído con ${modelo}. ` : 'Registro manual. '}Corrija cualquier dato antes de guardar.</p>
        </div>
        <div className="text-right">
          <div className="subtitulo">Total glosado</div>
          <div className="text-xl font-semibold">{pesos(totalGlosado)}</div>
        </div>
      </div>

      {acta.advertencias.length > 0 && (
        <Alerta tipo="alerta">
          <div className="font-medium">Advertencias de lectura</div>
          <ul className="list-disc pl-4">{acta.advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </Alerta>
      )}

      <div className="tarjeta grid gap-3 md:grid-cols-3">
        <div><label className="etiqueta">IPS</label>
          <select className="campo" value={ipsId} onChange={(e) => setIpsId(e.target.value)}>{ipsLista.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></div>
        <div><label className="etiqueta">ERP (según acta: {acta.erp_nombre || '—'}{acta.intermediario ? ` vía ${acta.intermediario}` : ''})</label>
          <select className="campo" value={erpId} onChange={(e) => setErpId(e.target.value)}>
            <option value="">Sin asignar</option>
            {erpLista.map((e) => <option key={e.id} value={e.id}>{e.nombre} · {e.regimen}</option>)}
          </select></div>
        <div><label className="etiqueta">Número de acta</label><input className="campo" value={acta.numero_acta ?? ''} onChange={(e) => setCampo('numero_acta', e.target.value)} /></div>
        <div><label className="etiqueta">Fecha del acta</label><input type="date" className="campo" value={acta.fecha_acta ?? ''} onChange={(e) => setCampo('fecha_acta', e.target.value || null)} /></div>
        <div><label className="etiqueta">Notificación (fecha y hora, Bogotá) · inicia el plazo</label>
          <input type="datetime-local" className="campo" value={aLocal(acta.fecha_notificacion)} onChange={(e) => setCampo('fecha_notificacion', deLocal(e.target.value))} /></div>
        <div><label className="etiqueta">Plazo según la ERP (textual)</label><input className="campo" value={acta.plazo_respuesta_texto ?? ''} onChange={(e) => setCampo('plazo_respuesta_texto', e.target.value)} /></div>
        <div className="md:col-span-3"><label className="etiqueta">Observaciones</label><input className="campo" value={acta.observaciones ?? ''} onChange={(e) => setCampo('observaciones', e.target.value)} /></div>
      </div>

      {acta.facturas.map((f, i) => (
        <div key={i} className="tarjeta space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Factura {i + 1}</h2>
            <button className="boton-peligro py-1" onClick={() => quitarFactura(i)}><Trash2 className="h-4 w-4" /> Quitar factura</button>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div><label className="etiqueta">Número *</label><input className="campo" value={f.numero} onChange={(e) => setFactura(i, { numero: e.target.value })} /></div>
            <div><label className="etiqueta">Fecha factura</label><input type="date" className="campo" value={f.fecha_factura ?? ''} onChange={(e) => setFactura(i, { fecha_factura: e.target.value || null })} /></div>
            <div><label className="etiqueta">Fecha atención</label><input type="date" className="campo" value={f.fecha_atencion ?? ''} onChange={(e) => setFactura(i, { fecha_atencion: e.target.value || null })} /></div>
            <div><label className="etiqueta">Valor factura</label><input type="number" className="campo" value={f.valor_factura ?? ''} onChange={(e) => setFactura(i, { valor_factura: e.target.value === '' ? null : Number(e.target.value) })} /></div>
            <div><label className="etiqueta">Tipo doc.</label><input className="campo" value={f.paciente_tipo_doc ?? ''} onChange={(e) => setFactura(i, { paciente_tipo_doc: e.target.value })} /></div>
            <div><label className="etiqueta">Documento</label><input className="campo" value={f.paciente_num_doc ?? ''} onChange={(e) => setFactura(i, { paciente_num_doc: e.target.value })} /></div>
            <div className="md:col-span-2"><label className="etiqueta">Paciente</label><input className="campo" value={f.paciente_nombre ?? ''} onChange={(e) => setFactura(i, { paciente_nombre: e.target.value })} /></div>
            <div><label className="etiqueta">Ramo</label><input className="campo" value={f.ramo ?? ''} onChange={(e) => setFactura(i, { ramo: e.target.value })} /></div>
            <div><label className="etiqueta">Póliza</label><input className="campo" value={f.numero_poliza ?? ''} onChange={(e) => setFactura(i, { numero_poliza: e.target.value })} /></div>
            <div><label className="etiqueta">Reclamación / radicado</label><input className="campo" value={f.numero_reclamacion ?? ''} onChange={(e) => setFactura(i, { numero_reclamacion: e.target.value })} /></div>
            <div><label className="etiqueta">Dx CIE-10 · servicio</label><div className="flex gap-1">
              <input className="campo" placeholder="S62.0" value={f.diagnostico_cie10 ?? ''} onChange={(e) => setFactura(i, { diagnostico_cie10: e.target.value })} />
              <input className="campo" placeholder="Urgencias" value={f.servicio ?? ''} onChange={(e) => setFactura(i, { servicio: e.target.value })} /></div></div>
          </div>

          <div className="overflow-x-auto">
            <table className="tabla">
              <thead><tr><th>Código ERP</th><th>Concepto</th><th>Ítem (código · descripción)</th><th>Cant.</th><th>Facturado</th><th>Glosado *</th><th>Justificación de la ERP</th><th></th></tr></thead>
              <tbody>
                {f.glosas.map((g, k) => (
                  <tr key={k}>
                    <td><input className="campo w-20" value={g.codigo_erp ?? ''} onChange={(e) => setGlosa(i, k, { codigo_erp: e.target.value })} /></td>
                    <td><select className="campo w-36" value={g.concepto_general} onChange={(e) => setGlosa(i, k, { concepto_general: e.target.value as ConceptoGeneral })}>{CONCEPTOS.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}</select></td>
                    <td className="min-w-[14rem]"><input className="campo mb-1 w-28" placeholder="Código" value={g.item_codigo ?? ''} onChange={(e) => setGlosa(i, k, { item_codigo: e.target.value })} />
                      <input className="campo" placeholder="Descripción" value={g.item_descripcion ?? ''} onChange={(e) => setGlosa(i, k, { item_descripcion: e.target.value })} /></td>
                    <td><input type="number" className="campo w-16" value={g.item_cantidad ?? ''} onChange={(e) => setGlosa(i, k, { item_cantidad: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                    <td><input type="number" className="campo w-28" value={g.item_valor_facturado ?? ''} onChange={(e) => setGlosa(i, k, { item_valor_facturado: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                    <td><input type="number" className="campo w-28" value={g.valor_glosado || ''} onChange={(e) => setGlosa(i, k, { valor_glosado: Number(e.target.value) })} /></td>
                    <td className="min-w-[18rem]"><textarea className="campo" rows={3} value={g.justificacion_erp} onChange={(e) => setGlosa(i, k, { justificacion_erp: e.target.value })} /></td>
                    <td><button className="rounded p-1 text-red-600 hover:bg-red-50" title="Quitar glosa" onClick={() => quitarGlosa(i, k)}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="boton-sec py-1" onClick={() => setFactura(i, { glosas: [...f.glosas, glosaVacia()] })}><Plus className="h-4 w-4" /> Agregar glosa</button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button className="boton-sec" onClick={() => setActa({ ...acta, facturas: [...acta.facturas, facturaVacia()] })}><Plus className="h-4 w-4" /> Agregar factura</button>
        <div className="flex-1" />
        <button className="boton-sec" onClick={() => setPaso('cargar')} disabled={!!ocupado}>Volver</button>
        <button className="boton" onClick={guardar} disabled={!!ocupado}>{ocupado ?? 'Guardar acta y glosas'}</button>
      </div>
      {error && <Alerta tipo="error">{error}</Alerta>}
    </div>
  );
}
