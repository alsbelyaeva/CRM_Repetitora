const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

function isPrivateNetworkHost(hostname: string) {
  return (
    LOCAL_HOSTS.includes(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
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
  const envHostname = getHostname(envUrl);
  const envIsDevHost = isPrivateNetworkHost(envHostname);

  if (isLocalPage && (!envUrl || envIsDevHost)) {
    return '';
  }

  if (!isLocalPage && (!envUrl || envIsDevHost)) {
    return '';
  }

  return envUrl || 'http://localhost:4000';
}

export const API_URL = getApiUrl();
