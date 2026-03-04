interface EmptyPlaceholderProps {
  type: "sports" | "tcg";
}

export default function EmptyPlaceholder({ type }: EmptyPlaceholderProps) {
  if (type === "sports") {
    return (
      <div className="rounded-2xl bg-card-bg border border-card-border border-dashed p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Sports Cards</h2>
          <span className="text-lg font-bold text-muted">$0.00</span>
        </div>
        <div className="text-center py-4">
          <div className="text-2xl mb-2">⚾🏈🏀🏒</div>
          <p className="text-sm text-muted">No sports cards yet — add your first one!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card-bg border border-card-border border-dashed p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">TCG Cards</h2>
        <span className="text-lg font-bold text-muted">$0.00</span>
      </div>
      <div className="text-center py-4">
        <div className="text-2xl mb-2">⚡🧙‍♂️👹</div>
        <p className="text-sm text-muted">No TCG cards yet — add your first one!</p>
      </div>
    </div>
  );
}
