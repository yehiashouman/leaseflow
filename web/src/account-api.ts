import axios from 'axios';
export const setupSessionKey = 'leaseflow-account-setup';
export const accountApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  timeout: 20000,
  headers: { 'X-Leaseflow-Session': '1' },
});
accountApi.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(setupSessionKey);
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});
