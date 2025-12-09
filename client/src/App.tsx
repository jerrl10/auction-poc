import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { AuctionList } from './pages/AuctionList';
import { AuctionDetail } from './pages/AuctionDetail';
import { CreateUser } from './pages/CreateUser';
import { CreateAuction } from './pages/CreateAuction';
import { UserProvider, useUser } from './contexts/UserContext';
import './App.css';

function UserSelector() {
  const { currentUser, allUsers, setCurrentUser } = useUser();

  return (
    <div className="user-selector">
      <label>Acting as:</label>
      <select
        value={currentUser?.id || ''}
        onChange={(e) => {
          const user = allUsers.find(u => u.id === e.target.value);
          setCurrentUser(user || null);
        }}
      >
        <option value="">Guest (view only)</option>
        {allUsers.map(user => (
          <option key={user.id} value={user.id}>{user.name}</option>
        ))}
      </select>
    </div>
  );
}

function Navigation() {
  const location = useLocation();

  return (
    <nav className="app-nav">
      <Link to="/" className={location.pathname === '/' ? 'nav-link active' : 'nav-link'}>
        Auctions
      </Link>
      <Link to="/create-user" className={location.pathname === '/create-user' ? 'nav-link active' : 'nav-link'}>
        Create User
      </Link>
      <Link to="/create-auction" className={location.pathname === '/create-auction' ? 'nav-link active' : 'nav-link'}>
        Create Auction
      </Link>
      <UserSelector />
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <div className="app">
          <header className="app-header">
            <div className="container">
              <div className="header-content">
                <div className="header-text">
                  <h1 className="app-title">Auction POC</h1>
                  <p className="app-subtitle">Live Bidding Platform with Real-time Updates</p>
                </div>
                <Navigation />
              </div>
            </div>
          </header>

          <main className="app-main">
            <Routes>
              <Route path="/" element={<AuctionList />} />
              <Route path="/auction/:id" element={<AuctionDetail />} />
              <Route path="/create-user" element={<CreateUser />} />
              <Route path="/create-auction" element={<CreateAuction />} />
            </Routes>
          </main>

          <footer className="app-footer">
            <div className="container">
              <p>Auction POC</p>
            </div>
          </footer>
        </div>
      </UserProvider>
    </BrowserRouter>
  );
}

export default App;
