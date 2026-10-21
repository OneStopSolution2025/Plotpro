import { useState, useEffect } from "react";

/**
 * UserAvatar Component
 * 
 * Renders user profile photo with referrerPolicy="no-referrer" to prevent 403 Forbidden
 * responses on Google CDN images (lh3.googleusercontent.com).
 * 
 * Provides an automatic, graceful fallback to user initials or fallback icon on error or missing image,
 * resetting error state if the src URL changes.
 */
const UserAvatar = ({
  src,
  name = "",
  alt,
  className = "",
  style = {},
  fallbackIcon = null,
}) => {
  const [hasError, setHasError] = useState(false);

  // Reset error state if the image source changes
  useEffect(() => {
    setHasError(false);
  }, [src]);

  // Compute initials fallback (e.g. "Gokul M" -> "G", or "User" -> "U")
  const getInitials = () => {
    if (fallbackIcon) return fallbackIcon;
    const cleanName = (name || "").trim();
    if (!cleanName) return "U";
    return cleanName.charAt(0).toUpperCase();
  };

  const imageAlt = alt || name || "User Avatar";

  if (!src || hasError) {
    return (
      <span
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          ...style,
        }}
      >
        {getInitials()}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={imageAlt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        ...style,
      }}
    />
  );
};

export default UserAvatar;
