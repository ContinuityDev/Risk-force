import { factionColor, factionName } from "../data/factions";
import type { GameAction } from "../engine/actions";
import { digestHeadline } from "../engine/news";
import type { GameState, NewsItem } from "../engine/state";

interface NewsFeedProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  /** Compact digest overlay after AI phase */
  digest?: boolean;
  onClose: () => void;
}

function groupByTurn(items: NewsItem[]): { turn: number; items: NewsItem[] }[] {
  const map = new Map<number, NewsItem[]>();
  for (const it of items) {
    const list = map.get(it.turn) ?? [];
    list.push(it);
    map.set(it.turn, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([turn, list]) => ({ turn, items: list }));
}

export function NewsFeed({ state, dispatch, digest, onClose }: NewsFeedProps) {
  const items = digest
    ? (state.newsDigest ?? [])
    : [...(state.newsFeed ?? [])].reverse();
  const groups = digest
    ? [{ turn: state.turn, items }]
    : groupByTurn([...(state.newsFeed ?? [])]);

  return (
    <div
      className={`rf-news ${digest ? "rf-news--digest" : "rf-news--history"}`}
      role="dialog"
      aria-modal="true"
      aria-label={digest ? "Theater brief" : "News archive"}
    >
      <div
        className="rf-news__backdrop"
        role="presentation"
        onClick={onClose}
      />
      <article className="rf-news__paper">
        <header className="rf-news__masthead">
          <span className="rf-label">Orbital Wire</span>
          <h2>
            {digest
              ? digestHeadline(items)
              : "Theater Gazette"}
          </h2>
          <p className="rf-news__dateline">
            {digest
              ? `Cycle ${state.turn} · enemy phase complete`
              : `${state.newsFeed?.length ?? 0} dispatches on file`}
          </p>
        </header>

        <div className="rf-news__body">
          {items.length === 0 && (
            <p className="rf-hint">No dispatches yet — end a turn to receive the wire.</p>
          )}
          {digest
            ? items.map((it) => <NewsCard key={it.id} item={it} />)
            : groups.map((g) => (
                <section key={g.turn} className="rf-news__turn">
                  <h3>Turn {g.turn}</h3>
                  {g.items.map((it) => (
                    <NewsCard key={it.id} item={it} />
                  ))}
                </section>
              ))}
        </div>

        <footer className="rf-news__footer">
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (!digest) {
                dispatch({ type: "MARK_NEWS_READ" });
              } else {
                dispatch({ type: "DISMISS_NEWS_DIGEST" });
                dispatch({ type: "MARK_NEWS_READ" });
              }
              onClose();
            }}
          >
            {digest ? "Dismiss brief" : "Close"}
          </button>
        </footer>
      </article>
    </div>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const color = item.factionId ? factionColor(item.factionId) : undefined;
  return (
    <div className={`rf-news__card rf-news__card--${item.category}`}>
      <span className="rf-news__tag">{item.category}</span>
      <h4 style={color ? { color } : undefined}>{item.headline}</h4>
      <p>{item.body}</p>
      {item.factionId && (
        <small className="rf-text-dim">{factionName(item.factionId)}</small>
      )}
    </div>
  );
}
