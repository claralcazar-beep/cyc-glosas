'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithPassword({ email, password: clave });
    setCargando(false);
    if (error) {
      setError('Correo o contraseña incorrectos.');
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="tarjeta">
        <div className="mb-6 flex items-center gap-2 text-marca-700">
          <ShieldCheck className="h-7 w-7" />
          <div>
            <div className="text-lg font-semibold">CyC Glosas</div>
            <div className="text-xs text-slate-500">Auditoría de cuentas médicas</div>
          </div>
        </div>
        <form onSubmit={entrar} className="space-y-4">
          <div>
            <label className="etiqueta">Correo</label>
            <input className="campo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <label className="etiqueta">Contraseña</label>
            <input className="campo" type="password" value={clave} onChange={(e) => setClave(e.target.value)} required autoComplete="current-password" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="boton w-full justify-center" disabled={cargando}>{cargando ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <p className="mt-4 text-xs text-slate-400">El registro está deshabilitado. Los usuarios los crea el administrador de CyC Salud en Supabase.</p>
      </div>
    </div>
  );
}
