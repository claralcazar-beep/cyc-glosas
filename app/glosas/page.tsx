'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { diasHabilesEntre, formatoFecha, hoyBogota } from '@/lib/fechas';
import { Cargando, InsigniaDictamen, InsigniaEstado, Vacio, pesos, textoEstado } from '@/components/ui';
import type { Dictamen, EstadoGlosa, Ips } from '@/lib/tipos';

interface Fila {
  id: string; ips_id: string; estado: EstadoGlosa; dictamen: Dictamen | null; valor_glosado: number; valor_aceptado: number; fecha_vencimiento: string | null;
  codigo_erp: string | null; concepto_general: string | null; item_descripcion: string | null;
  facturas: { numero: string; erp: { nombre: string } | null } | null; actas: { numero: string | null } | null; ips: { nombre: string } | null;
}

export default function ListaGlosas() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [ipsLista, setIpsLista] = useState<Ips[]>([]);
  const [fIps, setFIps] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fTexto, setFTexto] = useState('');

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const [{ data: ips }, { data: g }] = await Promise.all([
        sb.from('ips').select('*').order('nombre'),
        sb.from('glosas').select('id, ips_id, estado, dictamen, valor_glosado, valor_aceptado, fecha_vencimiento, codigo_erp, concepto_general, item_descripcion, facturas(numero, erp(nombre)), actas(numero), ips(nombre)').order('creado_en', { ascending: false }),
      ]);
      setIpsLista((ips ?? []) as Ips[]);
      setFilas((g ?? []) as unknown as Fila[]);
    })();
  }, []);

  const hoy = hoyBogota();
  const visibles = useMemo(() => (filas ?? []).filter((g) =>
    (!fIps || g.ips_id === fIps) && (!fEstado || g.estado === fEstado) &&
    (!fTexto || [g.facturas?.numero, g.actas?.numero, g.item_descripcion, g.codigo_erp].join(' ').toLowerCase().includes(fTexto.toLowerCase())),
  ), [filas, fIps, fEstado, fTexto]);

  if (!filas) return <Cargando />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="titulo">Glosas</h1>
        <div className="flex flex-wrap gap-2">
          <input className="campo w-56" placeholder="Buscar factura, acta, ítem…" value={fTexto} onChange={(e) => setFTexto(e.target.value)} />
          <select className="campo w-auto" value={fIps} onChange={(e) => setFIps(e.target.value)}>
            <option value="">Todas las IPS</option>
            {ipsLista.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
          <select className="campo w-auto" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {(Object.keys(textoEstado) as EstadoGlosa[]).map((e) => <option key={e} value={e}>{textoEstado[e]}</option>)}
          </select>
        </div>
      </div>
      <div className="tarjeta overflow-x-auto">
        {visibles.length === 0 ? <Vacio texto="Sin glosas para estos filtros." /> : (
          <table className="tabla">
            <thead><tr><th>Vence</th><th>IPS</th><th>ERP</th><th>Acta</th><th>Factura</th><th>Glosa</th><th>Ítem</th><th className="text-right">Glosado</th><th className="text-right">Aceptado</th><th>Dictamen</th><th>Estado</th></tr></thead>
            <tbody>
              {visibles.map((g) => {
                const d = g.fecha_vencimiento ? diasHabilesEntre(hoy, g.fecha_vencimiento) : null;
                const abierta = g.estado === 'PENDIENTE' || g.estado === 'EN_ANALISIS';
                return (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <td className={abierta && d != null && d < 0 ? 'font-semibold text-red-700' : ''}>{formatoFecha(g.fecha_vencimiento)}</td>
                    <td>{g.ips?.nombre}</td>
                    <td>{g.facturas?.erp?.nombre ?? '—'}</td>
                    <td>{g.actas?.numero ?? '—'}</td>
                    <td>{g.facturas?.numero}</td>
                    <td><Link href={`/glosas/${g.id}`} className="text-marca-600 hover:underline">{g.codigo_erp ?? '—'} · {g.concepto_general}</Link></td>
                    <td className="max-w-xs truncate">{g.item_descripcion}</td>
                    <td className="text-right">{pesos(g.valor_glosado)}</td>
                    <td className="text-right">{pesos(g.valor_aceptado)}</td>
                    <td><InsigniaDictamen dictamen={g.dictamen} /></td>
                    <td><InsigniaEstado estado={g.estado} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
