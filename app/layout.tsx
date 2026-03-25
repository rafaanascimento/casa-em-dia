import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Casa em Dia',
  description: 'Projeto iniciado'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
