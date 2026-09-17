import { useEffect, useState } from "react";
import styles from "./bodyCheck.module.css";

export function BodyCheckPhotoImage({
  alt,
  downloadPhoto,
  photoId
}: {
  alt: string;
  downloadPhoto: (photoId: string) => Promise<Blob>;
  photoId: string;
}) {
  const [loadedForId, setLoadedForId] = useState(photoId);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  if (loadedForId !== photoId) {
    setLoadedForId(photoId);
    setUrl(null);
    setFailed(false);
  }

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    downloadPhoto(photoId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [downloadPhoto, photoId]);

  if (failed) {
    return <p className={styles.photoMeta}>بارگذاری عکس ناموفق بود.</p>;
  }
  if (!url) {
    return <div aria-hidden className={styles.photoPlaceholder} />;
  }
  return <img alt={alt} className={styles.photoImg} src={url} />;
}
