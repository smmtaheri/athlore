/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_COACH_DOMAIN?: string;
  readonly VITE_DEV_APP_SURFACE?: string;
  readonly VITE_PUBLIC_DOMAIN?: string;
  readonly VITE_USE_MOCK_API?: string;
  readonly VITE_PUBLIC_REGISTRATION_ENABLED?: string;
  readonly VITE_STUDENT_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
