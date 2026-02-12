import type { Metadata } from 'next';
import '@/styles/theme.css';

export const metadata: Metadata = {
    title: 'Elite Rookie Scouter | 2026 Dynasty Draft',
    description: 'AI-powered dynasty fantasy football rookie scouting agent for the 2026 NFL Draft',
    keywords: ['dynasty fantasy football', '2026 NFL Draft', 'rookie scouting', 'Arch Manning'],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>
                <div className="app-container">
                    {children}
                </div>
            </body>
        </html>
    );
}
