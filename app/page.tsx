import { getScoutAgent } from '@/lib/scout/agent';
import Link from 'next/link';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
    const agent = getScoutAgent();
    const rankings = agent.getRankings().slice(0, 15);
    const risers = agent.getTopRisers(5);
    const recentNews = agent.getRecentNews(10);

    return (
        <div className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.headerContent}>
                        <div>
                            <h1 className={styles.title}>Elite Rookie Scouter</h1>
                            <p className={styles.subtitle}>2026 Dynasty Draft Intelligence</p>
                        </div>
                        <button
                            className="btn-neon"
                            onClick={() => window.location.href = '/api/scan'}
                        >
                            🔍 Scan Now
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container">
                <div className={styles.grid}>
                    {/* Top Prospects */}
                    <section className={`glass-card ${styles.mainSection}`}>
                        <div className={styles.sectionHeader}>
                            <h2>🏆 Top 2026 Prospects</h2>
                            <span className="text-muted">Updated Daily</span>
                        </div>

                        <div className={styles.prospectList}>
                            {rankings.map((prospect, index) => (
                                <Link
                                    key={prospect.id}
                                    href={`/prospects/${prospect.id}`}
                                    className={styles.prospectCard}
                                >
                                    <div className={styles.prospectRank}>
                                        {index + 1}
                                    </div>

                                    <div className={styles.prospectInfo}>
                                        <div className={styles.prospectName}>{prospect.name}</div>
                                        <div className={styles.prospectMeta}>
                                            {prospect.school} • {prospect.position}
                                        </div>
                                    </div>

                                    <div className={styles.prospectBadges}>
                                        <span className={`badge badge-${prospect.position.toLowerCase()}`}>
                                            {prospect.position}
                                        </span>
                                        <span className={`badge badge-${prospect.stock}`}>
                                            {prospect.stock === 'rising' && '📈'}
                                            {prospect.stock === 'falling' && '📉'}
                                            {prospect.stock === 'stable' && '➡️'}
                                            {prospect.stock}
                                        </span>
                                    </div>

                                    <div className={styles.prospectGrade}>
                                        <div className={styles.gradeNumber}>{prospect.scoutGrade}</div>
                                        <div className={styles.gradeLabel}>Grade</div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>

                    {/* Sidebar */}
                    <aside className={styles.sidebar}>
                        {/* Stock Watch */}
                        <section className="glass-card">
                            <h3 className={styles.sidebarTitle}>📈 Stock Rising</h3>
                            <div className={styles.stockList}>
                                {risers.map((prospect) => (
                                    <Link
                                        key={prospect.id}
                                        href={`/prospects/${prospect.id}`}
                                        className={styles.stockItem}
                                    >
                                        <div>
                                            <div className={styles.stockName}>{prospect.name}</div>
                                            <div className="text-muted">{prospect.position} • {prospect.school}</div>
                                        </div>
                                        <div className={styles.stockGrade}>{prospect.scoutGrade}</div>
                                    </Link>
                                ))}
                            </div>
                        </section>

                        {/* Recent News */}
                        <section className="glass-card">
                            <h3 className={styles.sidebarTitle}>📰 Latest Intel</h3>
                            <div className={styles.newsList}>
                                {recentNews.length > 0 ? (
                                    recentNews.map((news) => (
                                        <a
                                            key={news.id}
                                            href={news.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={styles.newsItem}
                                        >
                                            <div className={styles.newsTitle}>{news.title}</div>
                                            <div className={styles.newsMeta}>
                                                <span>{news.source}</span>
                                                <span>•</span>
                                                <span>{new Date(news.pubDate).toLocaleDateString()}</span>
                                            </div>
                                        </a>
                                    ))
                                ) : (
                                    <div className={styles.emptyState}>
                                        <p>No recent news. Click "Scan Now" to fetch the latest intel.</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </aside>
                </div>
            </main>

            {/* Footer */}
            <footer className={styles.footer}>
                <div className="container">
                    <p className="text-muted">
                        Elite Rookie Scouter • Powered by AI • Data from Sleeper, FantasyPros, RotoWire
                    </p>
                </div>
            </footer>
        </div>
    );
}
