'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Download, FilePlus2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { cargarParametros, type MapaParametros } from '@/lib/datos';
import { diasHabilesEntre, formatoFecha, hoyBogota } from '@/lib/fechas';
import { Cargando, InsigniaEstado, Vacio, pesos, textoEstado } from '@/components/ui';
import type { EstadoGlosa, Ips } from '@/lib/tipos';

interface FilaGlosa {
  id: string; ips_id: string; estado: EstadoGlosa; valor_glosado: number; valor_aceptado: number; fecha_vencimiento: string | null;
  codigo_erp: string | null; concepto_general: string | null; item_descripcion: string | null; dictamen: string | null; respondido_en: string | null;
  facturas: { numero: string; paciente_nombre: string | null; erp: { nombre: string } | null } | null;
  actas: { numero: string | null; fecha_notificacion: string | null } | null;
  ips: { nombre: string } | null;
}

const ABIERTAS: EstadoGlosa[] = ['PENDIENTE', 'EN_ANALISIS'];

export default function Tablero() {
  const [glosas, setGlosas] = useState<FilaGlosa[] | null>(null);
  const [ipsLista, setIpsLista] = useState<Ips[]>([]);
  const [ipsFiltro, setIpsFiltro] = useState<string>('');
  const [params, setParams] = useState<MapaParametros>({});

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const [{ data: ips }, { data: g }, p] = await Promise.all([
        sb.from('ips').select('*').order('nombre'),
        sb.from('glosas').select('id, ips_id, estado, valor_glosado, valor_aceptado, fecha_vencimiento, codigo_erp, concepto_general, item_descripcion, dictamen, respondido_en, facturas(numero, paciente_nombre, erp(nombre)), actas(numero, fecha_notificacion), ips(nombre)').order('fecha_vencimiento', { ascending: true, nullsFirst: false }),
        cargarParametros(sb),
      ]);
      setIpsLista((ips ?? []) as Ips[]);
      setGlosas((g ?? []) as unknown as FilaGlosa[]);
      setParams(p);
    })();
  }, []);

  const hoy = hoyBogota();
  const alerta = parseInt(params.ALERTA_DIAS_ANTES_VENCER?.valor ?? '5', 10);
  const filtradas = useMemo(() => (glosas ?? []).filter((g) => !ipsFiltro || g.ips_id === ipsFiltro), [glosas, ipsFiltro]);

  const resumen = useMemo(() => {
    const porEstado: Partial<Record<EstadoGlosa, { n: number; valor: number }>> = {};
    let vencidas = 0, porVencer = 0, valorAbierto = 0, valorSostenido = 0, valorAceptado = 0;
    filtradas.forEach((g) => {
      const e = porEstado[g.estado] ?? { n: 0, valor: 0 };
      e.n++; e.valor += Number(g.valor_glosado); porEstado[g.estado] = e;
      if (ABIERTAS.includes(g.estado)) {
        valorAbierto += Number(g.valor_glosado);
        if (g.fecha_vencimiento) {
          const d = diasHabilesEntre(hoy, g.fecha_vencimiento);
          if (d < 0) vencidas++; else if (d <= alerta) porVencer++;
        }
      }
      if (g.estado === 'RESPONDIDA' || g.estado === 'LEVANTADA' || g.estado === 'RATIFICADA' || g.estado === 'CONCILIACION' || g.estado === 'ACEPTADA_IPS') {
        valorAceptado += Number(g.valor_aceptado ?? 0);
        valorSostenido += Number(g.valor_glosado) - Number(g.valor_aceptado ?? 0);
      }
    });
    return { porEstado, vencidas, porVencer, valorAbierto, valorSostenido, valorAceptado };
  }, [filtradas, hoy, alerta]);

  const abiertas = filtradas.filter((g) => ABIERTAS.includes(g.estado));
  const sinVerificar = Object.values(params).filter((p) => !p.verificado).length;

  async function exportarExcel() {
    const XLSX = await import('xlsx');
    const filas = filtradas.map((g) => ({
      IPS: g.ips?.nombre ?? '', ERP: g.facturas?.erp?.nombre ?? '', Acta: g.actas?.numero ?? '', Factura: g.facturas?.numero ?? '',
      Paciente: g.facturas?.paciente_nombre ?? '', 'Código glosa': g.codigo_erp ?? '', Concepto: g.concepto_general ?? '', Ítem: g.item_descripcion ?? '',
      'Valor glosado': Number(g.valor_glosado), 'Valor aceptado': Number(g.valor_aceptado ?? 0), 'Valor sostenido': Number(g.valor_glosado) - Number(g.valor_aceptado ?? 0),
      Estado: textoEstado[g.estado], Dictamen: g.dictamen ?? '', 'Notificación': g.actas?.fecha_notificacion?.slice(0, 10) ?? '', Vence: g.fecha_vencimiento ?? '', 'Respondida el': g.respondido_en?.slice(0, 10) ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trazabilidad');
    XLSX.writeFile(wb, `trazabilidad_glosas_${hoy}.xlsx`);
  }

  if (!glosas) return <Cargando />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="titulo">Tablero de glosas</h1>
          <p className="text-sm text-slate-500">Hoy {formatoFecha(hoy)} · {filtradas.length} glosas registradas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="campo w-auto" value={ipsFiltro} onChange={(e) => setIpsFiltro(e.target.value)}>
            <option value="">Todas las IPS</option>
            {ipsLista.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
          <button className="boton-sec" onClick={exportarExcel}><Download className="h-4 w-4" /> Excel</button>
          <Link href="/actas/nueva" className="boton"><FilePlus2 className="h-4 w-4" /> Nueva acta</Link>
        </div>
      </div>

      {sinVerificar > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {sinVerificar} parámetro(s) normativos sin verificar contra el texto oficial (UVB, regla de aproximación, plazos SOAT/ADRES). Revíselos en <Link className="underline" href="/catalogos">Catálogos</Link> antes de citarlos en una respuesta.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Indicador titulo="Abiertas" valor={abiertas.length} sub={pesos(resumen.valorAbierto)} />
        <Indicador titulo="Vencidas" valor={resumen.vencidas} tono={resumen.vencidas ? 'rojo' : 'neutro'} />
        <Indicador titulo={`Por vencer (≤${alerta} d.h.)`} valor={resumen.porVencer} tono={resumen.porVencer ? 'ambar' : 'neutro'} />
        <Indicador titulo="Valor sostenido" valor={pesos(resumen.valorSostenido)} sub="en respondidas" />
        <Indicador titulo="Valor aceptado" valor={pesos(resumen.valorAceptado)} sub="en respondidas" />
      </div>

      <div className="tarjeta">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Glosas abiertas por vencimiento</h2>
          <Link href="/glosas" className="text-sm text-marca-600 hover:underline">Ver todas</Link>
        </div>
        {abiertas.length === 0 ? <Vacio texto="No hay glosas abiertas. Registre un acta para empezar." /> : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead><tr><th>Vence</th><th>Días háb.</th><th>IPS</th><th>ERP</th><th>Factura</th><th>Glosa</th><th>Ítem</th><th className="text-right">Valor</th><th>Estado</th></tr></thead>
              <tbody>
                {abiertas.map((g) => {
                  const d = g.fecha_vencimiento ? diasHabilesEntre(hoy, g.fecha_vencimiento) : null;
                  const tono = d == null ? '' : d < 0 ? 'text-red-700 font-semibold' : d <= alerta ? 'text-amber-700 font-semibold' : '';
                  return (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <td className={tono}>{formatoFecha(g.fecha_vencimiento)}</td>
                      <td className={tono}>{d == null ? '—' : d < 0 ? `vencida (${-d})` : d}</td>
                      <td>{g.ips?.nombre}</td>
                      <td>{g.facturas?.erp?.nombre ?? '—'}</td>
                      <td>{g.facturas?.numero}</td>
                      <td><Link href={`/glosas/${g.id}`} className="text-marca-600 hover:underline">{g.codigo_erp ?? g.concepto_general}</Link></td>
                      <td className="max-w-xs truncate">{g.item_descripcion}</td>
                      <td className="text-right">{pesos(g.valor_glosado)}</td>
                      <td><InsigniaEstado estado={g.estado} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="tarjeta">
        <h2 className="mb-3 font-semibold">Por estado</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(textoEstado) as EstadoGlosa[]).map((e) => (
            <div key={e} className="rounded-lg border border-slate-100 px-3 py-2">
              <InsigniaEstado estado={e} />
              <div className="mt-1 text-lg font-semibold">{resumen.porEstado[e]?.n ?? 0}</div>
              <div className="text-xs text-slate-500">{pesos(resumen.porEstado[e]?.valor ?? 0)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Indicador({ titulo, valor, sub, tono = 'neutro' }: { titulo: string; valor: number | string; sub?: string; tono?: 'neutro' | 'rojo' | 'ambar' }) {
  const color = tono === 'rojo' ? 'text-red-700' : tono === 'ambar' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className="tarjeta py-4">
      <div className="subtitulo">{titulo}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{valor}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
