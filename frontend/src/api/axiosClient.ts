import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

const axiosClient = axios.create({
  baseURL,
  withCredentials: true,
});

// Optionally, add interceptors here
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle global errors here if needed
    if (error.response?.status === 401) {
      // Could emit an event or use a callback if we want to force logout globally,
      // but usually context/AuthContext handles the initial check.
    }
    return Promise.reject(error);
  }
);

export default axiosClient;
