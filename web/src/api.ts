import axios from 'axios';
export const api=axios.create({baseURL:import.meta.env.VITE_API_URL??'/api/v1',timeout:15000});
api.interceptors.request.use((config)=>{const token=sessionStorage.getItem('accessToken');if(token)config.headers.Authorization=`Bearer ${token}`;return config;});
api.interceptors.response.use((r)=>r,async(error)=>{if(error.response?.status===401){sessionStorage.removeItem('accessToken');window.location.assign('/login');}return Promise.reject(error);});
