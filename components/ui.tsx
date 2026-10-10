'use client';

import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { Dictamen, EstadoGlosa, Hallazgo } from '@/lib/tipos';

export const pesos = (v: number | null | undefined) =>
  v == null ? '—' : '$' + Number(v).toLocaleString('es-CO', { maximumFractionDigits: 0 });

const estilosEstado: Record<EstadoGlosa, string> = {
  PENDIENTE: 'bg-slate-100 text-slate-700',
  EN_ANALISIS: 'bg-amber-100 text-amber-800',
  RESPONDIDA: 'bg-blue-100 text-blue-800',
  ACEPTADA_IPS: 'bg-rose-100 text-rose-800',
  LEVANTADA: 'bg-emerald-100 text-emerald-800',
  RATIFICADA: 'bg-red-100 text-red-800',
  CONCILIACION: 'bg-purple-100 text-purple-800',
  CERRADA: 'bg-slate-200 text-slate-600',
};

export const textoEstado: Record<EstadoGlosa, string> = {
  PENDIENTE: 'Pendiente', EN_ANALISIS: 'En análisis', RESPONDIDA: 'Respondida', ACEPTADA_IPS: 'Aceptada por la IPS',
  LEVANTADA: 'Levantada por la ERP', RATIFICADA: 'Ratificada por la ERP', CONCILIACION: 'En conciliación', CERRADA: 'Cerrada',
};

export function InsigniaEstado({ estado }: { estado: EstadoGlosa }) {
  return <span className={`insignia ${estilosEstado[estado] ?? 'bg-slate-100'}`}>{textoEstado[estado] ?? estado}</span>;
}

const estilosDictamen: Record<Dictamen, string> = {
  LEVANTAR: 'bg-emerald-100 text-emerald-800',
  ACEPTAR_PARCIAL: 'bg-amber-100 text-amber-800',
  ACEPTAR: 'bg-rose-100 text-rose-800',
  INSUFICIENTE: 'bg-slate-200 text-slate-700',
};
export const textoDictamen: Record<Dictamen, string> = {
  LEVANTAR: 'Sostener el cobro (levantar glosa)', ACEPTAR_PARCIAL: 'Aceptar parcialmente', ACEPTAR: 'Aceptar la glosa', INSUFICIENTE: 'Evidencia insuficiente',
};
export function InsigniaDictamen({ dictamen }: { dictamen: Dictamen | null }) {
  if (!dictamen) return <span className="insignia bg-slate-100 text-slate-500">Sin dictamen</span>;
  return <span className={`insignia ${estilosDictamen[dictamen]}`}>{textoDictamen[dictamen]}</span>;
}

export function Alerta({ tipo = 'info', children }: { tipo?: 'info' | 'alerta' | 'error' | 'ok'; children: React.ReactNode }) {
  const estilos = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    alerta: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tipo];
  const Icono = { info: Info, alerta: AlertTriangle, error: XCircle, ok: CheckCircle2 }[tipo];
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${estilos}`}>
      <Icono className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function TarjetaHallazgo({ h }: { h: Hallazgo }) {
  const tipo = h.severidad === 'ERROR' ? 'error' : h.severidad === 'ALERTA' ? 'alerta' : 'info';
  return (
    <Alerta tipo={tipo}>
      <div className="font-medium">
        <span className="mr-2 rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{h.tipo}</span>
        {h.titulo}
      </div>
      <div className="mt-0.5 whitespace-pre-line text-xs opacity-90">{h.detalle}</div>
    </Alerta>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <div className="py-10 text-center text-sm text-slate-500">{texto}</div>;
}

export function Vacio({ texto }: { texto: string }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{texto}</div>;
}
