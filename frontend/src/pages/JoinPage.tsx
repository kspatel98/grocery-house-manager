import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type { House } from '../types';

export default function JoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Joining house...');

  useEffect(() => {
    async function join() {
      try {
        const { data } = await api.post<House>(`/houses/join/${token}`);
        setMessage(`Joined ${data.name}`);
        navigate(`/houses/${data.id}`);
      } catch (err) {
        setMessage(errorMessage(err));
      }
    }
    join();
  }, [token]);

  return <main className="page shell"><div className="panel">{message}</div></main>;
}
