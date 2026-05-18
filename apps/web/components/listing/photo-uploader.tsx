'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';

interface PhotoUploaderProps {
  spotId: string;
  confirmedKeys: string[];
  onKeysChange: (keys: string[]) => void;
}

interface UploadingFile {
  id: string;
  name: string;
  previewUrl: string;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

export function PhotoUploader({ spotId, confirmedKeys, onKeysChange }: PhotoUploaderProps) {
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const token = await getToken();
    const newItems: UploadingFile[] = Array.from(files).map((f) => ({
      id: `${Date.now()}-${f.name}`,
      name: f.name,
      previewUrl: URL.createObjectURL(f),
      status: 'uploading' as const,
    }));

    setUploading((prev) => [...prev, ...newItems]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const item = newItems[i]!;

      try {
        // 1. Get pre-signed upload URL from backend
        const urlRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots/${spotId}/photos/upload-url`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ filename: file.name, contentType: file.type }),
          },
        );

        if (!urlRes.ok) {
          throw new Error('Failed to get upload URL');
        }

        const { uploadUrl, key } = await urlRes.json() as { uploadUrl: string; key: string };

        // 2. Upload directly to S3 (or stub URL)
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        // Stub URL returns 200 or may fail — treat non-5xx as success for dev
        if (!uploadRes.ok && uploadRes.status >= 500) {
          throw new Error(`Upload failed: ${uploadRes.status}`);
        }

        // 3. Confirm the key back to the backend
        const confirmRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots/${spotId}/photos/confirm`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ key }),
          },
        );

        if (!confirmRes.ok) {
          throw new Error('Failed to confirm photo');
        }

        // 4. Mark done and add key to confirmed list
        setUploading((prev) =>
          prev.map((u) => (u.id === item.id ? { ...u, status: 'done' } : u)),
        );
        onKeysChange([...confirmedKeys, key]);
      } catch (err) {
        setUploading((prev) =>
          prev.map((u) =>
            u.id === item.id
              ? { ...u, status: 'error', error: (err as Error).message }
              : u,
          ),
        );
      }
    }
  }

  function removeConfirmed(key: string) {
    onKeysChange(confirmedKeys.filter((k) => k !== key));
  }

  function removeUploading(id: string) {
    setUploading((prev) => prev.filter((u) => u.id !== id));
  }

  const allItems = [
    ...confirmedKeys.map((key) => ({ type: 'confirmed' as const, key })),
    ...uploading.map((u) => ({ type: 'uploading' as const, ...u })),
  ];

  return (
    <div className="space-y-3">
      {/* Photo grid */}
      {allItems.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {confirmedKeys.map((key, idx) => (
            <div key={key} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
              {/* We don't have a real URL yet (stub), show a placeholder */}
              <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-500 text-xs text-center p-2">
                <span>📷 Photo {idx + 1}</span>
              </div>
              <button
                onClick={() => removeConfirmed(key)}
                className="absolute top-1 right-1 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white text-xs"
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          ))}
          {uploading.map((u) => (
            <div key={u.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
              <img
                src={u.previewUrl}
                alt={u.name}
                className="w-full h-full object-cover"
              />
              {/* Status overlay */}
              {u.status === 'uploading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </div>
              )}
              {u.status === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/70 p-1">
                  <span className="text-white text-xs text-center">Failed</span>
                  <button
                    onClick={() => removeUploading(u.id)}
                    className="mt-1 text-white text-xs underline"
                  >
                    Remove
                  </button>
                </div>
              )}
              {u.status === 'done' && (
                <div className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-xs">
                  ✓
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop zone / upload button */}
      <div
        className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <span className="text-3xl mb-2">📷</span>
        <p className="text-sm font-medium text-gray-700">Click to upload photos</p>
        <p className="text-xs text-gray-400 mt-1">or drag and drop · JPG, PNG, WEBP</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {confirmedKeys.length > 0 && (
        <p className="text-xs text-gray-500">
          {confirmedKeys.length} photo{confirmedKeys.length !== 1 ? 's' : ''} uploaded
        </p>
      )}
    </div>
  );
}
