import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { ambientePublico } from '@/lib/ambiente';
import './globals.css';

/**
 * Sora é a tipografia da marca NewSec — a mesma do site do produto, para
 * que as telas pareçam a mesma família.
 */

export const metadata: Metadata = {
  title: {
    default: ambientePublico.nomeAplicacao,
    template: `%s · ${ambientePublico.nomeAplicacao}`,
  },
  description: 'Central de atendimento de WhatsApp com atendimento humano, IA e automações.',
  // Ferramenta interna não vai para buscador.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#172E3D',
  width: 'device-width',
  initialScale: 1,
};

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans">
        {children}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{ style: { borderRadius: '7px' } }}
        />
      </body>
    </html>
  );
}
