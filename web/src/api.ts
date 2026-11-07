import axios from 'axios';
import { sessionKey } from './session';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  timeout: 15000,
});
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(sessionKey);
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.endsWith('/auth/login')) {
      sessionStorage.removeItem(sessionKey);
      window.dispatchEvent(new Event('leaseflow:unauthorized'));
    }
    return Promise.reject(error);
  },
);
