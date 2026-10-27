import React from "react";
import { COUNTRY_CODES } from "../utils/phoneUtils";
import "./PhoneInputField.css";

/**
 * Reusable Phone Input Component
 * Enforces:
 * 1. Numbers ONLY (letters/symbols stripped on type or paste)
 * 2. Country phone code dropdown (+91, +1, etc.)
 * 3. Configurable max digits (default: 10)
 */
const PhoneInputField = ({
  countryCode = "+91",
  onCountryCodeChange,
  value = "",
  onChange,
  placeholder = "Enter phone number",
  id,
  name,
  disabled = false,
  required = false,
  icon: Icon = null,
  className = "",
  error = false,
  maxLength = 10,
  style = {},
  selectStyle = {},
  inputStyle = {},
}) => {
  const handleDigitsChange = (e) => {
    // Strictly accept only numbers (0-9)
    const onlyDigits = e.target.value.replace(/\D/g, "").slice(0, maxLength);
    onChange(onlyDigits);
  };

  return (
    <div className={`phone-input-group ${className}`} style={style}>
      <div className="phone-country-select-wrapper" style={selectStyle}>
        <select
          value={countryCode}
          onChange={(e) => onCountryCodeChange && onCountryCodeChange(e.target.value)}
          disabled={disabled}
          className="phone-country-select"
          aria-label="Country phone code"
        >
          {COUNTRY_CODES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.flag} {item.code}
            </option>
          ))}
        </select>
      </div>

      <div className="phone-number-input-wrapper">
        {Icon && <Icon size={16} className="phone-input-icon" />}
        <input
          id={id}
          name={name}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={maxLength}
          value={value}
          onChange={handleDigitsChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`phone-number-input ${error ? "error" : ""} ${Icon ? "has-icon" : ""}`}
          style={inputStyle}
          autoComplete="tel-national"
        />
      </div>
    </div>
  );
};

export default PhoneInputField;
