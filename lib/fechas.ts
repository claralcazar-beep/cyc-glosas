// Días hábiles en Colombia (lunes a viernes sin festivos, Ley 51 de 1983 "Emiliani").
// Todas las fechas se manejan como 'YYYY-MM-DD' interpretadas en America/Bogota.

function utc(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}
function aIso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function sumarDias(d: Date, n: number) {
  return new Date(d.getTime() + n * 86400000);
}
function siguienteLunes(d: Date) {
  const dia = d.getUTCDay(); // 0 dom … 1 lun
  return dia === 1 ? d : sumarDias(d, (8 - dia) % 7);
}

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher)
function pascua(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, mes, dia);
}

const cacheFestivos = new Map<number, Set<string>>();

export function festivosColombia(y: number): Set<string> {
  const c = cacheFestivos.get(y);
  if (c) return c;
  const f = new Set<string>();
  // Fijos
  [[1, 1], [5, 1], [7, 20], [8, 7], [12, 8], [12, 25]].forEach(([m, d]) => f.add(aIso(utc(y, m, d))));
  // Se trasladan al lunes siguiente
  [[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].forEach(([m, d]) => f.add(aIso(siguienteLunes(utc(y, m, d)))));
  // Relativos a Pascua
  const p = pascua(y);
  f.add(aIso(sumarDias(p, -3))); // Jueves Santo
  f.add(aIso(sumarDias(p, -2))); // Viernes Santo
  f.add(aIso(siguienteLunes(sumarDias(p, 39)))); // Ascensión
  f.add(aIso(siguienteLunes(sumarDias(p, 60)))); // Corpus Christi
  f.add(aIso(siguienteLunes(sumarDias(p, 68)))); // Sagrado Corazón
  cacheFestivos.set(y, f);
  return f;
}

export function esHabil(iso: string): boolean {
  const d = new Date(iso + 'T00:00:00Z');
  const dia = d.getUTCDay();
  if (dia === 0 || dia === 6) return false;
  return !festivosColombia(d.getUTCFullYear()).has(iso);
}

// Convierte un timestamp (ISO con zona) a la fecha calendario en Bogotá
export function fechaBogota(timestamp: string | Date): string {
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

export function hoyBogota(): string {
  return fechaBogota(new Date());
}

// Suma n días hábiles a partir de la fecha dada (el conteo empieza el día hábil SIGUIENTE)
export function sumarDiasHabiles(iso: string, n: number): string {
  let d = new Date(iso + 'T00:00:00Z');
  let faltan = n;
  while (faltan > 0) {
    d = sumarDias(d, 1);
    if (esHabil(aIso(d))) faltan--;
  }
  return aIso(d);
}

// Días hábiles entre dos fechas (positivo si b > a; excluye a, incluye b)
export function diasHabilesEntre(a: string, b: string): number {
  if (a === b) return 0;
  const signo = a < b ? 1 : -1;
  let [ini, fin] = signo === 1 ? [a, b] : [b, a];
  let d = new Date(ini + 'T00:00:00Z');
  const limite = new Date(fin + 'T00:00:00Z');
  let n = 0;
  while (d < limite) {
    d = sumarDias(d, 1);
    if (esHabil(aIso(d))) n++;
  }
  void ini; void fin;
  return n * signo;
}

export function formatoFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatoFechaHora(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });
}
