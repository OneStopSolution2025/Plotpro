import React, { useState, useRef, useEffect, useMemo } from "react";
import { FaChevronDown, FaSearch } from "react-icons/fa";
import "./CustomDropdown.css";

/**
 * CustomDropdown Component
 *
 * Replaces native <select> elements across Admin and Super Admin dashboards
 * with a sleek, accessible, search/grouping capable dropdown styled with
 * PlotPro's #a63d2f terracotta & warm clay theme.
 *
 * Pass `searchable` to enable type-to-search filtering (with highlighted
 * matches) inside the menu — useful for long lists such as districts.
 */
const CustomDropdown = ({
  value,
  onChange,
  options = [],
  children,
  placeholder = "Select an option",
  name,
  disabled = false,
  className = "",
  id,
  style,
  searchable = false,
  searchPlaceholder = "Type to search…",
  direction = "auto", // 'auto' | 'top' | 'bottom'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState(direction === "top" ? "top" : "bottom");
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const menuRef = useRef(null);

  // Parse options from props or children if children are provided
  const parsedOptions = React.useMemo(() => {
    if (options && options.length > 0) {
      return options;
    }

    const items = [];
    if (children) {
      const processChild = (child, currentGroup = "") => {
        if (!child) return;

        // Support React Fragment: <> ... </> or React.Fragment
        if (child.type === React.Fragment) {
          React.Children.forEach(child.props.children, (fragChild) => processChild(fragChild, currentGroup));
          return;
        }

        // Support direct array of elements
        if (Array.isArray(child)) {
          child.forEach((item) => processChild(item, currentGroup));
          return;
        }

        if (child.type === "option") {
          items.push({
            value: child.props.value !== undefined ? child.props.value : child.props.children,
            label: child.props.children,
            group: currentGroup,
            disabled: child.props.disabled,
          });
        } else if (child.type === "optgroup") {
          const groupLabel = child.props.label || "";
          React.Children.forEach(child.props.children, (opt) => {
            processChild(opt, groupLabel);
          });
        }
      };

      React.Children.forEach(children, (child) => processChild(child));
    }
    return items;
  }, [options, children]);

  // Filter visible options while searching (case-insensitive substring match)
  const activeQuery = searchable ? query.trim() : "";
  const visibleOptions = useMemo(() => {
    if (!activeQuery) return parsedOptions;
    const q = activeQuery.toLowerCase();
    return parsedOptions.filter((opt) =>
      String(opt.label ?? "").toLowerCase().includes(q)
    );
  }, [parsedOptions, activeQuery]);

  // Find currently selected option
  const selectedOption = parsedOptions.find(
    (opt) => value !== undefined && value !== null && String(opt.value) === String(value)
  );

  const isPlaceholderActive =
    !selectedOption ||
    selectedOption.value === "" ||
    selectedOption.value === null;

  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Clear the query whenever the menu closes; focus the search box when it opens
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    } else if (searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  // Handle option select
  const handleSelect = (e, option) => {
    // Prevent event bubbling so parent labels or containers don't re-trigger toggle
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (option.disabled || disabled) return;

    // Immediately close dropdown
    setIsOpen(false);

    if (onChange) {
      const syntheticEvent = {
        target: {
          name: name || id || "",
          value: option.value,
        },
      };
      onChange(syntheticEvent);
    }
  };

  const handleToggleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      if (!isOpen) {
        if (direction === "top") {
          setPlacement("top");
        } else if (direction === "bottom") {
          setPlacement("bottom");
        } else if (dropdownRef.current) {
          const rect = dropdownRef.current.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceAbove = rect.top;
          let containerSpaceBelow = spaceBelow;
          const scrollParent = dropdownRef.current.closest(".sa-modal-body-scroll, .sa-modal-body, .modal-body");
          if (scrollParent) {
            const parentRect = scrollParent.getBoundingClientRect();
            containerSpaceBelow = parentRect.bottom - rect.bottom;
          }

          const estimatedMenuHeight = Math.min(250, (visibleOptions.length || 4) * 40 + (searchable ? 50 : 20));
          if (containerSpaceBelow < estimatedMenuHeight && spaceAbove > containerSpaceBelow) {
            setPlacement("top");
          } else {
            setPlacement("bottom");
          }
        }
      }
      setIsOpen((prev) => !prev);
    }
  };

  // Keys typed inside the search box: Enter picks the first match,
  // Escape closes. preventDefault also keeps the key from submitting
  // any surrounding <form>.
  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const first = visibleOptions.find((opt) => !opt.disabled);
      if (first) {
        handleSelect(null, first);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    }
  };

  // Wrap every occurrence of the query inside the label with a highlight mark
  const highlightLabel = (label, q) => {
    if (!q || typeof label !== "string") return label;
    const lower = label.toLowerCase();
    const ql = q.toLowerCase();
    const parts = [];
    let cursor = 0;
    let idx;
    while ((idx = lower.indexOf(ql, cursor)) !== -1) {
      if (idx > cursor) parts.push(label.slice(cursor, idx));
      parts.push(
        <mark key={idx} className="custom-dropdown-highlight">
          {label.slice(idx, idx + ql.length)}
        </mark>
      );
      cursor = idx + ql.length;
    }
    if (cursor < label.length) parts.push(label.slice(cursor));
    return parts;
  };

  // Group options if any option has a group property
  const hasGroups = activeQuery
    ? visibleOptions.some((opt) => !!opt.group)
    : parsedOptions.some((opt) => !!opt.group);

  return (
    <div
      ref={dropdownRef}
      className={`custom-admin-dropdown ${className} ${isOpen ? "open" : ""} ${
        disabled ? "disabled" : ""
      }`}
      style={style}
      id={id}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="custom-dropdown-toggle"
        onClick={handleToggleClick}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`custom-dropdown-label ${isPlaceholderActive ? "is-placeholder" : ""}`}>
          {displayLabel}
        </span>
        <FaChevronDown className={`custom-dropdown-arrow ${isOpen ? "rotated" : ""}`} />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={`custom-dropdown-menu ${placement === "top" ? "placement-top" : "placement-bottom"}`}
          role="listbox"
          onClick={(e) => e.stopPropagation()}
        >
          {searchable && (
            <div className="custom-dropdown-search">
              <FaSearch className="custom-dropdown-search-icon" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                autoComplete="off"
                spellCheck={false}
                aria-label="Search options"
              />
            </div>
          )}

          {visibleOptions.length === 0 ? (
            <div className="custom-dropdown-empty">No results found</div>
          ) : hasGroups ? (
            (() => {
              const groups = {};
              visibleOptions.forEach((opt) => {
                const g = opt.group || "General";
                if (!groups[g]) groups[g] = [];
                groups[g].push(opt);
              });

              return Object.entries(groups).map(([groupName, groupOpts]) =>
                groupOpts.length === 0 ? null : (
                  <div key={groupName} className="custom-dropdown-group">
                    {groupName !== "General" && (
                      <div className="custom-dropdown-group-header">{groupName}</div>
                    )}
                    {groupOpts.map((opt, idx) => {
                      const isSelected = String(opt.value) === String(value);
                      return (
                        <div
                          key={`${opt.value}-${idx}`}
                          className={`custom-dropdown-item ${isSelected ? "selected" : ""} ${
                            opt.disabled ? "disabled" : ""
                          }`}
                          onClick={(e) => handleSelect(e, opt)}
                          role="option"
                          aria-selected={isSelected}
                        >
                          {highlightLabel(opt.label, activeQuery)}
                        </div>
                      );
                    })}
                  </div>
                )
              );
            })()
          ) : (
            visibleOptions.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <div
                  key={`${opt.value}-${idx}`}
                  className={`custom-dropdown-item ${isSelected ? "selected" : ""} ${
                    opt.disabled ? "disabled" : ""
                  }`}
                  onClick={(e) => handleSelect(e, opt)}
                  role="option"
                  aria-selected={isSelected}
                >
                  {highlightLabel(opt.label, activeQuery)}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default CustomDropdown;
