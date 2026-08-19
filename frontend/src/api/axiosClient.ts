import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { isPwa, getPwaRefreshToken, setPwaRefreshToken, clearPwaRefreshToken } from '../utils/pwa';

const baseURL = import.meta.env.VITE_API_URL || '/api';

const axiosClient = axios.create({
  baseURL,
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

axiosClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Don't intercept refresh / login requests to prevent infinite loops
    const requestUrl = originalRequest?.url || '';
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !requestUrl.includes('/auth/refresh') &&
      !requestUrl.includes('/auth/login')
    ) {
      if (isPwa()) {
        const storedRefreshToken = getPwaRefreshToken();
        if (storedRefreshToken) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            })
              .then(() => axiosClient(originalRequest))
              .catch((err) => Promise.reject(err));
          }

          originalRequest._retry = true;
          isRefreshing = true;

          try {
            const refreshRes = await axios.post(
              `${baseURL}/auth/refresh`,
              { refresh_token: storedRefreshToken },
              { withCredentials: true }
            );

            if (refreshRes.data?.refresh_token) {
              setPwaRefreshToken(refreshRes.data.refresh_token);
            }

            processQueue(null);
            return axiosClient(originalRequest);
          } catch (refreshErr) {
            clearPwaRefreshToken();
            processQueue(new Error('Session refresh failed'));
            return Promise.reject(refreshErr);
          } finally {
            isRefreshing = false;
          }
        }
      }
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
