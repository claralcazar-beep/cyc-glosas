// Credenciales PÚBLICAS de Supabase (proyecto cyc-glosas, organización CyC Salud).
// Son las mismas que viajan al navegador; la clave secreta (sb_secret / service_role) NUNCA va aquí.
// Si en Vercel se definen NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY, esas mandan.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hszfnckftusoydzcdfhy.supabase.co';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable__CXB2e06YkEbwlcy2rhkzA_sCv18DMU';
