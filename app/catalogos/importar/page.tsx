'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Upload } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { registrarEvento } from '@/lib/datos';
import { Alerta } from '@/components/ui';

type Destino = 'codigos_glosa' | 'codigos_respuesta' | 'tarifario_soat';

const DEFINICIONES: Record<Destino, { titulo: string; columnas: string[]; obligatorias: string[]; ejemplo: string }> = {
  codigos_glosa: {
    titulo: 'Códigos de glosa y devolución',
    columnas: ['codigo', 'manual', 'concepto_general', 'descripcion', 'aplica_a', 'fuente'],
    obligatorias: ['codigo', 'manual', 'concepto_general', 'descripcion'],
    ejemplo: 'codigo,manual,concepto_general,descripcion,aplica_a,fuente\n6.08,3047,PERTINENCIA,"Pertinencia - imagenología",glosa,"Res. 3047/2008 anexo 6"',
  },
  codigos_respuesta: {
    titulo: 'Códigos de respuesta del prestador',
    columnas: ['codigo', 'manual', 'descripcion', 'efecto', 'fuente'],
    obligatorias: ['codigo', 'manual', 'descripcion'],
    ejemplo: 'codigo,manual,descripcion,efecto,fuente\n996,3047,"Glosa o devolución injustificada",NO_ACEPTA,"Res. 3047/2008 anexo 6"',
  },
  tarifario_soat: {
    titulo: 'Tarifario SOAT en UVB (Circular 047/2025)',
    columnas: ['codigo', 'descripcion', 'uvb', 'grupo', 'vigencia', 'fuente'],
    obligatorias: ['codigo', 'descripcion', 'uvb'],
    ejemplo: 'codigo,descripcion,uvb,grupo,vigencia,fuente\n21101,"Radiografía de muñeca",6.37,Imagenología,2026,"Circular 047/2025"',
  },
};

const normalizar = (s: string) => s.toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '_');

export default function Importar() {
  const sb = supabaseBrowser();
  const [destino, setDestino] = useState<Destino>('codigos_glosa');
  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [msg, setMsg] = useState<{ tipo: 'info' | 'error' | 'ok'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [conteos, setConteos] = useState<Record<Destino, number>>({ codigos_glosa: 0, codigos_respuesta: 0, tarifario_soat: 0 });

  useEffect(() => {
    (async () => {
      const c = { ...conteos };
      for (const t of Object.keys(DEFINICIONES) as Destino[]) {
        const { count } = await sb.from(t).select('*', { count: 'exact', head: true });
        c[t] = count ?? 0;
      }
      setConteos(c);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function leerArchivo(archivo: File) {
    const XLSX = await import('xlsx');
    const buf = await archivo.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const datos = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });
    const limpias = datos.map((r) => { const o: Record<string, unknown> = {}; Object.entries(r).forEach(([k, v]) => { o[normalizar(k)] = v; }); return o; });
    setFilas(limpias);
    setMsg({ tipo: 'info', texto: `${limpias.length} filas leídas. Columnas: ${Object.keys(limpias[0] ?? {}).join(', ')}` });
  }

  function leerTexto(texto: string) {
    const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
    if (lineas.length < 2) return setFilas([]);
    const parse = (l: string) => { const out: string[] = []; let cur = ''; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((s) => s.trim()); };
    const cab = parse(lineas[0]).map(normalizar);
    setFilas(lineas.slice(1).map((l) => { const v = parse(l); const o: Record<string, unknown> = {}; cab.forEach((c, i) => { o[c] = v[i] ?? ''; }); return o; }));
  }

  async function importar() {
    const def = DEFINICIONES[destino];
    const faltan = def.obligatorias.filter((c) => !(c in (filas[0] ?? {})));
    if (filas.length === 0) return setMsg({ tipo: 'error', texto: 'No hay filas.' });
    if (faltan.length) return setMsg({ tipo: 'error', texto: `Faltan columnas obligatorias: ${faltan.join(', ')}` });
    setOcupado(true);
    const registros = filas.map((r) => {
      const o: Record<string, unknown> = { verificado: true };
      def.columnas.forEach((c) => { if (c in r && r[c] !== '') o[c] = r[c]; });
      if (destino === 'tarifario_soat') { o.uvb = Number(String(o.uvb).replace(',', '.')); o.vigencia = Number(o.vigencia || 2026); o.codigo = String(o.codigo); }
      if (destino !== 'tarifario_soat') { o.codigo = String(o.codigo); o.manual = String(o.manual); }
      return o;
    });
    let ok = 0; let err: string | null = null;
    for (let i = 0; i < registros.length; i += 500) {
      const lote = registros.slice(i, i + 500);
      const { error } = await sb.from(destino).upsert(lote, { onConflict: destino === 'tarifario_soat' ? 'codigo,vigencia' : 'codigo,manual' });
      if (error) { err = error.message; break; }
      ok += lote.length;
    }
    setOcupado(false);
    if (err) return setMsg({ tipo: 'error', texto: `Importadas ${ok}. Error: ${err}` });
    await registrarEvento(sb, { ips_id: null, entidad: 'catalogo', entidad_id: null, accion: 'IMPORTACION', detalle: { destino, filas: ok } });
    setMsg({ tipo: 'ok', texto: `Importadas/actualizadas ${ok} filas en ${destino}.` });
    setFilas([]);
  }

  const def = DEFINICIONES[destino];
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="titulo">Importar catálogos oficiales</h1>
        <Link href="/catalogos" className="boton-sec"><ArrowLeft className="h-4 w-4" /> Catálogos</Link>
      </div>
      <Alerta tipo="info">Cargue los catálogos desde los anexos oficiales (Res. 2284/2023 anexo técnico 3, Res. 3047/2008 anexo 6, Circular 047/2025 tabla UVB) convertidos a CSV/XLSX con las columnas indicadas. Las filas importadas quedan marcadas como verificadas: usted responde por la fidelidad de la transcripción.</Alerta>
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(DEFINICIONES) as Destino[]).map((d) => (
          <button key={d} onClick={() => { setDestino(d); setFilas([]); setMsg(null); }} className={`rounded-lg border p-3 text-left text-sm ${destino === d ? 'border-marca-500 bg-marca-50' : 'border-slate-200 bg-white'}`}>
            <div className="font-medium">{DEFINICIONES[d].titulo}</div>
            <div className="text-xs text-slate-500">{conteos[d]} filas cargadas</div>
          </button>
        ))}
      </div>
      <div className="tarjeta space-y-3">
        <div className="text-sm"><b>Columnas:</b> {def.columnas.join(', ')} <span className="text-slate-500">(obligatorias: {def.obligatorias.join(', ')})</span></div>
        <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-xs">{def.ejemplo}</pre>
        <div><label className="etiqueta">Archivo CSV o XLSX</label><input type="file" accept=".csv,.xlsx,.xls" className="campo" onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])} /></div>
        <div><label className="etiqueta">…o pegue el CSV aquí</label><textarea className="campo font-mono text-xs" rows={6} onChange={(e) => leerTexto(e.target.value)} placeholder={def.ejemplo} /></div>
        {filas.length > 0 && (
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="tabla"><thead><tr>{Object.keys(filas[0]).map((k) => <th key={k}>{k}</th>)}</tr></thead>
              <tbody>{filas.slice(0, 5).map((r, i) => <tr key={i}>{Object.keys(filas[0]).map((k) => <td key={k} className="text-xs">{String(r[k])}</td>)}</tr>)}</tbody></table>
            {filas.length > 5 && <div className="px-3 py-1 text-xs text-slate-500">… y {filas.length - 5} filas más</div>}
          </div>
        )}
        {msg && <Alerta tipo={msg.tipo}>{msg.texto}</Alerta>}
        <button className="boton" onClick={importar} disabled={ocupado || filas.length === 0}><Upload className="h-4 w-4" /> {ocupado ? 'Importando…' : `Importar ${filas.length} filas`}</button>
      </div>
    </div>
  );
}
