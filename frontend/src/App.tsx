import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { checkHealth, getIdea, getIdeas, getIdeasCount } from './api';
import { Idea, IdeaDetail, Performance, TotalReturn } from './types';

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

type LoadState<T> =
  | { status: 'loading'; data?: T; error?: never }
  | { status: 'ready'; data: T; error?: never }
  | { status: 'error'; data?: T; error: string };

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPlainDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getPositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getPageSize(value: string | null) {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
}

function getPageWindow(currentPage: number, totalPages: number) {
  const pages = new Set([1, totalPages]);

  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page >= 1 && page <= totalPages) {
      pages.add(page);
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

function ideaTitle(idea: Idea) {
  return idea.company?.company_name?.trim() || idea.company_id;
}

function normalizeReportText(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function Header() {
  return (
    <header className="shell-header">
      <Link className="brand" to="/">
        VIC Ideas
      </Link>
      <div className="dataset-note">Local dump through Nov 3, 2022</div>
    </header>
  );
}

function App() {
  const [health, setHealth] = useState<LoadState<boolean>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    checkHealth()
      .then(() => {
        if (!cancelled) setHealth({ status: 'ready', data: true });
      })
      .catch((error: Error) => {
        if (!cancelled) setHealth({ status: 'error', error: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (health.status === 'loading') {
    return <FullPageMessage title="Connecting" body="Opening the local ideas database." />;
  }

  if (health.status === 'error') {
    return (
      <FullPageMessage
        title="API unavailable"
        body={`The frontend cannot reach the local API. ${health.error}`}
      />
    );
  }

  return (
    <>
      <Header />
      <main className="shell-main">
        <Routes>
          <Route path="/" element={<IdeasPage />} />
          <Route path="/ideas" element={<IdeasPage />} />
          <Route path="/ideas/:id" element={<IdeaDetailPage />} />
        </Routes>
      </main>
    </>
  );
}

function FullPageMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="full-message">
      <section>
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
    </main>
  );
}

function IdeasPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = getPositiveInt(searchParams.get('page'), 1);
  const pageSize = getPageSize(searchParams.get('pageSize'));
  const query = searchParams.get('q')?.trim() || '';
  const [draftQuery, setDraftQuery] = useState(query);
  const [draftPage, setDraftPage] = useState(String(page));
  const [state, setState] = useState<LoadState<{ ideas: Idea[]; total: number }>>({ status: 'loading' });

  const skip = (page - 1) * pageSize;

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    setDraftPage(String(page));
  }, [page]);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ status: 'loading', data: previous.data }));

    Promise.all([
      getIdeas({ skip, limit: pageSize, search: query || undefined }),
      getIdeasCount(query || undefined),
    ])
      .then(([ideas, count]) => {
        if (!cancelled) setState({ status: 'ready', data: { ideas, total: count.total } });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: 'error', error: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, [skip, pageSize, query]);

  const ideas = state.data?.ideas || [];
  const total = state.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;
  const start = ideas.length ? skip + 1 : 0;
  const end = skip + ideas.length;
  const pageWindow = getPageWindow(page, totalPages);

  function setPage(nextPage: number, nextPageSize = pageSize, nextQuery = query) {
    const safePage = Math.min(Math.max(nextPage, 1), totalPages);
    const next = new URLSearchParams();
    if (safePage > 1) next.set('page', String(safePage));
    if (nextPageSize !== DEFAULT_PAGE_SIZE) next.set('pageSize', String(nextPageSize));
    if (nextQuery) next.set('q', nextQuery);
    setSearchParams(next);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1, pageSize, draftQuery.trim());
  }

  function submitPageJump(event: FormEvent) {
    event.preventDefault();
    const requestedPage = Number(draftPage);

    if (Number.isFinite(requestedPage)) {
      setPage(Math.trunc(requestedPage));
    }
  }

  return (
    <section className="ideas-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Idea archive</p>
          <h1>Investment ideas</h1>
        </div>
        <form className="search-form" onSubmit={submitSearch}>
          <label htmlFor="idea-search">Search</label>
          <div className="search-row">
            <input
              id="idea-search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Ticker, company, author, text"
            />
            <button type="submit">Search</button>
          </div>
        </form>
      </div>

      <div className="list-toolbar">
        <span>
          {state.status === 'loading'
            ? 'Loading'
            : `Showing ${start}-${end} of ${total.toLocaleString()}`}
        </span>
        <label>
          Rows
          <select value={pageSize} onChange={(event) => setPage(1, Number(event.target.value))}>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.status === 'error' ? (
        <div className="notice error">Could not load ideas: {state.error}</div>
      ) : (
        <div className="idea-list" aria-busy={state.status === 'loading'}>
          {ideas.map((idea) => (
            <IdeaListRow key={idea.id} idea={idea} />
          ))}
          {state.status === 'loading' && ideas.length === 0 && <ListSkeleton />}
          {state.status === 'ready' && ideas.length === 0 && (
            <div className="notice">No ideas matched this page.</div>
          )}
        </div>
      )}

      <nav className="pager" aria-label="Idea pagination">
        <button onClick={() => setPage(1)} disabled={!hasPrevious || state.status === 'loading'}>
          First
        </button>
        <button onClick={() => setPage(page - 1)} disabled={!hasPrevious || state.status === 'loading'}>
          Previous
        </button>
        <div className="page-picker" aria-label="Pages">
          {pageWindow.map((pageNumber, index) => (
            <div className="page-slot" key={pageNumber}>
              {index > 0 && pageNumber - pageWindow[index - 1] > 1 && (
                <span className="ellipsis">...</span>
              )}
              <button
                className={pageNumber === page ? 'active' : ''}
                onClick={() => setPage(pageNumber)}
                disabled={pageNumber === page || state.status === 'loading'}
                aria-current={pageNumber === page ? 'page' : undefined}
              >
                {pageNumber}
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => setPage(page + 1)} disabled={!hasNext || state.status === 'loading'}>
          Next
        </button>
        <button onClick={() => setPage(totalPages)} disabled={!hasNext || state.status === 'loading'}>
          Last
        </button>
        <form className="page-jump" onSubmit={submitPageJump}>
          <label htmlFor="page-jump-input">Go to page</label>
          <input
            id="page-jump-input"
            type="number"
            min="1"
            max={totalPages}
            value={draftPage}
            onChange={(event) => setDraftPage(event.target.value)}
            disabled={state.status === 'loading'}
          />
          <span>of {totalPages.toLocaleString()}</span>
          <button type="submit" disabled={state.status === 'loading'}>
            Go
          </button>
        </form>
      </nav>
    </section>
  );
}

function IdeaListRow({ idea }: { idea: Idea }) {
  return (
    <article className="idea-row">
      <div className="idea-main">
        <div className="badges">
          <span className={idea.is_short ? 'badge short' : 'badge long'}>
            {idea.is_short ? 'Short' : 'Long'}
          </span>
          {idea.is_contest_winner && <span className="badge contest">Contest</span>}
          <time>{formatDate(idea.date)}</time>
        </div>
        <Link to={`/ideas/${idea.id}`} className="idea-title">
          {ideaTitle(idea)}
        </Link>
        <div className="idea-meta">
          <span>{idea.company_id}</span>
          <span>{idea.user?.username || idea.user_id}</span>
        </div>
      </div>
      <div className="idea-actions">
        <ReturnPill totalReturn={idea.total_return} />
        <Link to={`/ideas/${idea.id}`} className="open-link" aria-label={`Open ${ideaTitle(idea)}`}>
          Open
        </Link>
      </div>
    </article>
  );
}

function ListSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }, (_, index) => (
        <div className="idea-row skeleton" key={index}>
          <div />
        </div>
      ))}
    </>
  );
}

function IdeaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState<IdeaDetail>>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setState({ status: 'loading' });
    getIdea(id)
      .then((idea) => {
        if (!cancelled) setState({ status: 'ready', data: idea });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: 'error', error: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') {
    return <FullPageMessage title="Loading idea" body="Pulling the local detail record." />;
  }

  if (state.status === 'error') {
    return <FullPageMessage title="Idea unavailable" body={state.error} />;
  }

  const idea = state.data;

  return (
    <article className="detail-page">
      <button className="back-button" onClick={() => navigate(-1)}>
        Back
      </button>

      <header className="detail-header">
        <div>
          <p className="eyebrow">{idea.company_id}</p>
          <h1>{ideaTitle(idea)}</h1>
          <div className="detail-meta">
            <span>{idea.is_short ? 'Short' : 'Long'}</span>
            {idea.is_contest_winner && <span>Contest winner</span>}
            <span>{formatPlainDate(idea.date)}</span>
            <span>{idea.user?.username || idea.user_id}</span>
          </div>
        </div>
      </header>

      <div className="detail-grid">
        <section className="detail-copy">
          <h2>Thesis</h2>
          <ReadableText text={idea.description?.description} empty="No thesis text in the dump." />

          <h2>Catalysts</h2>
          <ReadableText text={idea.catalysts?.catalysts} empty="No catalysts text in the dump." />
        </section>

        <aside className="detail-side">
          <h2>QuickFS total return</h2>
          <TotalReturnPanel totalReturn={idea.total_return} />

          <h2>Performance</h2>
          <PerformanceTable performance={idea.performance} isShort={idea.is_short} />
        </aside>
      </div>
    </article>
  );
}

function ReadableText({ text, empty }: { text?: string; empty: string }) {
  const normalizedText = text ? normalizeReportText(text) : '';

  if (!normalizedText) {
    return <p className="empty-copy">{empty}</p>;
  }

  return <div className="readable-text">{normalizedText}</div>;
}

function ReturnPill({ totalReturn }: { totalReturn?: TotalReturn | null }) {
  if (!totalReturn) {
    return <div className="return-pill empty">n/a</div>;
  }

  const value = totalReturn.annualized_idea_return_pct;
  const className = value >= 0 ? 'positive' : 'negative';

  return (
    <div className={`return-pill ${className}`}>
      <span>Annual</span>
      <strong>{formatPercent(value)}</strong>
    </div>
  );
}

function TotalReturnPanel({ totalReturn }: { totalReturn?: TotalReturn | null }) {
  if (!totalReturn) {
    return (
      <div className="return-panel">
        <p className="empty-copy">No QuickFS match for this idea ticker.</p>
      </div>
    );
  }

  return (
    <div className="return-panel">
      <div className="return-hero">
        <span>Annual idea return</span>
        <strong className={totalReturn.annualized_idea_return_pct >= 0 ? 'positive' : 'negative'}>
          {formatPercent(totalReturn.annualized_idea_return_pct)}
        </strong>
      </div>
      <dl className="return-facts">
        <div>
          <dt>Total idea return</dt>
          <dd>{formatPercent(totalReturn.idea_total_return_pct)}</dd>
        </div>
        <div>
          <dt>Stock return</dt>
          <dd>{formatPercent(totalReturn.stock_total_return_pct)}</dd>
        </div>
        <div>
          <dt>Years held</dt>
          <dd>{formatYears(totalReturn.periods_held)}</dd>
        </div>
        <div>
          <dt>Start</dt>
          <dd>
            {totalReturn.start_period} at {formatMoney(totalReturn.start_price)}
          </dd>
        </div>
        <div>
          <dt>End</dt>
          <dd>
            {totalReturn.end_period} at {formatMoney(totalReturn.end_price)}
          </dd>
        </div>
        <div>
          <dt>Dividends</dt>
          <dd>{formatMoney(totalReturn.dividends)}</dd>
        </div>
      </dl>
      <p className="return-note">{totalReturn.calculation_note}</p>
    </div>
  );
}

function PerformanceTable({ performance, isShort }: { performance?: Performance | null; isShort: boolean }) {
  const rows = useMemo(
    () => [
      ['1 week', performance?.oneWeekClosePerf],
      ['2 weeks', performance?.twoWeekClosePerf],
      ['1 month', performance?.oneMonthPerf],
      ['3 months', performance?.threeMonthPerf],
      ['6 months', performance?.sixMonthPerf],
      ['1 year', performance?.oneYearPerf],
      ['2 years', performance?.twoYearPerf],
      ['3 years', performance?.threeYearPerf],
      ['5 years', performance?.fiveYearPerf],
    ],
    [performance],
  );

  if (!performance) {
    return <p className="empty-copy">No performance row for this idea.</p>;
  }

  return (
    <table className="performance-table">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th>{label}</th>
            <td>{formatPerformance(value as number | null | undefined, isShort)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatPerformance(value: number | null | undefined, isShort: boolean) {
  if (value == null) return 'n/a';
  const adjusted = isShort ? -value : value;
  return formatPercent(adjusted);
}

function formatPercent(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 2 : 3,
  }).format(value);
}

function formatYears(periodsHeld: number) {
  return `${(periodsHeld / 4).toFixed(1)} years`;
}

export default App;
