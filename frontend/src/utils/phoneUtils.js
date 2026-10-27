export const COUNTRY_CODES = [
  { code: "+91", label: "India (+91)", flag: "🇮🇳" },
  { code: "+1", label: "USA / Canada (+1)", flag: "🇺🇸" },
  { code: "+44", label: "UK (+44)", flag: "🇬🇧" },
  { code: "+60", label: "Malaysia (+60)", flag: "🇲🇾" },
  { code: "+65", label: "Singapore (+65)", flag: "🇸🇬" },
  { code: "+971", label: "UAE (+971)", flag: "🇦🇪" },
  { code: "+966", label: "Saudi Arabia (+966)", flag: "🇸🇦" },
  { code: "+61", label: "Australia (+61)", flag: "🇦🇺" },
  { code: "+49", label: "Germany (+49)", flag: "🇩🇪" },
  { code: "+33", label: "France (+33)", flag: "🇫🇷" },
];

/**
 * Parses any phone string into countryCode and clean digits.
 * Defaults countryCode to +91 if none matched.
 */
export const parsePhoneString = (rawPhone = "", defaultCode = "+91") => {
  if (!rawPhone) return { countryCode: defaultCode, digits: "" };
  const str = String(rawPhone).trim();
  const matched = COUNTRY_CODES.find((c) => str.startsWith(c.code));
  if (matched) {
    const remaining = str.slice(matched.code.length).replace(/\D/g, "").slice(0, 10);
    return { countryCode: matched.code, digits: remaining };
  }
  const allDigits = str.replace(/\D/g, "");
  return { countryCode: defaultCode, digits: allDigits.slice(-10) };
};

/**
 * Formats countryCode and digits into a standard storage string.
 */
export const formatFullPhone = (countryCode = "+91", digits = "") => {
  const cleanDigits = String(digits).replace(/\D/g, "");
  return cleanDigits ? `${countryCode} ${cleanDigits}` : "";
};
