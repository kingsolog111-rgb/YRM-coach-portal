import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { User } from "lucide-react";

export function AuthImage({ path, alt = "", className = "", fallbackClassName = "" }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url;
    let active = true;
    if (!path) {
      setFailed(true);
      return;
    }
    setFailed(false);
    api
      .get(`/files/${path}`, { responseType: "blob" })
      .then((res) => {
        if (!active) return;
        url = URL.createObjectURL(res.data);
        setSrc(url);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  if (failed || !path)
    return (
      <div
        className={`flex items-center justify-center bg-[#0E1117] text-muted-foreground ${className} ${fallbackClassName}`}
        data-testid="auth-image-fallback"
      >
        <User className="w-1/2 h-1/2 opacity-40" />
      </div>
    );
  if (!src)
    return <div className={`bg-[#0E1117] animate-pulse ${className}`} />;
  return <img src={src} alt={alt} className={className} data-testid="auth-image" />;
}
