export function getPaginationState({ page = 1, totalPages = 0, loading = false } = {}) {
  const currentPage = Number.isInteger(page) && page > 0 ? page : 1;
  const pageCount = Number.isInteger(totalPages) && totalPages >= 0 ? totalPages : 0;

  return {
    page: currentPage,
    displayTotalPages: Math.max(1, pageCount),
    previousDisabled: Boolean(loading) || currentPage <= 1,
    nextDisabled: Boolean(loading) || pageCount === 0 || currentPage >= pageCount,
  };
}

export default function Pagination({ page = 1, totalPages = 0, loading = false, onPageChange }) {
  const state = getPaginationState({ page, totalPages, loading });

  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        className="button--secondary"
        type="button"
        disabled={state.previousDisabled}
        onClick={() => onPageChange?.(state.page - 1)}
      >
        Prev
      </button>
      <span className="pagination__label" aria-live="polite">
        Page {state.page} of {state.displayTotalPages}
      </span>
      <button
        className="button--secondary"
        type="button"
        disabled={state.nextDisabled}
        onClick={() => onPageChange?.(state.page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
