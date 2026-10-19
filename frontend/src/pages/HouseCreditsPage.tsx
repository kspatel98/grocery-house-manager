import {Navigate,useLocation,useParams} from 'react-router-dom';
export default function HouseCreditsPage(){const {houseId}=useParams();const {search}=useLocation();const old=new URLSearchParams(search);const next=new URLSearchParams();next.set('house',houseId||'');if(old.has('payment'))next.set('payment',old.get('payment')||'');return <Navigate replace to={`/wallet?${next.toString()}`}/>;}
