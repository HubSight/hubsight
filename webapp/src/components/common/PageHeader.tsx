import React, { isValidElement } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from '@/components/icons';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  /**
   * Lucide icon component or custom ReactNode to be displayed in the standard brand icon box.
   */
  icon?: React.ComponentType<{ size?: number; className?: string }> | React.ReactNode;
  /**
   * Main page title
   */
  title: React.ReactNode;
  /**
   * Optional subtitle or short description
   */
  subtitle?: React.ReactNode;
  /**
   * Optional badge displayed immediately adjacent to the title (e.g. count, status pill)
   */
  badge?: React.ReactNode;
  /**
   * Optional breadcrumbs hierarchy
   */
  breadcrumbs?: BreadcrumbItem[];
  /**
   * Action controls displayed on the right (buttons, search, live status, etc.)
   */
  actions?: React.ReactNode;
  /**
   * Optional sub-bar or navigation tabs rendered underneath the main header row
   */
  children?: React.ReactNode;
  /**
   * Additional custom CSS classes for the outer header container
   */
  className?: string;
}

/**
 * Standardized PageHeader component for all HubSight views.
 * Provides consistent placement, typography, brand icon box, and action slots.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  icon,
  title,
  subtitle,
  badge,
  breadcrumbs,
  actions,
  children,
  className = '',
}) => {
  const renderIcon = () => {
    if (!icon) return null;

    if (isValidElement(icon)) {
      return (
        <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200/80 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
          {icon}
        </div>
      );
    }

    if (typeof icon === 'function') {
      const IconComponent = icon as React.ComponentType<{ size?: number; className?: string }>;
      return (
        <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200/80 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs">
          <IconComponent size={20} />
        </div>
      );
    }

    return null;
  };

  return (
    <header className={`shrink-0 w-full bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 z-10 ${className}`}>
      <div className="px-4 sm:px-6 md:px-8 py-3.5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        {/* Left Slot: Icon + Titles */}
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
          {renderIcon()}

          <div className="min-w-0 flex-1">
            {/* Optional Breadcrumbs */}
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 font-medium mb-1">
                {breadcrumbs.map((item, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  return (
                    <React.Fragment key={idx}>
                      {idx > 0 && <ChevronRight size={12} className="shrink-0 text-slate-300 dark:text-slate-600" />}
                      {item.href && !isLast ? (
                        <Link to={item.href} className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors truncate">
                          {item.label}
                        </Link>
                      ) : (
                        <span className={`truncate ${isLast ? 'text-slate-700 dark:text-slate-300 font-semibold' : ''}`}>
                          {item.label}
                        </span>
                      )}
                    </React.Fragment>
                  );
                })}
              </nav>
            )}

            {/* Title & Badge */}
            <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight truncate">
                {title}
              </h1>
              {badge && <div className="shrink-0 flex items-center">{badge}</div>}
            </div>

            {/* Subtitle */}
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 hidden sm:block font-medium truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right Slot: Actions */}
        {actions && (
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 flex-wrap justify-end">
            {actions}
          </div>
        )}
      </div>

      {/* Optional Sub-row / Navigation Tabs Slot */}
      {children && (
        <div className="border-t border-slate-100 dark:border-slate-800/80">
          {children}
        </div>
      )}
    </header>
  );
};

export default PageHeader;
