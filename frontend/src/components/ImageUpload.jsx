import { useRef, useState } from "react";
import { api } from "../lib/api";
import { AuthImage } from "./AuthImage";
import { Upload, Loader2 } from "lucide-react";

export function ImageUpload({ value, onChange, label = "رفع صورة", testId = "image-upload", round = false }) {
  const ref = useRef();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handle = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange(data.path);
    } catch (err) {
      setError("فشل رفع الصورة، حاول مرة ثانية");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
    <div className="flex items-center gap-4">
      <div className={`overflow-hidden hud-panel ${round ? "rounded-full w-20 h-20" : "rounded-sm w-24 h-24"}`}>
        {value ? (
          <AuthImage path={value} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Upload className="w-6 h-6" />
          </div>
        )}
      </div>
      <div>
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 text-sm border border-gold/40 text-gold px-4 py-2 rounded-sm hover:bg-gold/10 transition-colors"
          data-testid={testId}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {label}
        </button>
        <input ref={ref} type="file" accept="image/*" hidden onChange={handle} />
      </div>
    </div>
    {error && <p className="text-alert text-xs mt-2" data-testid="upload-error">{error}</p>}
    </div>
  );
}
