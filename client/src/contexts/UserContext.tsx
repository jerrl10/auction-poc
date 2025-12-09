import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '../types';
import { WebSocketEvent } from '../types';
import { auctionApi } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';

interface UserContextType {
  currentUser: User | null;
  allUsers: User[];
  setCurrentUser: (user: User | null) => void;
  loadUsers: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  });
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const ws = useWebSocket();

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    // Listen for new users via WebSocket
    const unsubscribe = ws.on(WebSocketEvent.USER_CREATED, (data: any) => {
      setAllUsers((prev) => [...prev, data.user]);
    });

    return unsubscribe;
  }, [ws]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('currentUser');
    }
  }, [currentUser]);

  async function loadUsers() {
    try {
      const users = await auctionApi.getAllUsers();
      setAllUsers(users);

      // If current user is set but not in the list, clear it
      if (currentUser && !users.find(u => u.id === currentUser.id)) {
        setCurrentUser(null);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }

  return (
    <UserContext.Provider value={{ currentUser, allUsers, setCurrentUser, loadUsers }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}
