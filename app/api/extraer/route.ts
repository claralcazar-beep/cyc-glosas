// POST /api/extraer  { ruta, nombre, mime }
// Lee el acta desde Supabase Storage (bucket "actas") y la convierte en facturas + glosas con la IA.
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { documentoDesdeArchivo } from '@/lib/archivos';
import { extraerActa, MODELO_EXTRACCION_DEFECTO } from '@/lib/ia';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { ruta, nombre, mime } = (await req.json()) as { ruta: string; nombre: string; mime: string };
    if (!ruta || !nombre) return NextResponse.json({ error: 'Faltan ruta o nombre del archivo.' }, { status: 400 });

    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const { data: archivo, error } = await sb.storage.from('actas').download(ruta);
    if (error || !archivo) return NextResponse.json({ error: `No se pudo leer el acta desde Storage: ${error?.message ?? 'sin datos'}` }, { status: 400 });
    if (archivo.size > 30 * 1024 * 1024) return NextResponse.json({ error: 'El acta supera 30 MB; divídala.' }, { status: 413 });

    const doc = await documentoDesdeArchivo(await archivo.arrayBuffer(), nombre, mime ?? '', 'ACTA_DE_GLOSAS');

    const { data: pm } = await sb.from('parametros').select('valor').eq('clave', 'MODELO_EXTRACCION').maybeSingle();
    const modelo = process.env.MODELO_EXTRACCION || pm?.valor || MODELO_EXTRACCION_DEFECTO;

    const r = await extraerActa([doc], modelo);
    return NextResponse.json({ acta: r.acta, crudo: r.crudo, modelo: r.modelo, usage: r.usage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[extraer]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
