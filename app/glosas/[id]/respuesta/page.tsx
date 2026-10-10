'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { formatoFecha, formatoFechaHora, hoyBogota } from '@/lib/fechas';
import { Cargando, pesos } from '@/components/ui';
import type { Acta, Erp, Factura, Glosa, Ips, Soporte } from '@/lib/tipos';

const TIPO_TEXTO: Record<string, string> = {
  HISTORIA_CLINICA: 'Historia clínica', EPICRISIS: 'Epicrisis', NOTA_URGENCIAS: 'Nota de urgencias', ORDEN_MEDICA: 'Orden médica', RESULTADO: 'Resultado / informe',
  AUTORIZACION: 'Autorización', FURIPS: 'FURIPS', FACTURA: 'Factura', RIPS: 'RIPS', CONTRATO: 'Contrato', ANEXO_TARIFARIO: 'Anexo tarifario', OTRO: 'Otro',
};

export default function RespuestaImprimible() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<{ glosa: Glosa; factura: Factura; acta: Acta; ips: Ips; erp: Erp | null; soportes: Soporte[]; firmante: string } | null>(null);
  const [firmante, setFirmante] = useState('');
  const [cargo, setCargo] = useState('Auditor(a) de cuentas médicas · CyC Salud');

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const { data: g } = await sb.from('glosas').select('*').eq('id', id).single();
      if (!g) return;
      const gl = g as Glosa;
      const [{ data: f }, { data: a }, { data: i }, { data: s }, { data: { user } }] = await Promise.all([
        sb.from('facturas').select('*').eq('id', gl.factura_id).single(),
        sb.from('actas').select('*').eq('id', gl.acta_id).single(),
        sb.from('ips').select('*').eq('id', gl.ips_id).single(),
        sb.from('soportes').select('*').eq('factura_id', gl.factura_id).order('creado_en'),
        sb.auth.getUser(),
      ]);
      const erpId = (f as Factura)?.erp_id ?? (a as Acta)?.erp_id;
      const erp = erpId ? ((await sb.from('erp').select('*').eq('id', erpId).single()).data as Erp) : null;
      const { data: u } = await sb.from('usuarios').select('nombre').eq('user_id', user?.id ?? '').maybeSingle();
      setFirmante(u?.nombre ?? user?.email ?? '');
      setD({ glosa: gl, factura: f as Factura, acta: a as Acta, ips: i as Ips, erp, soportes: (s ?? []) as Soporte[], firmante: u?.nombre ?? '' });
    })();
  }, [id]);

  if (!d) return <Cargando />;
  const { glosa, factura, acta, ips, erp, soportes } = d;
  const sostenido = Number(glosa.valor_glosado) - Number(glosa.valor_aceptado ?? 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-imprimir mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/glosas/${id}`} className="boton-sec"><ArrowLeft className="h-4 w-4" /> Volver a la glosa</Link>
        <div className="flex flex-wrap items-center gap-2">
          <input className="campo w-56" placeholder="Nombre de quien firma" value={firmante} onChange={(e) => setFirmante(e.target.value)} />
          <input className="campo w-72" placeholder="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          <button className="boton" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / Guardar PDF</button>
        </div>
      </div>

      <article className="hoja rounded-xl border border-slate-200 bg-white p-10 text-[13px] leading-relaxed text-slate-900 shadow-sm print:p-0">
        <header className="mb-6 border-b border-slate-300 pb-4">
          <div className="text-lg font-semibold">{ips.nombre}</div>
          <div className="text-xs text-slate-600">{[ips.nit ? `NIT ${ips.nit}` : null, ips.codigo_habilitacion ? `Código de habilitación ${ips.codigo_habilitacion}` : null, [ips.ciudad, ips.departamento].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
        </header>

        <p className="mb-4">{ips.ciudad ?? ''}{ips.ciudad ? ', ' : ''}{formatoFecha(hoyBogota())}</p>

        <p className="mb-1">Señores</p>
        <p className="font-semibold">{erp?.nombre ?? 'Entidad responsable de pago'}</p>
        {erp?.intermediario && <p>Atn. {erp.intermediario} (auditoría)</p>}
        {erp?.correo_glosas && <p className="text-xs text-slate-600">{erp.correo_glosas}</p>}

        <p className="mt-4"><span className="font-semibold">Asunto:</span> Respuesta a glosa {glosa.codigo_erp ? `código ${glosa.codigo_erp}` : ''} · Acta {acta.numero ?? 's/n'} · Factura {factura.numero}</p>

        <table className="my-4 w-full border-collapse text-xs">
          <tbody>
            {[
              ['Paciente', `${factura.paciente_nombre ?? '—'}${factura.paciente_tipo_doc ? ` · ${factura.paciente_tipo_doc} ${factura.paciente_num_doc ?? ''}` : ''}`],
              ['Fecha de atención', formatoFecha(factura.fecha_atencion)],
              ['Ramo / póliza / reclamación', [factura.ramo, factura.numero_poliza ? `póliza ${factura.numero_poliza}` : null, factura.numero_reclamacion ? `reclamación ${factura.numero_reclamacion}` : null].filter(Boolean).join(' · ') || '—'],
              ['Notificación de la glosa', formatoFechaHora(acta.fecha_notificacion)],
              ['Ítem glosado', `${glosa.item_codigo ? `${glosa.item_codigo} · ` : ''}${glosa.item_descripcion ?? ''}`],
              ['Concepto', `${glosa.concepto_general ?? ''} ${glosa.codigo_erp ? `(${glosa.codigo_erp})` : ''}`],
              ['Valor glosado', pesos(glosa.valor_glosado)],
              ['Valor aceptado por el prestador', pesos(glosa.valor_aceptado ?? 0)],
              ['Valor sostenido (no aceptado)', pesos(sostenido)],
              ['Código de respuesta', glosa.codigo_respuesta ?? '—'],
            ].map(([k, v]) => (
              <tr key={k}><td className="w-56 border border-slate-300 bg-slate-50 px-2 py-1 font-medium">{k}</td><td className="border border-slate-300 px-2 py-1">{v}</td></tr>
            ))}
          </tbody>
        </table>

        <div className="whitespace-pre-line text-justify">{glosa.respuesta_texto}</div>

        {soportes.length > 0 && (
          <div className="mt-5">
            <div className="font-semibold">Soportes anexos</div>
            <ol className="list-decimal pl-5 text-xs">{soportes.map((s) => <li key={s.id}>{TIPO_TEXTO[s.tipo] ?? s.tipo} — {s.nombre_archivo}</li>)}</ol>
          </div>
        )}

        <div className="mt-12">
          <div className="w-72 border-t border-slate-400 pt-1">
            <div className="font-semibold">{firmante || '______________________'}</div>
            <div className="text-xs text-slate-600">{cargo}</div>
            <div className="text-xs text-slate-600">En representación de {ips.nombre}</div>
          </div>
        </div>

        <footer className="mt-8 border-t border-slate-200 pt-2 text-[10px] text-slate-500">
          Respuesta elaborada con apoyo de CyC Salud · Auditoría de cuentas médicas. Glosa ID {glosa.id} · aprobada {formatoFechaHora(glosa.respondido_en)}.
        </footer>
      </article>
    </div>
  );
}
