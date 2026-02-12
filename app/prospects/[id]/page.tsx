import { getScoutAgent } from '@/lib/scout/agent';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface ProspectPageProps {
    params: {
        id: string;
    };
}

export default async function ProspectPage({ params }: ProspectPageProps) {
    const agent = getScoutAgent();
    const prospect = agent.getProspect(params.id);

    if (!prospect) {
        notFound();
    }

    const report = await agent.generateScoutReport(params.id);
    const allProspects = agent.getRankings();
    const rank = allProspects.findIndex(p => p.id === params.id) + 1;

    return (
        <div className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className="container">
                    <Link href="/" className={styles.backLink}>
                        ← Back to Rankings
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main className="container">
                <div className={styles.grid}>
                    {/* Prospect Header */}
                    <section className={`glass-card ${styles.heroCard}`}>
                        <div className={styles.heroHeader}>
                            <div>
                                <h1 className={styles.prospectName}>{prospect.name}</h1>
                                <div className={styles.prospectMeta}>
                                    {prospect.school} • {prospect.position} • Class of 2026
                                </div>
                            </div>

                            <div className={styles.rankBadge}>
                                <div className={styles.rankNumber}>#{rank}</div>
                                <div className={styles.rankLabel}>Overall</div>
                            </div>
                        </div>

                        <div className={styles.badges}>
                            <span className={`badge badge-tier-${prospect.tier}`}>
                                Tier {prospect.tier}
                            </span>
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

                        <div className={styles.gradeSection}>
                            <div className={styles.gradeCard}>
                                <div className={styles.gradeLarge}>{prospect.scoutGrade}</div>
                                <div className={styles.gradeTitle}>Scout Grade</div>
                            </div>
                            <div className={styles.gradeCard}>
                                <div className={styles.gradeLarge}>
                                    {prospect.projectedRound || '?'}
                                </div>
                                <div className={styles.gradeTitle}>Proj. Round</div>
                            </div>
                            <div className={styles.gradeCard}>
                                <div className={styles.gradeLarge}>{prospect.newsCount}</div>
                                <div className={styles.gradeTitle}>News Items</div>
                            </div>
                        </div>
                    </section>

                    {/* Scout Report */}
                    {report && (
                        <>
                            <section className="glass-card">
                                <h2 className={styles.sectionTitle}>📋 Scout Report</h2>
                                <p className={styles.summary}>{report.summary}</p>
                            </section>

                            <div className={styles.twoCol}>
                                <section className="glass-card">
                                    <h3 className={styles.sectionTitle}>💪 Strengths</h3>
                                    <ul className={styles.list}>
                                        {report.strengths.map((strength, i) => (
                                            <li key={i} className={styles.listItem}>
                                                <span className={styles.bullet}>✓</span>
                                                {strength}
                                            </li>
                                        ))}
                                    </ul>
                                </section>

                                <section className="glass-card">
                                    <h3 className={styles.sectionTitle}>⚠️ Concerns</h3>
                                    <ul className={styles.list}>
                                        {report.concerns.map((concern, i) => (
                                            <li key={i} className={styles.listItem}>
                                                <span className={styles.bullet}>!</span>
                                                {concern}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            </div>

                            <section className="glass-card">
                                <h3 className={styles.sectionTitle}>🔄 NFL Comparisons</h3>
                                <div className={styles.comparisons}>
                                    {report.comparisons.map((comp, i) => (
                                        <div key={i} className={styles.comparisonCard}>
                                            {comp}
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Recent News */}
                            {report.recentNews.length > 0 && (
                                <section className="glass-card">
                                    <h3 className={styles.sectionTitle}>📰 Recent News</h3>
                                    <div className={styles.newsList}>
                                        {report.recentNews.map((news) => (
                                            <a
                                                key={news.id}
                                                href={news.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={styles.newsItem}
                                            >
                                                <div className={styles.newsHeader}>
                                                    <span className={styles.newsSource}>{news.source}</span>
                                                    <span className={styles.newsDate}>
                                                        {new Date(news.pubDate).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <div className={styles.newsTitle}>{news.title}</div>
                                            </a>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
