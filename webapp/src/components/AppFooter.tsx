export const AppFooter = ({ className = '' }: { className?: string }) => {
  const currentYear = new Date().getFullYear();

  return (
    <div className={`py-4 mt-auto w-full text-center text-xs text-slate-400 font-medium ${className}`}>
      <p className="mb-0.5">
        HubSight v{__APP_VERSION__}+sha-{__COMMIT_HASH__}.
      </p>
      <p className="text-[11px] text-slate-400/80">
        &copy; {currentYear} by Anh Quoc Tran
      </p>
    </div>
  );
};
