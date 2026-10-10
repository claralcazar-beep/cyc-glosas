'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ClipboardList, FileStack, LayoutDashboard, LogOut, Settings2, ShieldCheck } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

const enlaces = [
  { href: '/', texto: 'Tablero', Icono: LayoutDashboard },
  { href: '/actas', texto: 'Actas', Icono: FileStack },
  { href: '/glosas', texto: 'Glosas', Icono: ClipboardList },
  { href: '/catalogos', texto: 'Catálogos', Icono: Settings2 },
];

export default function Nav() {
  const ruta = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [ruta]);

  if (ruta.startsWith('/login')) return null;
  if (ruta.includes('/respuesta')) return null; // vista imprimible sin barra

  return (
    <header className="no-imprimir border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-marca-700">
          <ShieldCheck className="h-6 w-6" />
          <span>CyC Glosas</span>
          <span className="hidden text-xs font-normal text-slate-400 sm:inline">· auditoría de cuentas médicas</span>
        </Link>
        <nav className="flex items-center gap-1">
          {enlaces.map(({ href, texto, Icono }) => {
            const activo = href === '/' ? ruta === '/' : ruta.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${activo ? 'bg-marca-50 text-marca-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Icono className="h-4 w-4" />
                <span className="hidden sm:inline">{texto}</span>
              </Link>
            );
          })}
          <form action="/auth/salir" method="post" className="ml-2 flex items-center gap-2 border-l border-slate-200 pl-3">
            <span className="hidden text-xs text-slate-500 md:inline">{email}</span>
            <button type="submit" title="Cerrar sesión" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
