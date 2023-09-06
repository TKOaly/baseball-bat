export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
export const APP_URL = import.meta.env.VITE_APP_URL;

if (!BACKEND_URL || !APP_URL) {
  throw new Error('Vite is missing environment variables');
}
