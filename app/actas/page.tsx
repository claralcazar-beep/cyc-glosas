'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { formatoFecha, formatoFechaHora } from '@/lib/fechas';
import { Cargando, Vacio, pesos } from '@/components/ui';

interface FilaActa {
  id: string; numero: string | null; fecha_acta: string | null; fecha_notificacion: string | null; estado: string; archivo_nombre: string | null; creado_en: string;
  ips: { nombre: string } | null; erp: { nombre: string } | null;
  glosas: { valor_glosado: number; estado: string }[];
}

export default function ListaActas() {
  const [filas, setFilas] = useState<FilaActa[] | null>(null);

  useEffect(() => {
    supabaseBrowser().from('actas').select('id, numero, fecha_acta, fecha_notificacion, estado, archivo_nombre, creado_en, ips(nombre), erp(nombre), glosas(valor_glosado, estado)')
      .order('creado_en', { ascending: false }).then(({ data }) => setFilas((data ?? []) as unknown as FilaActa[]));
  }, []);

  if (!filas) return <Cargando />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="titulo">Actas de glosas</h1>
        <Link href="/actas/nueva" className="boton"><FilePlus2 className="h-4 w-4" /> Nueva acta</Link>
      </div>
      <div className="tarjeta overflow-x-auto">
        {filas.length === 0 ? <Vacio texto="Aún no hay actas. Cargue la primera desde «Nueva acta»." /> : (
          <table className="tabla">
            <thead><tr><th>Acta</th><th>IPS</th><th>ERP</th><th>Fecha acta</th><th>Notificada</th><th>Glosas</th><th className="text-right">Total glosado</th><th>Pendientes</th><th>Archivo</th></tr></thead>
            <tbody>
              {filas.map((a) => {
                const total = a.glosas.reduce((s, g) => s + Number(g.valor_glosado), 0);
                const pend = a.glosas.filter((g) => g.estado === 'PENDIENTE' || g.estado === 'EN_ANALISIS').length;
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td><Link href={`/actas/${a.id}`} className="font-medium text-marca-600 hover:underline">{a.numero ?? '(sin número)'}</Link></td>
                    <td>{a.ips?.nombre}</td>
                    <td>{a.erp?.nombre ?? '—'}</td>
                    <td>{formatoFecha(a.fecha_acta)}</td>
                    <td>{formatoFechaHora(a.fecha_notificacion)}</td>
                    <td>{a.glosas.length}</td>
                    <td className="text-right">{pesos(total)}</td>
                    <td>{pend ? <span className="insignia bg-amber-100 text-amber-800">{pend}</span> : <span className="insignia bg-emerald-100 text-emerald-800">0</span>}</td>
                    <td className="max-w-[12rem] truncate text-xs text-slate-500">{a.archivo_nombre}</td>
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
