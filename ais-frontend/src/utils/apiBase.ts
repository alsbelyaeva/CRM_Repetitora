const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function getApiUrl() {
  const envUrl = import.meta.env.VITE_API_URL
    ? trimTrailingSlash(String(import.meta.env.VITE_API_URL).replace(/^['"]|['"]$/g, ''))
    : '';

  if (typeof window === 'undefined') {
    return envUrl || 'http://localhost:4000';
  }

  const hostname = window.location.hostname;
  const isLocalPage = LOCAL_HOSTS.includes(hostname);
  const envIsLocal = envUrl.includes('localhost') || envUrl.includes('127.0.0.1');

  if (!isLocalPage && (!envUrl || envIsLocal)) {
    return `${window.location.protocol}//${hostname}:4000`;
  }

  return envUrl || 'http://localhost:4000';
}

export const API_URL = getApiUrl();
