import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FB Toolkit · Check Live UID & Tải Ảnh Mặt AI',
  description:
    'Công cụ trực tuyến siêu nhanh: Kiểm tra live/die UID Facebook hàng loạt, tự động ghi nhớ UID và tải ảnh mặt AI chân thực từ ThisPersonDoesNotExist.',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0a0e1a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="dark">
      <body className="bg-[#090d18] text-slate-100 antialiased min-h-screen selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
