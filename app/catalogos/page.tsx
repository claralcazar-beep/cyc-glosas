'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, Upload } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { REGIMENES, registrarEvento, subirArchivo } from '@/lib/datos';
import { Alerta, Cargando, Vacio } from '@/components/ui';
import type { Contrato, Erp, Ips, Parametro } from '@/lib/tipos';

type Pestana = 'ips' | 'erp' | 'contratos' | 'parametros' | 'usuarios';

export default function Catalogos() {
  const [p, setP] = useState<Pestana>('ips');
  const pestanas: { id: Pestana; texto: string }[] = [
    { id: 'ips', texto: 'IPS' }, { id: 'erp', texto: 'ERP / pagadores' }, { id: 'contratos', texto: 'Contratos' }, { id: 'parametros', texto: 'Parámetros' }, { id: 'usuarios', texto: 'Usuarios' },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="titulo">Catálogos</h1>
        <Link href="/catalogos/importar" className="boton-sec"><Upload className="h-4 w-4" /> Importar códigos y tarifario</Link>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {pestanas.map((t) => (
          <button key={t.id} onClick={() => setP(t.id)} className={`px-3 py-2 text-sm ${p === t.id ? 'border-b-2 border-marca-600 font-medium text-marca-700' : 'text-slate-500 hover:text-slate-800'}`}>{t.texto}</button>
        ))}
      </div>
      {p === 'ips' && <TabIps />}
      {p === 'erp' && <TabErp />}
      {p === 'contratos' && <TabContratos />}
      {p === 'parametros' && <TabParametros />}
      {p === 'usuarios' && <TabUsuarios />}
    </div>
  );
}

// ------------------------------------------------------------------ IPS
function TabIps() {
  const sb = supabaseBrowser();
  const [filas, setFilas] = useState<Ips[] | null>(null);
  const [f, setF] = useState<Partial<Ips>>({ nombre: '', activo: true });
  const [msg, setMsg] = useState<string | null>(null);
  const cargar = useCallback(async () => { const { data } = await sb.from('ips').select('*').order('nombre'); setFilas((data ?? []) as Ips[]); }, [sb]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    if (!f.nombre?.trim()) return setMsg('El nombre es obligatorio.');
    const { error } = f.id ? await sb.from('ips').update(f).eq('id', f.id) : await sb.from('ips').insert(f);
    setMsg(error ? `Error: ${error.message} (¿tiene rol administrador de CyC?)` : 'Guardado.');
    if (!error) { setF({ nombre: '', activo: true }); cargar(); }
  }
  if (!filas) return <Cargando />;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="tarjeta space-y-2 lg:col-span-1">
        <div className="subtitulo">{f.id ? 'Editar IPS' : 'Nueva IPS'}</div>
        {(['nombre', 'nit', 'codigo_habilitacion', 'ciudad', 'departamento', 'nivel', 'naturaleza'] as const).map((k) => (
          <div key={k}><label className="etiqueta">{k.replace('_', ' ')}</label><input className="campo" value={(f[k] as string) ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.activo ?? true} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activa</label>
        <div className="flex gap-2"><button className="boton" onClick={guardar}><Save className="h-4 w-4" /> Guardar</button>{f.id && <button className="boton-sec" onClick={() => setF({ nombre: '', activo: true })}>Cancelar</button>}</div>
        {msg && <Alerta tipo="info">{msg}</Alerta>}
      </div>
      <div className="tarjeta lg:col-span-2">
        {filas.length === 0 ? <Vacio texto="Sin IPS. Cree la primera (requiere rol administrador de CyC)." /> : (
          <table className="tabla"><thead><tr><th>Nombre</th><th>NIT</th><th>Ciudad</th><th>Nivel</th><th>Activa</th><th></th></tr></thead>
            <tbody>{filas.map((i) => <tr key={i.id}><td>{i.nombre}</td><td>{i.nit}</td><td>{i.ciudad}</td><td>{i.nivel}</td><td>{i.activo ? 'Sí' : 'No'}</td><td><button className="text-marca-600 hover:underline" onClick={() => setF(i)}>Editar</button></td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ ERP
function TabErp() {
  const sb = supabaseBrowser();
  const [filas, setFilas] = useState<Erp[] | null>(null);
  const vacio: Partial<Erp> = { nombre: '', tipo: 'EPS', regimen: 'SGSSS_2284', activo: true };
  const [f, setF] = useState<Partial<Erp>>(vacio);
  const [msg, setMsg] = useState<string | null>(null);
  const cargar = useCallback(async () => { const { data } = await sb.from('erp').select('*').order('nombre'); setFilas((data ?? []) as Erp[]); }, [sb]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    if (!f.nombre?.trim()) return setMsg('El nombre es obligatorio.');
    const fila = { ...f, plazo_respuesta_dias_habiles: f.plazo_respuesta_dias_habiles || null };
    const { error } = f.id ? await sb.from('erp').update(fila).eq('id', f.id) : await sb.from('erp').insert(fila);
    setMsg(error ? `Error: ${error.message}` : 'Guardado.');
    if (!error) { setF(vacio); cargar(); }
  }
  if (!filas) return <Cargando />;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="tarjeta space-y-2 lg:col-span-1">
        <div className="subtitulo">{f.id ? 'Editar ERP' : 'Nueva ERP'}</div>
        <div><label className="etiqueta">Nombre</label><input className="campo" value={f.nombre ?? ''} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
        <div><label className="etiqueta">NIT</label><input className="campo" value={f.nit ?? ''} onChange={(e) => setF({ ...f, nit: e.target.value })} /></div>
        <div><label className="etiqueta">Tipo</label><select className="campo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{['EPS', 'ARL', 'SOAT', 'ADRES', 'ENTIDAD_TERRITORIAL', 'PREPAGADA', 'ASEGURADORA', 'OTRO'].map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className="etiqueta">Régimen (decide manual, plazos y catálogo)</label><select className="campo" value={f.regimen} onChange={(e) => setF({ ...f, regimen: e.target.value as Erp['regimen'] })}>{REGIMENES.map((r) => <option key={r.valor} value={r.valor}>{r.texto}</option>)}</select></div>
        <div><label className="etiqueta">Intermediario / auditor externo</label><input className="campo" value={f.intermediario ?? ''} onChange={(e) => setF({ ...f, intermediario: e.target.value })} /></div>
        <div><label className="etiqueta">Plazo de respuesta (días hábiles; vacío = parámetro del régimen)</label><input type="number" className="campo" value={f.plazo_respuesta_dias_habiles ?? ''} onChange={(e) => setF({ ...f, plazo_respuesta_dias_habiles: e.target.value ? Number(e.target.value) : null })} /></div>
        <div><label className="etiqueta">Correo de glosas</label><input className="campo" value={f.correo_glosas ?? ''} onChange={(e) => setF({ ...f, correo_glosas: e.target.value })} /></div>
        <div><label className="etiqueta">Plataforma de radicación</label><input className="campo" value={f.plataforma_radicacion ?? ''} onChange={(e) => setF({ ...f, plataforma_radicacion: e.target.value })} /></div>
        <div><label className="etiqueta">Observaciones</label><textarea className="campo" rows={3} value={f.observaciones ?? ''} onChange={(e) => setF({ ...f, observaciones: e.target.value })} /></div>
        <div className="flex gap-2"><button className="boton" onClick={guardar}><Save className="h-4 w-4" /> Guardar</button>{f.id && <button className="boton-sec" onClick={() => setF(vacio)}>Cancelar</button>}</div>
        {msg && <Alerta tipo="info">{msg}</Alerta>}
      </div>
      <div className="tarjeta lg:col-span-2 overflow-x-auto">
        <table className="tabla"><thead><tr><th>Nombre</th><th>Tipo</th><th>Régimen</th><th>Intermediario</th><th>Plazo</th><th></th></tr></thead>
          <tbody>{filas.map((e) => <tr key={e.id}><td>{e.nombre}</td><td>{e.tipo}</td><td>{e.regimen}</td><td>{e.intermediario}</td><td>{e.plazo_respuesta_dias_habiles ?? 'parámetro'}</td><td><button className="text-marca-600 hover:underline" onClick={() => setF(e)}>Editar</button></td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ CONTRATOS
function TabContratos() {
  const sb = supabaseBrowser();
  const [ips, setIps] = useState<Ips[]>([]);
  const [erps, setErps] = useState<Erp[]>([]);
  const [filas, setFilas] = useState<Contrato[] | null>(null);
  const vacio: Partial<Contrato> = { ips_id: '', erp_id: '', tarifario_base: 'SOAT_UVB', porcentaje_sobre_base: 100, activo: true };
  const [f, setF] = useState<Partial<Contrato>>(vacio);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [anexo, setAnexo] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    const [{ data: i }, { data: e }, { data: c }] = await Promise.all([sb.from('ips').select('*').order('nombre'), sb.from('erp').select('*').order('nombre'), sb.from('contratos').select('*').order('creado_en', { ascending: false })]);
    setIps((i ?? []) as Ips[]); setErps((e ?? []) as Erp[]); setFilas((c ?? []) as Contrato[]);
  }, [sb]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    if (!f.ips_id || !f.erp_id) return setMsg('Seleccione IPS y ERP.');
    try {
      const fila = { ...f, porcentaje_sobre_base: f.porcentaje_sobre_base || null, vigencia_desde: f.vigencia_desde || null, vigencia_hasta: f.vigencia_hasta || null };
      if (archivo) fila.archivo_path = await subirArchivo(sb, 'contratos', f.ips_id, 'contratos', archivo);
      if (anexo) fila.anexo_tarifario_path = await subirArchivo(sb, 'contratos', f.ips_id, 'anexos', anexo);
      const { error } = f.id ? await sb.from('contratos').update(fila).eq('id', f.id) : await sb.from('contratos').insert(fila);
      if (error) throw new Error(error.message);
      await registrarEvento(sb, { ips_id: f.ips_id, entidad: 'catalogo', entidad_id: f.id ?? null, accion: 'CONTRATO_GUARDADO', detalle: { numero: f.numero } });
      setMsg('Guardado.'); setF(vacio); setArchivo(null); setAnexo(null); cargar();
    } catch (e) { setMsg(`Error: ${(e as Error).message}`); }
  }
  if (!filas) return <Cargando />;
  const nombreIps = (id: string) => ips.find((i) => i.id === id)?.nombre ?? id;
  const nombreErp = (id: string) => erps.find((e) => e.id === id)?.nombre ?? id;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="tarjeta space-y-2 lg:col-span-1">
        <div className="subtitulo">{f.id ? 'Editar contrato' : 'Nuevo contrato / convenio'}</div>
        <div><label className="etiqueta">IPS</label><select className="campo" value={f.ips_id} onChange={(e) => setF({ ...f, ips_id: e.target.value })}><option value="">—</option>{ips.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></div>
        <div><label className="etiqueta">ERP</label><select className="campo" value={f.erp_id} onChange={(e) => setF({ ...f, erp_id: e.target.value })}><option value="">—</option>{erps.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
        <div><label className="etiqueta">Número</label><input className="campo" value={f.numero ?? ''} onChange={(e) => setF({ ...f, numero: e.target.value })} /></div>
        <div><label className="etiqueta">Modalidad</label><input className="campo" placeholder="evento, capitación, PGP" value={f.modalidad ?? ''} onChange={(e) => setF({ ...f, modalidad: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="etiqueta">Tarifario base</label><select className="campo" value={f.tarifario_base ?? ''} onChange={(e) => setF({ ...f, tarifario_base: e.target.value })}>{['SOAT_UVB', 'SOAT_SMLDV', 'ISS_2001', 'ISS_2004', 'PROPIO', 'OTRO'].map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label className="etiqueta">% sobre base</label><input type="number" className="campo" value={f.porcentaje_sobre_base ?? ''} onChange={(e) => setF({ ...f, porcentaje_sobre_base: e.target.value ? Number(e.target.value) : null })} /></div>
          <div><label className="etiqueta">Vigencia desde</label><input type="date" className="campo" value={f.vigencia_desde ?? ''} onChange={(e) => setF({ ...f, vigencia_desde: e.target.value })} /></div>
          <div><label className="etiqueta">Vigencia hasta</label><input type="date" className="campo" value={f.vigencia_hasta ?? ''} onChange={(e) => setF({ ...f, vigencia_hasta: e.target.value })} /></div>
        </div>
        <div><label className="etiqueta">Cláusulas relevantes (glosas, plazos, soportes, auditoría) — texto literal</label><textarea className="campo" rows={6} value={f.clausulas_relevantes ?? ''} onChange={(e) => setF({ ...f, clausulas_relevantes: e.target.value })} /></div>
        <div><label className="etiqueta">Archivo del contrato (PDF)</label><input type="file" accept=".pdf" className="campo" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} /></div>
        <div><label className="etiqueta">Anexo tarifario (PDF/XLSX)</label><input type="file" accept=".pdf,.xlsx,.xls,.csv" className="campo" onChange={(e) => setAnexo(e.target.files?.[0] ?? null)} /></div>
        <div className="flex gap-2"><button className="boton" onClick={guardar}><Save className="h-4 w-4" /> Guardar</button>{f.id && <button className="boton-sec" onClick={() => setF(vacio)}>Cancelar</button>}</div>
        {msg && <Alerta tipo="info">{msg}</Alerta>}
      </div>
      <div className="tarjeta lg:col-span-2 overflow-x-auto">
        {filas.length === 0 ? <Vacio texto="Sin contratos. El análisis mentor cita lo pactado solo si el contrato está aquí." /> : (
          <table className="tabla"><thead><tr><th>IPS</th><th>ERP</th><th>Número</th><th>Base</th><th>%</th><th>Vigencia</th><th>Archivos</th><th></th></tr></thead>
            <tbody>{filas.map((c) => <tr key={c.id}><td>{nombreIps(c.ips_id)}</td><td>{nombreErp(c.erp_id)}</td><td>{c.numero}</td><td>{c.tarifario_base}</td><td>{c.porcentaje_sobre_base}</td><td>{c.vigencia_desde ?? '—'} → {c.vigencia_hasta ?? '—'}</td><td className="text-xs">{c.archivo_path ? 'contrato ' : ''}{c.anexo_tarifario_path ? 'anexo' : ''}</td><td><button className="text-marca-600 hover:underline" onClick={() => setF(c)}>Editar</button></td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ PARÁMETROS
function TabParametros() {
  const sb = supabaseBrowser();
  const [filas, setFilas] = useState<Parametro[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const cargar = useCallback(async () => { const { data } = await sb.from('parametros').select('*').order('clave'); setFilas((data ?? []) as Parametro[]); }, [sb]);
  useEffect(() => { cargar(); }, [cargar]);
  async function guardar(p: Parametro) {
    const { error } = await sb.from('parametros').update({ valor: p.valor, fuente: p.fuente, verificado: p.verificado, actualizado_en: new Date().toISOString() }).eq('clave', p.clave);
    setMsg(error ? `Error: ${error.message}` : `${p.clave} guardado.`);
    if (!error) await registrarEvento(sb, { ips_id: null, entidad: 'catalogo', entidad_id: null, accion: 'PARAMETRO_ACTUALIZADO', detalle: { clave: p.clave, valor: p.valor, verificado: p.verificado } });
  }
  if (!filas) return <Cargando />;
  return (
    <div className="tarjeta space-y-2 overflow-x-auto">
      <Alerta tipo="info">Marque «verificado» solo después de confrontar el valor con el texto oficial (resolución, circular, convenio). El motor y el mentor advierten cuando un parámetro no está verificado.</Alerta>
      {msg && <Alerta tipo="ok">{msg}</Alerta>}
      <table className="tabla"><thead><tr><th>Clave</th><th>Valor</th><th>Descripción</th><th>Fuente</th><th>Verificado</th><th></th></tr></thead>
        <tbody>{filas.map((p, i) => (
          <tr key={p.clave}>
            <td className="font-mono text-xs">{p.clave}</td>
            <td><input className="campo w-40" value={p.valor} onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} /></td>
            <td className="max-w-md text-xs text-slate-600">{p.descripcion}</td>
            <td><textarea className="campo w-64 text-xs" rows={2} value={p.fuente ?? ''} onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, fuente: e.target.value } : x)))} /></td>
            <td><input type="checkbox" checked={p.verificado} onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, verificado: e.target.checked } : x)))} /></td>
            <td><button className="boton-sec py-1" onClick={() => guardar(p)}><Save className="h-4 w-4" /></button></td>
          </tr>
        ))}</tbody></table>
    </div>
  );
}

// ------------------------------------------------------------------ USUARIOS
interface UsuarioFila { user_id: string; email: string | null; nombre: string | null; es_admin_cyc: boolean; usuarios_ips: { ips_id: string; rol: string }[] }
function TabUsuarios() {
  const sb = supabaseBrowser();
  const [filas, setFilas] = useState<UsuarioFila[] | null>(null);
  const [ips, setIps] = useState<Ips[]>([]);
  const [asig, setAsig] = useState<{ user_id: string; ips_id: string; rol: string }>({ user_id: '', ips_id: '', rol: 'auditor' });
  const [msg, setMsg] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    const [{ data: u }, { data: i }] = await Promise.all([sb.from('usuarios').select('user_id, email, nombre, es_admin_cyc, usuarios_ips(ips_id, rol)').order('email'), sb.from('ips').select('*').order('nombre')]);
    setFilas((u ?? []) as unknown as UsuarioFila[]); setIps((i ?? []) as Ips[]);
  }, [sb]);
  useEffect(() => { cargar(); }, [cargar]);
  async function asignar() {
    if (!asig.user_id || !asig.ips_id) return setMsg('Seleccione usuario e IPS.');
    const { error } = await sb.from('usuarios_ips').upsert(asig);
    setMsg(error ? `Error: ${error.message} (solo el administrador de CyC asigna IPS)` : 'Asignado.');
    cargar();
  }
  async function quitar(user_id: string, ips_id: string) {
    await sb.from('usuarios_ips').delete().eq('user_id', user_id).eq('ips_id', ips_id); cargar();
  }
  async function alternarAdmin(u: UsuarioFila) {
    const { error } = await sb.from('usuarios').update({ es_admin_cyc: !u.es_admin_cyc }).eq('user_id', u.user_id);
    setMsg(error ? `Error: ${error.message}` : 'Actualizado.'); cargar();
  }
  if (!filas) return <Cargando />;
  const nombreIps = (id: string) => ips.find((i) => i.id === id)?.nombre ?? id;
  return (
    <div className="space-y-4">
      <Alerta tipo="info">Los usuarios se crean en Supabase → Authentication → Users (registro público deshabilitado). Aquí se les asigna IPS y rol. El administrador de CyC ve todas las IPS.</Alerta>
      <div className="tarjeta flex flex-wrap items-end gap-2">
        <div><label className="etiqueta">Usuario</label><select className="campo" value={asig.user_id} onChange={(e) => setAsig({ ...asig, user_id: e.target.value })}><option value="">—</option>{filas.map((u) => <option key={u.user_id} value={u.user_id}>{u.email}</option>)}</select></div>
        <div><label className="etiqueta">IPS</label><select className="campo" value={asig.ips_id} onChange={(e) => setAsig({ ...asig, ips_id: e.target.value })}><option value="">—</option>{ips.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></div>
        <div><label className="etiqueta">Rol</label><select className="campo" value={asig.rol} onChange={(e) => setAsig({ ...asig, rol: e.target.value })}><option value="admin">admin</option><option value="auditor">auditor</option><option value="lectura">lectura</option></select></div>
        <button className="boton" onClick={asignar}><Plus className="h-4 w-4" /> Asignar</button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
      <div className="tarjeta overflow-x-auto">
        <table className="tabla"><thead><tr><th>Correo</th><th>Nombre</th><th>Admin CyC</th><th>IPS asignadas</th></tr></thead>
          <tbody>{filas.map((u) => (
            <tr key={u.user_id}>
              <td>{u.email}</td><td>{u.nombre}</td>
              <td><button className={`insignia ${u.es_admin_cyc ? 'bg-marca-100 text-marca-700' : 'bg-slate-100 text-slate-600'}`} onClick={() => alternarAdmin(u)}>{u.es_admin_cyc ? 'Sí (cambiar)' : 'No (cambiar)'}</button></td>
              <td className="space-x-1">{u.usuarios_ips.map((a) => <span key={a.ips_id} className="insignia bg-slate-100 text-slate-700">{nombreIps(a.ips_id)} · {a.rol} <button className="ml-1 text-red-600" onClick={() => quitar(u.user_id, a.ips_id)}>×</button></span>)}</td>
            </tr>
          ))}</tbody></table>
      </div>
    </div>
  );
}
