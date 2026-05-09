import axios from "axios";

// src/utils/api.ts
const API_BASE_URL = process.env.REACT_APP_API_URL || 
                     process.env.VITE_API_URL || 
                     'http://192.168.56.104:4000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});