// Administración de usuarios desde la app (solo administradores de CyC).
// POST  { email, nombre, password, ips_id?, rol? }  → crea el usuario en Auth (confirmado) y lo asigna a una IPS
// PATCH { user_id, password }                       → cambia la contraseña
// DELETE { user_id }                                → elimina el usuario
// Requiere SUPABASE_SERVICE_ROLE_KEY (clave secreta sb_secret_… / service_role) en Vercel. Nunca llega al navegador.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { SUPABASE_URL } from '@/lib/supabase/config';

export const runtime = 'nodejs';

async function exigirAdmin() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'No autenticado.' }, { status: 401 }) };
  const { data } = await sb.from('usuarios').select('es_admin_cyc').eq('user_id', user.id).maybeSingle();
  if (!data?.es_admin_cyc) return { error: NextResponse.json({ error: 'Solo el administrador de CyC puede gestionar usuarios.' }, { status: 403 }) };
  return { user };
}

function clienteAdmin() {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno de Vercel.');
  return createClient(SUPABASE_URL, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: Request) {
  try {
    const g = await exigirAdmin();
    if ('error' in g) return g.error;
    const { email, nombre, password, ips_id, rol } = (await req.json()) as { email: string; nombre?: string; password: string; ips_id?: string; rol?: string };
    if (!email || !password) return NextResponse.json({ error: 'Correo y contraseña son obligatorios.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });

    const admin = clienteAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(), password, email_confirm: true, user_metadata: { nombre: nombre?.trim() || null },
    });
    if (error || !data.user) return NextResponse.json({ error: error?.message ?? 'No se pudo crear el usuario.' }, { status: 400 });

    // El trigger crea el perfil; aseguramos nombre y asignación
    await admin.from('usuarios').upsert({ user_id: data.user.id, email: data.user.email, nombre: nombre?.trim() || null });
    if (ips_id) await admin.from('usuarios_ips').upsert({ user_id: data.user.id, ips_id, rol: rol || 'auditor' });
    await admin.from('eventos').insert({ ips_id: ips_id ?? null, entidad: 'usuario', entidad_id: data.user.id, accion: 'USUARIO_CREADO', user_id: g.user.id, detalle: { email, rol: rol || 'auditor' } });

    return NextResponse.json({ ok: true, user_id: data.user.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const g = await exigirAdmin();
    if ('error' in g) return g.error;
    const { user_id, password } = (await req.json()) as { user_id: string; password: string };
    if (!user_id || !password || password.length < 8) return NextResponse.json({ error: 'Usuario y contraseña (mínimo 8 caracteres) son obligatorios.' }, { status: 400 });
    const admin = clienteAdmin();
    const { error } = await admin.auth.admin.updateUserById(user_id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from('eventos').insert({ ips_id: null, entidad: 'usuario', entidad_id: user_id, accion: 'CONTRASENA_CAMBIADA', user_id: g.user.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const g = await exigirAdmin();
    if ('error' in g) return g.error;
    const { user_id } = (await req.json()) as { user_id: string };
    if (!user_id) return NextResponse.json({ error: 'Falta user_id.' }, { status: 400 });
    if (user_id === g.user.id) return NextResponse.json({ error: 'No puede eliminar su propio usuario.' }, { status: 400 });
    const admin = clienteAdmin();
    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from('eventos').insert({ ips_id: null, entidad: 'usuario', entidad_id: user_id, accion: 'USUARIO_ELIMINADO', user_id: g.user.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
