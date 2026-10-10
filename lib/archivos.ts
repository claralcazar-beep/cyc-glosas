// Conversión de archivos de Storage a documentos para la IA (solo servidor)
import type { DocumentoIA } from './ia';

export async function documentoDesdeArchivo(buffer: ArrayBuffer, nombre: string, mime: string, etiqueta: string): Promise<DocumentoIA> {
  const ext = (nombre.split('.').pop() ?? '').toLowerCase();
  const bytes = Buffer.from(buffer);
  if (ext === 'pdf' || mime === 'application/pdf') {
    return { nombre, etiqueta, mime: 'application/pdf', base64: bytes.toString('base64') };
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    const m = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return { nombre, etiqueta, mime: m, base64: bytes.toString('base64') };
  }
  if (['xlsx', 'xls'].includes(ext)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(bytes, { type: 'buffer' });
    const texto = wb.SheetNames.map((h) => `--- Hoja: ${h} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[h])}`).join('\n\n');
    return { nombre, etiqueta, mime: 'text/plain', texto };
  }
  // txt, csv, md, json…
  return { nombre, etiqueta, mime: 'text/plain', texto: bytes.toString('utf8') };
}
