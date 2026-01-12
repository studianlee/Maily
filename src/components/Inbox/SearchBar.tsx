interface SearchBarProps {
  query: string;
  loading: boolean;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onClear: () => void;
}

export function SearchBar({
  query,
  loading,
  onQueryChange,
  onSearch,
  onClear,
}: SearchBarProps) {
  return (
    <div className="search-bar">
      <div className="search-input-wrapper">
        <svg
          className="search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="메일 검색..."
          disabled={loading}
        />
        {query && (
          <button className="search-clear-btn" onClick={onClear}>
            ✕
          </button>
        )}
      </div>
      <button
        className="search-btn"
        onClick={onSearch}
        disabled={loading}
      >
        검색
      </button>
    </div>
  );
}
