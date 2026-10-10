'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Save, Trash2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { cargarParametros, registrarEvento, urlFirmada, type MapaParametros } from '@/lib/datos';
import { fechaBogota, formatoFecha, formatoFechaHora, sumarDiasHabiles } from '@/lib/fechas';
import { Alerta, Cargando, InsigniaDictamen, InsigniaEstado, pesos } from '@/components/ui';
import type { Acta, Erp, Factura, Glosa } from '@/lib/tipos';

type FacturaConGlosas = Factura & { glosas: Glosa[] };

function aLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).slice(0, 16).replace(' ', 'T');
}

export default function DetalleActa() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sb = supabaseBrowser();
  const [acta, setActa] = useState<(Acta & { ips: { nombre: string } | null }) | null>(null);
  const [facturas, setFacturas] = useState<FacturaConGlosas[]>([]);
  const [erpLista, setErpLista] = useState<Erp[]>([]);
  const [params, setParams] = useState<MapaParametros>({});
  const [urlArchivo, setUrlArchivo] = useState<string | null>(null);
  const [notif, setNotif] = useState('');
  const [erpId, setErpId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const [{ data: a }, { data: f }, { data: e }, p] = await Promise.all([
      sb.from('actas').select('*, ips(nombre)').eq('id', id).single(),
      sb.from('facturas').select('*, glosas(*)').eq('acta_id', id).order('numero'),
      sb.from('erp').select('*').order('nombre'),
      cargarParametros(sb),
    ]);
    if (!a) return;
    setActa(a as Acta & { ips: { nombre: string } | null });
    setFacturas((f ?? []) as FacturaConGlosas[]);
    setErpLista((e ?? []) as Erp[]);
    setParams(p);
    setNotif(aLocal(a.fecha_notificacion));
    setErpId(a.erp_id ?? '');
    if (a.archivo_path) setUrlArchivo(await urlFirmada(sb, 'actas', a.archivo_path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardarEncabezado() {
    if (!acta) return;
    setOcupado(true); setMsg(null);
    const fechaNotif = notif ? `${notif}:00-05:00` : null;
    const erp = erpLista.find((e) => e.id === erpId) ?? null;
    const regimen = erp?.regimen ?? 'CONVENIO';
    const dias = erp?.plazo_respuesta_dias_habiles ?? parseInt(params[`PLAZO_RESPUESTA_${regimen}`]?.valor ?? '15', 10);
    const vence = fechaNotif ? sumarDiasHabiles(fechaBogota(fechaNotif), dias) : null;
    const { error } = await sb.from('actas').update({ fecha_notificacion: fechaNotif, erp_id: erpId || null }).eq('id', id);
    if (error) { setMsg(error.message); setOcupado(false); return; }
    await sb.from('facturas').update({ erp_id: erpId || null }).eq('acta_id', id);
    await sb.from('glosas').update({ fecha_vencimiento: vence }).eq('acta_id', id).in('estado', ['PENDIENTE', 'EN_ANALISIS']);
    await registrarEvento(sb, { ips_id: acta.ips_id, entidad: 'acta', entidad_id: id, accion: 'ACTA_ACTUALIZADA', detalle: { fecha_notificacion: fechaNotif, erp_id: erpId || null, vence } });
    setMsg(`Guardado. Vencimiento recalculado: ${vence ? formatoFecha(vence) : 'sin fecha de notificación'} (${dias} días hábiles).`);
    setOcupado(false);
    cargar();
  }

  async function eliminarActa() {
    if (!acta || !confirm('¿Eliminar el acta con todas sus facturas y glosas? Esta acción no se puede deshacer.')) return;
    const { error } = await sb.from('actas').delete().eq('id', id);
    if (error) return setMsg(error.message);
    router.push('/actas');
  }

  if (!acta) return <Cargando />;
  const total = facturas.reduce((s, f) => s + f.glosas.reduce((t, g) => t + Number(g.valor_glosado), 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500"><Link href="/actas" className="hover:underline">Actas</Link> / {acta.numero ?? id.slice(0, 8)}</div>
          <h1 className="titulo">Acta {acta.numero ?? '(sin número)'}</h1>
          <p className="text-sm text-slate-500">{acta.ips?.nombre} · {facturas.length} factura(s) · {facturas.reduce((s, f) => s + f.glosas.length, 0)} glosa(s) · total glosado {pesos(total)}</p>
        </div>
        <div className="flex gap-2">
          {urlArchivo && <a href={urlArchivo} target="_blank" rel="noreferrer" className="boton-sec"><ExternalLink className="h-4 w-4" /> Ver acta original</a>}
          <button className="boton-peligro" onClick={eliminarActa}><Trash2 className="h-4 w-4" /> Eliminar</button>
        </div>
      </div>

      <div className="tarjeta grid gap-3 md:grid-cols-4">
        <div><label className="etiqueta">ERP</label>
          <select className="campo" value={erpId} onChange={(e) => setErpId(e.target.value)}>
            <option value="">Sin asignar</option>
            {erpLista.map((e) => <option key={e.id} value={e.id}>{e.nombre} · {e.regimen}</option>)}
          </select></div>
        <div><label className="etiqueta">Notificación (Bogotá)</label><input type="datetime-local" className="campo" value={notif} onChange={(e) => setNotif(e.target.value)} /></div>
        <div><label className="etiqueta">Fecha acta</label><div className="py-2 text-sm">{formatoFecha(acta.fecha_acta)}</div></div>
        <div className="flex items-end"><button className="boton" onClick={guardarEncabezado} disabled={ocupado}><Save className="h-4 w-4" /> Guardar y recalcular plazos</button></div>
        {acta.plazo_respuesta_texto && <div className="md:col-span-4 text-xs text-slate-600"><span className="font-medium">Plazo según la ERP:</span> {acta.plazo_respuesta_texto}</div>}
        {acta.observaciones && <div className="md:col-span-4 whitespace-pre-line text-xs text-slate-600">{acta.observaciones}</div>}
        {msg && <div className="md:col-span-4"><Alerta tipo="info">{msg}</Alerta></div>}
      </div>

      {facturas.map((f) => (
        <div key={f.id} className="tarjeta space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Factura {f.numero} <span className="ml-2 text-sm font-normal text-slate-500">{f.paciente_nombre ?? ''} {f.paciente_tipo_doc ? `· ${f.paciente_tipo_doc} ${f.paciente_num_doc ?? ''}` : ''}</span></h2>
            <div className="text-sm text-slate-600">Atención {formatoFecha(f.fecha_atencion)} · Factura {formatoFecha(f.fecha_factura)} · Valor {pesos(f.valor_factura)} · {f.ramo ?? ''} {f.numero_poliza ? `· póliza ${f.numero_poliza}` : ''}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead><tr><th>Código</th><th>Concepto</th><th>Ítem</th><th className="text-right">Facturado</th><th className="text-right">Glosado</th><th>Vence</th><th>Dictamen</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {f.glosas.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <td className="font-medium">{g.codigo_erp ?? '—'}</td>
                    <td>{g.concepto_general}</td>
                    <td className="max-w-md"><div className="truncate">{g.item_codigo ? `${g.item_codigo} · ` : ''}{g.item_descripcion}</div></td>
                    <td className="text-right">{pesos(g.item_valor_facturado)}</td>
                    <td className="text-right font-medium">{pesos(g.valor_glosado)}</td>
                    <td>{formatoFecha(g.fecha_vencimiento)}</td>
                    <td><InsigniaDictamen dictamen={g.dictamen} /></td>
                    <td><InsigniaEstado estado={g.estado} /></td>
                    <td><Link href={`/glosas/${g.id}`} className="text-marca-600 hover:underline">Gestionar →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-400">Creada {formatoFechaHora(acta.creado_en)}</p>
    </div>
  );
}
