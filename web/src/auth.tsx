import { createContext,useContext,useMemo,useState,type ReactNode } from 'react';
import { api } from './api';
type Auth={token:string|null;login:(email:string,password:string)=>Promise<void>;logout:()=>void};
const Context=createContext<Auth|null>(null);
export function AuthProvider({children}:{children:ReactNode}){const [token,setToken]=useState(sessionStorage.getItem('accessToken'));const value=useMemo(()=>({token,login:async(email:string,password:string)=>{const {data}=await api.post('/auth/login',{email,password});sessionStorage.setItem('accessToken',data.accessToken);setToken(data.accessToken);},logout:()=>{sessionStorage.clear();setToken(null);}}),[token]);return <Context.Provider value={value}>{children}</Context.Provider>}
export const useAuth=()=>{const value=useContext(Context);if(!value)throw new Error('AuthProvider missing');return value};
