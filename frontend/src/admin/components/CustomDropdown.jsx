import React, { useState, useRef, useEffect } from "react";
import { FaChevronDown } from "react-icons/fa";
import "./CustomDropdown.css";

/**
 * CustomDropdown Component
 * 
 * Replaces native <select> elements across Admin and Super Admin dashboards
 * with a sleek, accessible, search/grouping capable dropdown styled with
 * PlotPro's #a63d2f terracotta & warm clay theme.
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
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

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
      setIsOpen((prev) => !prev);
    }
  };

  // Group options if any option has a group property
  const hasGroups = parsedOptions.some((opt) => !!opt.group);

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
          className="custom-dropdown-menu"
          role="listbox"
          onClick={(e) => e.stopPropagation()}
        >
          {hasGroups ? (
            (() => {
              const groups = {};
              parsedOptions.forEach((opt) => {
                const g = opt.group || "General";
                if (!groups[g]) groups[g] = [];
                groups[g].push(opt);
              });

              return Object.entries(groups).map(([groupName, groupOpts]) => (
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
                        {opt.label}
                      </div>
                    );
                  })}
                </div>
              ));
            })()
          ) : (
            parsedOptions.map((opt, idx) => {
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
                  {opt.label}
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
